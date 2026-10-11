import type { EngineInterface, Register } from 'claude-code'

import type { PromptEnhancerState } from '../types'
import type { Io } from './lib/io'
import { listSkills } from './lib/skills'
import {
  BUSY_TEXT,
  EMPTY_PREFIX_TEXT,
  EMPTY_STATE,
  HELD_TEXT,
  MAX_TOKENS,
  MODEL,
  NOT_IN_FORM,
  PREFIX,
  STARTED_TEXT,
  SYSTEM,
  TIMEOUT_MS,
  USAGE_TEXT,
  buildPrompt,
  capReason,
  clipForToast,
  detectHold,
  failureText,
  formatRewrite,
  parseRewrite,
  skillsNoteFor,
  usageTotal,
} from './logic'
import type { FailedModelResult, SkillBrief } from './logic'

const session = { plugin: 'prompt-enhancer', key: 'session' } as const

// Copy of makeIo in _shared/hooks/register.ts: `$` can only be followed into a function of the
// same file, and `$.env.get` needs literal names.
const makeIo = ($: EngineInterface): Io => ({
  fs: {
    read: path => $.fs.read(path),
    exists: path => $.fs.exists(path),
    list: path => $.fs.list(path),
    stat: path => $.fs.stat(path),
  },
  http: { fetch: (url, init) => $.http.fetch(url, init) },
  process: { run: (argv, init) => $.process.run(argv, init) },
  clock: { sleep: (ms, options) => $.clock.sleep(ms, options) },
  env: {
    OS: () => $.env.get('OS'),
    USERPROFILE: () => $.env.get('USERPROFILE'),
    HOME: () => $.env.get('HOME'),
    HOMEDRIVE: () => $.env.get('HOMEDRIVE'),
    HOMEPATH: () => $.env.get('HOMEPATH'),
    TMPDIR: () => $.env.get('TMPDIR'),
    TEMP: () => $.env.get('TEMP'),
    TMP: () => $.env.get('TMP'),
    HINDSIGHT_CHANNEL_ID: () => $.env.get('HINDSIGHT_CHANNEL_ID'),
    HINDSIGHT_USER_ID: () => $.env.get('HINDSIGHT_USER_ID'),
  },
})

async function getState($: EngineInterface): Promise<PromptEnhancerState> {
  const { value } = await $.state.get(session)
  return value ?? EMPTY_STATE
}

async function patch($: EngineInterface, change: Partial<PromptEnhancerState>): Promise<PromptEnhancerState> {
  const next = { ...(await getState($)), ...change }
  await $.state.set(session, next)
  return next
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : 'unknown error')

async function tryFill($: EngineInterface, text: string): Promise<boolean> {
  try {
    return (await $.prompt.fill({ text })).isFilled
  } catch {
    return false
  }
}

/** Puts the user's text back in the box and says, in a toast, whether that worked. */
async function restore($: EngineInterface, original: string, why: string): Promise<void> {
  const isBack = await tryFill($, original)
  $.ui.toast(
    isBack
      ? `${why} Your text is back in the prompt box.`
      : `${why} Your text could not be put back in the prompt box. It was: ${clipForToast(original)}`,
  )
}

async function readSkills($: EngineInterface): Promise<{ skills: SkillBrief[] | null; note: string | null }> {
  try {
    const cwd = await $.session.cwd()
    const list = await listSkills(makeIo($), cwd)
    const skills = list.skills.map(s => ({ name: s.name, description: s.description }))
    const note = skillsNoteFor(skills.length, list.errors, null)
    return { skills: note === null ? skills : null, note }
  } catch (error) {
    return { skills: null, note: skillsNoteFor(0, [], messageOf(error)) }
  }
}

async function runRewrite($: EngineInterface, requestId: number, original: string, task: string): Promise<void> {
  const { skills, note: skillsNote } = await readSkills($)

  let reply: string | null = null
  let spent = 0
  let failure: string | null = null
  try {
    const result = await $.model.complete({
      model: MODEL,
      system: SYSTEM,
      prompt: buildPrompt(task, skills),
      maxTokens: MAX_TOKENS,
      effort: 'low',
      timeoutMs: TIMEOUT_MS,
    })
    spent = usageTotal(result.usage)
    if (result.isAnswered) reply = result.text
    else failure = failureText(result as FailedModelResult)
  } catch (error) {
    failure = `The rewrite could not run (${messageOf(error)}).`
  }

  const parts = reply === null ? null : parseRewrite(reply, skills === null ? null : skills.map(s => s.name))
  if (failure === null && parts === null) failure = NOT_IN_FORM

  const state = await getState($)
  const tokens = state.tokens + spent
  if (state.requestId !== requestId || state.phase !== 'working') {
    await patch($, { tokens })
    return
  }

  if (failure !== null || parts === null) {
    await patch($, { phase: 'idle', original: '', note: null, tokens })
    await restore($, original, failure ?? NOT_IN_FORM)
    return
  }

  // When the skills could not be read the list says so instead of naming skills.
  const shown = skillsNote === null ? parts : { ...parts, skills: [skillsNote] }
  await patch($, { phase: 'ready', text: formatRewrite(shown), parts: shown, note: null, tokens })
}

/** Starts a rewrite. Returns why it could not start, or null once it is under way. */
async function launch($: EngineInterface, original: string, task: string): Promise<string | null> {
  const state = await getState($)
  if (state.phase !== 'idle') return BUSY_TEXT
  const capped = capReason(state)
  if (capped !== null) return capped

  const requestId = state.requestId + 1
  await patch($, {
    phase: 'working',
    requestId,
    original,
    text: '',
    parts: null,
    note: null,
    count: state.count + 1,
  })
  // A timer runs as a dispatch of its own, so the work outlives the hook that started it.
  $.clock.after(0, () => {
    void runRewrite($, requestId, original, task).catch(() => undefined)
  })
  return null
}

async function useRewrite($: EngineInterface): Promise<void> {
  const state = await getState($)
  if (state.phase !== 'ready') return
  let failure: string | null = null
  try {
    const result = await $.prompt.submit({ text: state.text, asUser: true })
    if (result.drop !== undefined) failure = result.drop
  } catch (error) {
    failure = messageOf(error)
  }
  if (failure === null) {
    await patch($, { phase: 'idle', original: '', text: '', parts: null, note: null })
    return
  }
  $.ui.toast(`Not sent: ${failure}`)
  await patch($, { note: 'It was not sent. Try Use again, or Edit to put it in the box.' })
}

async function editRewrite($: EngineInterface): Promise<void> {
  const state = await getState($)
  if (state.phase !== 'ready') return
  if (await tryFill($, state.text)) {
    await patch($, { phase: 'idle', original: '', text: '', parts: null, note: null })
    return
  }
  $.ui.toast('The rewrite could not be put in the prompt box. Try Edit again in a moment.')
  await patch($, { note: 'It could not be put in the box. Try Edit again.' })
}

async function cancelRewrite($: EngineInterface): Promise<void> {
  const state = await getState($)
  if (state.phase === 'idle') return
  if (await tryFill($, state.original)) {
    await patch($, {
      phase: 'idle',
      requestId: state.requestId + 1,
      original: '',
      text: '',
      parts: null,
      note: null,
    })
    return
  }
  $.ui.toast(`Your text could not be put back in the prompt box. It was: ${clipForToast(state.original)}`)
  await patch($, { note: 'Your text could not be put back in the box. Try Cancel again.' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'enhance',
      description: 'Rewrite a rough prompt into a clear one; you choose Use, Edit or Cancel',
      argumentHint: '<rough prompt>',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'enhance' }, async ($, e) => {
    const task = e.args.trim()
    if (task === '') return { text: USAGE_TEXT }
    const refusal = await launch($, task, task)
    return { text: refusal ?? STARTED_TEXT }
  })

  on('prompt.submit', async ($, e, next) => {
    const hold = detectHold(e.text, e.origin.kind)
    if (hold === null) return next(e)
    if (hold.kind === 'empty') return { drop: EMPTY_PREFIX_TEXT }

    const refusal = await launch($, e.text, hold.task)
    if (refusal !== null) {
      $.clock.after(0, () => {
        void restore($, e.text, refusal).catch(() => undefined)
      })
      return { drop: refusal }
    }
    return { drop: HELD_TEXT }
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    // Fail closed only for a "++ " prompt; every other prompt goes through untouched.
    return e.text.startsWith(PREFIX) ? { drop: 'Prompt Enhancer could not run, so the prompt was not sent. Try again.' } : next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const state = await getState($)
    if (state.phase === 'idle') return below

    const { Box, Text, Button } = $.ui.resolve(e)
    const parts = state.parts

    const mine =
      state.phase === 'working' || parts === null ? (
        <Box key="prompt-enhancer" gap={1}>
          <Text>Rewriting your prompt...</Text>
          <Button key="cancel" label="Cancel" onPress={() => cancelRewrite($)} />
        </Box>
      ) : (
        <Box key="prompt-enhancer" flexDirection="column">
          <Text bold>Rewritten prompt</Text>
          <Text wrap="wrap">{parts.task}</Text>
          <Text dimColor>Load these skills:</Text>
          {(parts.skills.length > 0 ? parts.skills : ['No skills needed.']).map((line, i) => (
            <Text key={`skill:${i}`} wrap="wrap">{`- ${line}`}</Text>
          ))}
          <Text dimColor>Ask me first about:</Text>
          {(parts.ask.length > 0 ? parts.ask : ['Nothing big. Go ahead.']).map((line, i) => (
            <Text key={`ask:${i}`} wrap="wrap">{`- ${line}`}</Text>
          ))}
          <Text dimColor>Done when:</Text>
          {parts.done.map((line, i) => (
            <Text key={`done:${i}`} wrap="wrap">{`- ${line}`}</Text>
          ))}
          {state.note !== null && <Text color="warning">{state.note}</Text>}
          <Box gap={1}>
            <Button key="use" label="Use" variant="primary" onPress={() => useRewrite($)} />
            <Button key="edit" label="Edit" onPress={() => editRewrite($)} />
            <Button key="cancel" label="Cancel" onPress={() => cancelRewrite($)} />
          </Box>
        </Box>
      )

    return below ? (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    ) : (
      mine
    )
  })
}

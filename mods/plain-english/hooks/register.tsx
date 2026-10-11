import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  CHECK_MAX_TOKENS,
  CHECK_MODEL,
  CHECK_SYSTEM,
  CHECK_TIMEOUT_MS,
  EMPTY_STATE,
  SECTION_ID,
  SECTION_TEXT,
  addTool,
  bandText,
  checkPrompt,
  firstWords,
  isCheckable,
  isUnderCaps,
  parseBandCommand,
  parseVerdict,
  removeTool,
  statusText,
  usageTotal,
} from './logic.ts'

const session = atom({ plugin: 'plain-english', key: 'session' } as const, EMPTY_STATE)

async function refreshStatus($: EngineInterface) {
  $.ui.status(statusText(await read($, session)))
}

async function runCheck($: EngineInterface, reply: string) {
  let isAllowed = false
  await update($, session, s => {
    isAllowed = isUnderCaps(s)
    return isAllowed ? { ...s, checks: s.checks + 1 } : s
  })
  if (!isAllowed) return

  const result = await $.model.complete({
    model: CHECK_MODEL,
    system: CHECK_SYSTEM,
    prompt: checkPrompt(reply),
    maxTokens: CHECK_MAX_TOKENS,
    effort: 'low',
    timeoutMs: CHECK_TIMEOUT_MS,
  })
  const spent = usageTotal(result.usage)
  const verdict = result.isAnswered ? parseVerdict(result.text) : null

  await update($, session, s => ({
    ...s,
    tokens: s.tokens + spent,
    verdict: verdict ?? s.verdict,
  }))
  if (verdict && !verdict.isOk) $.ui.toast(bandText(verdict))
}

const BAND_KEY = 'plain-english.showBand'

async function setBand($: EngineInterface, value: boolean) {
  const result = await $.config.set({ key: BAND_KEY, value })
  if (result.deny !== undefined) {
    $.ui.toast(`Plain-English: could not change the band (${result.deny})`)
  }
  return result
}

export const register: Register = (on, options) => {
  const isBandShown = options.showBand === true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'plain-english',
      description: 'Show or hide the Plain-English band above the prompt',
      argumentHint: 'band on|off',
      immediate: true,
    })

    return next(e)
  })

  on('command.run', { command: 'plain-english' }, async ($, e) => {
    const wanted = parseBandCommand(e.args)
    if (wanted === null) return { text: 'Use /plain-english band on or /plain-english band off.' }

    const result = await setBand($, wanted)
    if (result.deny !== undefined) return { text: `Could not change the band: ${result.deny}` }

    return { text: wanted ? 'The Plain-English band is on.' : 'The Plain-English band is off.' }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (composed.sections.some(s => s.id === SECTION_ID)) return composed

    return {
      sections: [
        ...composed.sections,
        { id: SECTION_ID, text: SECTION_TEXT, scope: 'session' as const },
      ],
    }
  })

  // turn.start fires for the main loop only; a subagent's run raises none.
  on('turn.start', async ($, e, next) => {
    const goal = firstWords(e.text)
    await update($, session, s => ({
      ...s,
      goal: goal === '' ? s.goal : goal,
      tools: [],
    }))
    await refreshStatus($)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const id = e.tool_use_id
    await update($, session, s => ({
      ...s,
      tools: addTool(s.tools, { id, tool: String(e.tool) }),
    }))
    await refreshStatus($)

    try {
      return await next(e)
    } finally {
      await update($, session, s => ({ ...s, tools: removeTool(s.tools, id) }))
      await refreshStatus($)
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const state = await update($, session, s => ({ ...s, goal: '', tools: [] }))
    $.ui.status(undefined)

    if (isCheckable(e) && isUnderCaps(state)) {
      const reply = e.answer
      // A timer runs as a dispatch of its own, so the check outlives this hook.
      $.clock.after(0, () => {
        void runCheck($, reply).catch(() => undefined)
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (!isBandShown || e.props.hasSurvey) return below

    const { verdict } = await read($, session)
    if (verdict === null) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const mine = (
      <Box key="plain-english" flexDirection="row">
        <Text color={verdict.isOk ? undefined : 'warning'} dimColor={verdict.isOk}>
          {bandText(verdict)}{' '}
        </Text>
        <Button key="band-off" label="Off" onPress={() => setBand($, false)} />
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

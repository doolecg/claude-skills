import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { HistoryItem, Question, QuestionStatus, Run } from '../types'

const PANE = 'prompt-upgrade'
const run = atom({ plugin: 'prompt-upgrade', key: 'run' } as const, null)

const GOLD = '#F2C46D'
const HAIR = '#262B33'
const MUTED = '#7D8590'
const TEXT = '#E6EDF3'
const GREEN = '#3DD68C'
const AMBER = '#E3B341'
const INK = '#14161A'

const FAST_MODEL = 'haiku'
const REWRITE_MODEL = 'sonnet'
const HISTORY_MAX = 20
const STEPS = ['Your prompt', 'Questions', 'Rewrite', 'Review']

const QUESTION_SYSTEM =
  'You help improve rough prompts that a person will send to an AI coding assistant. Reply with JSON only, no other text.'

const REWRITE_SYSTEM = [
  'You rewrite a rough prompt into a clear, complete prompt for an AI coding assistant. Reply with JSON only, no other text.',
  'Rules:',
  '- Keep exactly what the person meant. Do not change their intent or add new tasks.',
  '- Add a clear goal, who the result is for, the format wanted, and what "done" looks like.',
  '- Use the answers the person gave. Leave out anything they skipped.',
  '- Never invent facts, names, numbers or prices. Where a detail is missing and needed, leave a [placeholder] in square brackets.',
  '- The result is one request the person could have typed themselves, in plain language.',
].join('\n')

const SHORT_REPLY =
  /^(y|yes|yeah|yep|yup|no|nope|n|ok|okay|k|sure|thanks|thank you|thx|continue|go on|go ahead|keep going|carry on|do it|proceed|stop|done|correct|right|exactly|great|perfect|nice|good|looks good|lgtm)[.!?\s]*$/i

const FONT: Record<string, string[]> = {
  '0': ['┏━┓', '┃ ┃', '┗━┛'],
  '1': ['╺┓ ', ' ┃ ', '╺┻╸'],
  '2': ['╺━┓', '┏━┛', '┗━╸'],
  '3': ['╺━┓', '╺━┫', '╺━┛'],
  '4': ['╻ ╻', '┗━┫', '  ╹'],
  '5': ['┏━╸', '┗━┓', '╺━┛'],
  '6': ['┏━╸', '┣━┓', '┗━┛'],
  '7': ['╺━┓', '  ┃', '  ╹'],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '╺━┛'],
}

type Intercept = { kind: 'pass' } | { kind: 'strip'; text: string } | { kind: 'take' }

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function bigNumber(n: number): string[] {
  const digits = String(Math.max(0, Math.round(n))).split('')
  return [0, 1, 2].map(row => digits.map(d => (FONT[d] ?? FONT['0'])[row]).join(' '))
}

function classify(
  e: { text: string; attachments?: readonly unknown[]; turnId?: string; origin: { kind: string } },
  isAuto: boolean,
): Intercept {
  const text = e.text.trim()
  if (!isAuto) return { kind: 'pass' }
  if (e.origin.kind !== 'composer') return { kind: 'pass' }
  if (e.turnId !== undefined) return { kind: 'pass' }
  if (e.attachments !== undefined && e.attachments.length > 0) return { kind: 'pass' }
  if (text === '' || text.startsWith('/')) return { kind: 'pass' }
  if (text.startsWith('>')) return { kind: 'strip', text: text.slice(1).trimStart() }
  if (SHORT_REPLY.test(text) || words(text) <= 1) return { kind: 'pass' }
  return { kind: 'take' }
}

function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(text.slice(start, end + 1))
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function readQuestions(text: string): Question[] {
  const data = parseJson(text)
  const list = data?.questions
  if (!Array.isArray(list)) return []
  const out: Question[] = []
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    const q = (item as { q?: unknown }).q
    const options = (item as { options?: unknown }).options
    if (typeof q !== 'string' || q.trim() === '' || !Array.isArray(options)) continue
    const clean = options
      .filter((o): o is string => typeof o === 'string' && o.trim() !== '')
      .map(o => o.trim())
      .slice(0, 4)
    if (clean.length >= 2) out.push({ q: q.trim(), options: clean })
    if (out.length === 3) break
  }
  return out
}

function readRewrite(text: string): { prompt: string; added: string[] } | null {
  const data = parseJson(text)
  if (data !== null && typeof data.prompt === 'string' && data.prompt.trim() !== '') {
    const added = Array.isArray(data.added)
      ? data.added.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map(a => a.trim())
      : []
    return { prompt: data.prompt.trim(), added }
  }
  const plain = text.trim()
  if (plain !== '' && !plain.startsWith('{')) return { prompt: plain, added: [] }
  return null
}

function blank(id: string, step: Run['step'], original: string): Run {
  return {
    id,
    step,
    original,
    questions: [],
    status: [],
    answers: [],
    otherFor: null,
    rewrite: '',
    added: [],
    draft: '',
    isEditing: false,
    isCopied: false,
    error: '',
    failedStep: 'reading',
  }
}

function questionPrompt(original: string): string {
  return [
    'Rough prompt:',
    '<<<',
    original,
    '>>>',
    '',
    'Ask up to 3 multiple-choice questions whose answers would most improve the result.',
    'Only ask about things the prompt does not already say and that really matter.',
    'Each question has 2 to 4 short options (at most 6 words each).',
    'If nothing useful is missing, return an empty list.',
    'Reply as JSON: {"questions":[{"q":"...","options":["...","..."]}]}',
  ].join('\n')
}

function rewritePrompt(r: Run): string {
  const lines = ['Rough prompt:', '<<<', r.original, '>>>', '']
  const answered = r.questions
    .map((q, i) => ({ q, a: r.answers[i], s: r.status[i] }))
    .filter(x => x.s === 'answered' && x.a)
  if (answered.length > 0) {
    lines.push('The person answered these questions:')
    for (const x of answered) lines.push(`- ${x.q.q} -> ${x.a}`)
    lines.push('')
  }
  lines.push(
    'Reply as JSON: {"prompt":"the upgraded prompt","added":["short note on each detail you added"]}',
    'Keep each note under 12 words. Use [placeholder] for any missing detail.',
  )
  return lines.join('\n')
}

type El = Record<string, any>

let stop = new AbortController()

const patchRun = ($: any, id: string, patch: Partial<Run>) =>
  update($, run, (r: Run | null) => (r !== null && r.id === id ? { ...r, ...patch } : r))

const readAuto = async ($: any): Promise<boolean> => (await $.store.get('auto')) === true

const readHistory = async ($: any): Promise<HistoryItem[]> => {
  const list = await $.store.get('history')
  return Array.isArray(list) ? (list as HistoryItem[]) : []
}

const pushHistory = async ($: any, item: HistoryItem) => {
  const list = (await readHistory($)).filter(x => x.id !== item.id)
  await $.store.set('history', [item, ...list].slice(0, HISTORY_MAX))
}

const editHistory = async ($: any, id: string, upgraded: string) => {
  const list = await readHistory($)
  await $.store.set(
    'history',
    list.map(x => (x.id === id ? { ...x, upgraded } : x)),
  )
}

const fail = (id: string, $: any, failedStep: 'reading' | 'rewrite', reason: string) =>
  patchRun($, id, {
    step: 'error',
    failedStep,
    error:
      reason === 'aborted'
        ? 'The request took too long.'
        : 'The model could not be reached.',
  })

async function drive($: any, id: string): Promise<void> {
  const cur = (await read($, run)) as Run | null
  if (cur === null || cur.id !== id) return
  if (cur.step !== 'reading' && cur.step !== 'rewrite') return
  stop.abort()
  stop = new AbortController()
  const signal = stop.signal
  const step = cur.step

  try {
    if (step === 'reading') {
      const res = await $.model.complete(
        { model: FAST_MODEL, system: QUESTION_SYSTEM, prompt: questionPrompt(cur.original), maxTokens: 900, timeoutMs: 45000 },
        { signal },
      )
      if (signal.aborted) return
      const now = (await read($, run)) as Run | null
      if (now === null || now.id !== id || now.step !== 'reading') return
      if (!res.isAnswered) {
        await fail(id, $, 'reading', res.reason)
        return
      }
      const questions = readQuestions(res.text)
      if (questions.length === 0) {
        await patchRun($, id, { step: 'rewrite' })
        await drive($, id)
        return
      }
      await patchRun($, id, {
        step: 'questions',
        questions,
        status: questions.map((): QuestionStatus => 'open'),
        answers: questions.map(() => ''),
        otherFor: null,
      })
      return
    }

    const res = await $.model.complete(
      { model: REWRITE_MODEL, system: REWRITE_SYSTEM, prompt: rewritePrompt(cur), maxTokens: 2500, timeoutMs: 90000 },
      { signal },
    )
    if (signal.aborted) return
    const now = (await read($, run)) as Run | null
    if (now === null || now.id !== id || now.step !== 'rewrite') return
    if (!res.isAnswered) {
      await fail(id, $, 'rewrite', res.reason)
      return
    }
    const out = readRewrite(res.text)
    if (out === null) {
      await patchRun($, id, { step: 'error', failedStep: 'rewrite', error: 'The model gave an answer I could not read.' })
      return
    }
    await patchRun($, id, { step: 'review', rewrite: out.prompt, added: out.added, draft: out.prompt, isEditing: false })
    await pushHistory($, {
      id,
      at: await $.clock.now(),
      original: cur.original,
      upgraded: out.prompt,
      added: out.added,
    })
  } catch {
    await patchRun($, id, { step: 'error', failedStep: step, error: 'Something went wrong.' })
  }
}

async function closePane($: any) {
  stop.abort()
  await update($, run, () => null)
  try {
    await $.ui.close({ id: PANE })
  } catch {
    // already closed
  }
}

async function restoreOriginal($: any, text: string) {
  if (text.trim() === '') return
  try {
    await $.prompt.fill({ text, mode: 'replace' })
  } catch {
    // the box could not take it
  }
}

async function launch($: any, original: string, step: Run['step']) {
  stop.abort()
  const id = 'r' + (await $.clock.now()).toString(36)
  await update($, run, () => blank(id, step, original))
  const opening = $.ui.open({ id: PANE, title: 'Prompt Upgrade', focus: true, closeOnEscape: true })
  $.clock.after(0, () => {
    void (async () => {
      try {
        const res = await opening
        if (!res.isPlaced) {
          await closePane($)
          await restoreOriginal($, original)
          $.ui.toast(
            original.trim() === ''
              ? 'The window is too narrow for Prompt Upgrade.'
              : 'The window is too narrow for Prompt Upgrade, so your words are back in the prompt box.',
          )
          return
        }
        if (step === 'reading') await drive($, id)
      } catch {
        await closePane($)
        await restoreOriginal($, original)
      }
    })()
  })
}

async function startFromInput($: any, text: string) {
  const cur = (await read($, run)) as Run | null
  const typed = text.trim()
  if (cur === null || typed === '') return
  await patchRun($, cur.id, { step: 'reading', original: typed })
  await drive($, cur.id)
}

async function answer($: any, id: string, i: number, status: QuestionStatus, text: string) {
  let isDone = false
  await update($, run, (r: Run | null) => {
    if (r === null || r.id !== id || r.step !== 'questions') return r
    const nextStatus = [...r.status]
    const nextAnswers = [...r.answers]
    nextStatus[i] = status
    nextAnswers[i] = text
    isDone = nextStatus.every(s => s !== 'open')
    return { ...r, status: nextStatus, answers: nextAnswers, otherFor: null, step: isDone ? 'rewrite' : 'questions' }
  })
  if (isDone) await drive($, id)
}

async function skipRest($: any, id: string) {
  await update($, run, (r: Run | null) =>
    r === null || r.id !== id || r.step !== 'questions'
      ? r
      : { ...r, status: r.status.map((s): QuestionStatus => (s === 'open' ? 'skipped' : s)), otherFor: null, step: 'rewrite' },
  )
  await drive($, id)
}

async function runIt($: any, id: string) {
  const r = (await read($, run)) as Run | null
  if (r === null || r.id !== id || r.step !== 'review' || r.rewrite.trim() === '') return
  const text = r.rewrite
  await editHistory($, id, text)
  await closePane($)
  try {
    await $.prompt.submit({ text, asUser: true })
  } catch {
    await restoreOriginal($, text)
    $.ui.toast('The upgraded prompt could not be sent, so it is in the prompt box.')
  }
}

async function cancel($: any) {
  const r = (await read($, run)) as Run | null
  await closePane($)
  if (r !== null && r.step !== 'history' && r.step !== 'input') await restoreOriginal($, r.original)
}

async function sendOriginal($: any, id: string) {
  const r = (await read($, run)) as Run | null
  if (r === null || r.id !== id) return
  const text = r.original
  await closePane($)
  try {
    await $.prompt.submit({ text, asUser: true })
  } catch {
    await restoreOriginal($, text)
  }
}

async function retry($: any, id: string) {
  const r = (await read($, run)) as Run | null
  if (r === null || r.id !== id) return
  await patchRun($, id, { step: r.failedStep, error: '' })
  await drive($, id)
}

async function reopen($: any, item: HistoryItem) {
  stop.abort()
  await update($, run, () => ({
    ...blank(item.id, 'review', item.original),
    rewrite: item.upgraded,
    added: item.added,
    draft: item.upgraded,
  }))
}

const SKIP_ALL_KEY = 'skip-all'

// ---------- drawing ----------

const rule = (E: El, n: number, color: string, glyph = '─') => <E.Text color={color}>{glyph.repeat(Math.max(0, n))}</E.Text>

const heading = (E: El, label: string, w: number) => {
  const head = label.toUpperCase()
  return (
    <E.Box>
      <E.Text color={MUTED}>{head + ' '}</E.Text>
      {rule(E, w - head.length - 1, HAIR)}
    </E.Box>
  )
}

const chip = (E: El, key: string, label: string, kind: 'gold' | 'slate' | 'green', onPress: () => void) => (
  <E.Button key={key} plain onPress={onPress}>
    <E.Text
      bold={kind === 'gold'}
      backgroundColor={kind === 'gold' ? GOLD : kind === 'green' ? GREEN : HAIR}
      color={kind === 'slate' ? TEXT : INK}
    >
      {` ${label} `}
    </E.Text>
  </E.Button>
)

const quiet = (E: El, key: string, label: string, onPress: () => void) => (
  <E.Button key={key} plain onPress={onPress}>
    <E.Text color={MUTED}>{label}</E.Text>
  </E.Button>
)

const stepper = (E: El, current: number, w: number) => {
  const full = STEPS.reduce((n, s) => n + s.length + 6, 0)
  if (w < full) {
    return (
      <E.Text wrap="truncate">
        {STEPS.map((_s: string, i: number) => (
          <E.Text key={'dot' + i} color={i < current ? GREEN : i === current ? GOLD : MUTED} bold={i === current}>
            {(i < current ? '✓' : String(i + 1)) + (i < 3 ? '  ' : '  ')}
          </E.Text>
        ))}
        <E.Text color={GOLD} bold>
          {STEPS[current]}
        </E.Text>
      </E.Text>
    )
  }
  return (
    <E.Text wrap="truncate">
      {STEPS.map((label: string, i: number) => {
        const color = i < current ? GREEN : i === current ? GOLD : MUTED
        return (
          <E.Text key={'step' + i} color={color} bold={i === current}>
            {(i < current ? '✓ ' : `${i + 1} `) + label + (i < 3 ? '  ›  ' : '')}
          </E.Text>
        )
      })}
    </E.Text>
  )
}

const card = (E: El, title: string, body: string, width: number | undefined, border: string) => (
  <E.Box flexDirection="column" borderStyle="round" borderColor={border} paddingX={1} width={width}>
    <E.Text color={border === GOLD ? GOLD : MUTED} bold>
      {title.toUpperCase()}
    </E.Text>
    <E.Text color={TEXT}>{body}</E.Text>
  </E.Box>
)

const numbers = (E: El, before: number, after: number, added: number, w: number, rows: number) => {
  const items: Array<[string, number, string]> = [
    ['Words before', before, TEXT],
    ['Words after', after, GOLD],
    ['Details added', added, GREEN],
  ]
  if (w < 53 || rows < 30) {
    return (
      <E.Text wrap="truncate" color={TEXT}>
        {`${before} words`}
        <E.Text color={MUTED}>{' → '}</E.Text>
        <E.Text color={GOLD} bold>{`${after} words`}</E.Text>
        <E.Text color={MUTED}>{'  ·  '}</E.Text>
        <E.Text color={GREEN}>{`${added} details added`}</E.Text>
      </E.Text>
    )
  }
  const tw = Math.floor((w - 2) / 3)
  return (
    <E.Box gap={1}>
      {items.map(([label, n, color]) => (
        <E.Box flexDirection="column" borderStyle="round" borderColor={HAIR} paddingX={1} width={tw}>
          {bigNumber(n).map((line: string) => (
            <E.Text color={color} bold>
              {line}
            </E.Text>
          ))}
          <E.Text color={MUTED} wrap="truncate">
            {label}
          </E.Text>
        </E.Box>
      ))}
    </E.Box>
  )
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'better',
      description: 'Upgrade a rough prompt before it is sent',
      argumentHint: '[rough prompt | on | off | history]',
    })
    const r = (await read($, run)) as Run | null
    if (r !== null && (r.step === 'reading' || r.step === 'rewrite')) {
      $.clock.after(0, () => {
        void drive($, r.id)
      })
    }

    return next(e)
  })

  on('command.run', { command: 'better' }, async ($, e) => {
    try {
      const args = e.args.trim()
      const word = args.toLowerCase()
      if (word === 'on' || word === 'off') {
        await $.store.set('auto', word === 'on')
        return {
          text:
            word === 'on'
              ? 'Automatic mode is on. What you type goes to Prompt Upgrade first. Slash commands, short replies and messages with files pass straight through.'
              : 'Automatic mode is off. Use /better followed by your prompt when you want an upgrade.',
        }
      }
      if (word === 'history') {
        await launch($, '', 'history')
        return { text: 'Showing your last upgrades.' }
      }
      if (args === '') {
        await launch($, '', 'input')
        return { text: 'Type your rough prompt in the pane.' }
      }
      await launch($, args, 'reading')
      return { text: 'Upgrading your prompt in the pane. Nothing is sent until you press Run it.' }
    } catch {
      return { text: 'Prompt Upgrade could not start. Your prompt has not been sent.' }
    }
  })

  on('prompt.submit', async ($, e, next) => {
    const verdict = classify(e, await readAuto($))
    if (verdict.kind === 'pass') return next(e)
    if (verdict.kind === 'strip') return next({ ...e, text: verdict.text })
    await launch($, e.text.trim(), 'reading')

    return { drop: 'Sent to Prompt Upgrade. Press Run it in the pane to send the upgraded prompt.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      const r = (await read($, run)) as Run | null
      stop.abort()
      if (r !== null) {
        await update($, run, () => null)
        if (r.step !== 'history' && r.step !== 'input') await restoreOriginal($, r.original)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)

      return <Text>Prompt Upgrade needs a terminal or desktop window.</Text>
    }
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const E: El = { Box, Text, Button, Input }
    const w = Math.max(24, e.props.bodyColumns)
    const rows = e.viewport?.rows ?? 40
    const r = (await read($, run)) as Run | null
    const title = 'PROMPT UPGRADE'

    const header = (
      <Box flexDirection="column">
        <Text bold color={TEXT}>
          {title}
        </Text>
        <Box>
          {rule(E, title.length, GOLD, '━')}
          {rule(E, w - title.length, HAIR)}
        </Box>
      </Box>
    )

    if (r === null) {
      return (
        <Box flexDirection="column" gap={1}>
          {header}
          <Text color={MUTED}>Nothing to upgrade. Type /better and then your rough prompt.</Text>
        </Box>
      )
    }

    const id = r.id

    if (r.step === 'history') {
      const list = await readHistory($)
      return (
        <Box flexDirection="column" gap={1}>
          {header}
          {heading(E, 'Last upgrades', w)}
          {list.length === 0 && <Text color={MUTED}>No upgrades yet.</Text>}
          {list.map((item, n) => {
            const label = `${n + 1}. ${item.original.replace(/\s+/g, ' ')}`
            const tail = `  ${words(item.original)} → ${words(item.upgraded)} words`
            const room = Math.max(8, w - tail.length - 2)
            const shown = label.length > room ? label.slice(0, room - 1) + '…' : label
            return (
              <Button key={'h' + n} plain onPress={() => reopen($, item)}>
                <Text color={TEXT}>{shown}</Text>
                <Text color={MUTED}>{tail}</Text>
              </Button>
            )
          })}
          {quiet(E, 'cancel', 'Close', () => closePane($))}
        </Box>
      )
    }

    if (r.step === 'input') {
      return (
        <Box flexDirection="column" gap={1}>
          {header}
          {heading(E, 'Your rough prompt', w)}
          <Input
            key="rough"
            label="Prompt "
            placeholder="Type what you want, roughly"
            submitLabel="upgrade"
            autoFocus
            onSubmit={(value: string) => startFromInput($, value)}
          />
          {quiet(E, 'cancel', 'Cancel', () => cancel($))}
        </Box>
      )
    }

    const current = r.step === 'reading' ? 0 : r.step === 'questions' ? 1 : r.step === 'rewrite' ? 2 : r.step === 'review' ? 3 : r.failedStep === 'reading' ? 0 : 2

    let body
    if (r.step === 'reading' || r.step === 'rewrite') {
      body = (
        <Box flexDirection="column" gap={1}>
          {card(E, 'Your prompt', r.original, undefined, HAIR)}
          <Text color={MUTED}>
            {r.step === 'reading'
              ? 'Reading your prompt and picking the questions that matter...'
              : 'Rewriting your prompt with your answers...'}
          </Text>
          {quiet(E, 'cancel', 'Cancel', () => cancel($))}
        </Box>
      )
    } else if (r.step === 'questions') {
      const answered = r.status.filter(s => s === 'answered').length
      body = (
        <Box flexDirection="column" gap={1}>
          {heading(E, 'A few quick questions', w)}
          {r.questions.map((q, i) => {
            const st = r.status[i]
            const badge = st === 'answered' ? ' ✓ ' : ` ${i + 1} `
            return (
              <Box flexDirection="column">
                <Box gap={1}>
                  <Text bold backgroundColor={st === 'answered' ? GREEN : GOLD} color={INK}>
                    {badge}
                  </Text>
                  <Text color={st === 'skipped' ? MUTED : TEXT} bold>
                    {q.q}
                  </Text>
                </Box>
                <Box flexWrap="wrap" gap={1} marginLeft={4}>
                  {q.options.map((opt, j) =>
                    chip(E, `q${i}o${j}`, opt, st === 'answered' && r.answers[i] === opt ? 'green' : 'slate', () =>
                      answer($, id, i, 'answered', opt),
                    ),
                  )}
                  {chip(E, `q${i}other`, 'Other (type it)', 'slate', () =>
                    patchRun($, id, { otherFor: i }),
                  )}
                  {quiet(E, `q${i}skip`, st === 'skipped' ? 'Skipped' : 'Skip', () =>
                    answer($, id, i, 'skipped', ''),
                  )}
                </Box>
                {r.otherFor === i && (
                  <Box marginLeft={4}>
                    <Input
                      key={`q${i}input`}
                      label="Your answer "
                      placeholder="Type it and press Enter"
                      submitLabel="answer"
                      autoFocus
                      onSubmit={(value: string) =>
                        value.trim() === ''
                          ? patchRun($, id, { otherFor: null })
                          : answer($, id, i, 'answered', value.trim())
                      }
                    />
                  </Box>
                )}
              </Box>
            )
          })}
          <Box gap={2} flexWrap="wrap">
            <Text color={MUTED}>{`${answered} of ${r.questions.length} answered`}</Text>
            {chip(E, SKIP_ALL_KEY, 'Skip the rest, upgrade now', 'gold', () => skipRest($, id))}
            {quiet(E, 'cancel', 'Cancel', () => cancel($))}
          </Box>
        </Box>
      )
    } else if (r.step === 'error') {
      body = (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column" borderStyle="round" borderColor={AMBER} paddingX={1}>
            <Text bold color={AMBER}>
              THAT DID NOT WORK
            </Text>
            <Text color={TEXT}>{r.error || 'Something went wrong.'}</Text>
            <Text color={TEXT}>Your prompt is safe. Nothing was sent.</Text>
          </Box>
          <Box gap={1} flexWrap="wrap">
            {chip(E, 'retry', 'Try again', 'gold', () => retry($, id))}
            {chip(E, 'send-original', 'Send my original', 'slate', () => sendOriginal($, id))}
            {quiet(E, 'cancel', 'Cancel', () => cancel($))}
          </Box>
        </Box>
      )
    } else {
      const before = words(r.original)
      const after = words(r.rewrite)
      const half = Math.floor((w - 1) / 2)
      const isSide = w >= 72
      body = (
        <Box flexDirection="column" gap={1}>
          {numbers(E, before, after, r.added.length, w, rows)}
          {r.isEditing ? (
            <Box flexDirection="column">
              <Input
                key="edit"
                label="Edit "
                value={r.draft}
                submitLabel="run it"
                autoFocus
                onInput={(value: string) => patchRun($, id, { draft: value })}
                onSubmit={async (value: string) => {
                  const text = value.trim()
                  if (text === '') return
                  await patchRun($, id, { rewrite: text, draft: text, isEditing: false })
                  await runIt($, id)
                }}
              />
              <Box gap={2}>
                <Text color={MUTED}>Enter runs it.</Text>
                {quiet(E, 'back', 'Back', () => patchRun($, id, { isEditing: false }))}
                {quiet(E, 'cancel', 'Cancel', () => cancel($))}
              </Box>
            </Box>
          ) : (
            <Box gap={1} flexWrap="wrap">
              {chip(E, 'run', 'Run it', 'gold', () => runIt($, id))}
              {chip(E, 'edit', 'Edit', 'slate', () => patchRun($, id, { isEditing: true, draft: r.rewrite }))}
              {chip(E, 'copy', 'Copy', 'slate', async () => {
                await $.ui.copy({ text: r.rewrite, surface: e.surface })
                await patchRun($, id, { isCopied: true })
              })}
              {quiet(E, 'cancel', 'Cancel', () => cancel($))}
              {r.isCopied && <Text color={GREEN}>Copied</Text>}
            </Box>
          )}
          {heading(E, 'What I added', w)}
          {r.added.length === 0 && <Text color={MUTED}>No extra details were needed.</Text>}
          {r.added.map((item: string) => (
            <Text color={TEXT}>
              <Text color={GREEN}>{'+ '}</Text>
              {item}
            </Text>
          ))}
          <Box flexDirection={isSide ? 'row' : 'column'} gap={1}>
            {card(E, 'Your prompt', r.original, isSide ? half : undefined, HAIR)}
            {card(E, 'Upgrade', r.rewrite, isSide ? half : undefined, GOLD)}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {stepper(E, current, w)}
        {body}
      </Box>
    )
  })
}

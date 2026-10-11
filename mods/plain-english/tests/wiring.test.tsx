import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { MAX_CHECKS, SECTION_ID } from '../hooks/logic.ts'

const reply = 'word '.repeat(100)

type Calls = {
  status: (string | undefined)[]
  toasts: string[]
  models: { model: string; effort?: string; maxTokens?: number; timeoutMs?: number }[]
  config: { key: string; value: unknown }[]
  commands: string[]
}

function world(on: On, answers: string[], inputTokens = 100, denyConfig?: string) {
  const calls: Calls = { status: [], toasts: [], models: [], config: [], commands: [] }
  const usage = {
    input_tokens: inputTokens,
    output_tokens: 5,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  }
  const clock = mock.clock(on)
  on('ui.status', (_$, e) => {
    calls.status.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    calls.toasts.push(e.text)
    return { value: undefined }
  })
  on('model.complete', (_$, e) => {
    calls.models.push(e)
    const text = answers[Math.min(calls.models.length - 1, answers.length - 1)] ?? 'PASS'
    return { value: { isAnswered: true as const, text, usage } }
  })
  on('config.set', (_$, e) => {
    calls.config.push({ key: e.key, value: e.value })
    return denyConfig === undefined ? { value: e.value } : { deny: denyConfig }
  })
  on('command.register', (_$, e) => {
    calls.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return { calls, clock }
}

const finish = (
  $: any,
  over: Partial<{ answer: string; isAborted: boolean; reason: string; agentId: string }> = {},
) =>
  $.turn.complete({
    answer: reply,
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    ...over,
  })

const asTyped = {
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 80 },
}

const SHOWN = { options: { showBand: true } }

const band = (surface: 'terminal' | 'desktop', hasSurvey = false) => ({
  plugin: 'plain-english',
  surface,
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
})

test('prompt.compose adds the style section once, last, in the session scope', async ($, on) => {
  on('prompt.compose', () => ({
    sections: [{ id: 'intro', text: 'intro', scope: 'shared' as const }],
  }))
  const out = await $.prompt.compose({
    model: 'claude-sonnet-5-5',
    promptModel: 'claude-sonnet-5-5',
    surfaces: [],
    tools: [],
    outputStyle: null,
    traits: [],
  })
  const ids = out.sections.map(s => s.id)
  expect(ids).toEqual(['intro', SECTION_ID])
  expect(out.sections[1]?.scope).toBe('session')
})

test('status line follows the main agent turn and clears at the end', async ($, on) => {
  const { calls } = world(on, ['PASS'])
  await $.turn.start({ text: 'fix  the login bug please', turnId: 't1' })
  expect(calls.status.at(-1)).toBe('Working on: fix the login bug please')
  await $.tool.call({ tool: 'Read', file_path: '/a.txt' })
  expect(calls.status).toContain('Working on: fix the login bug please (running Read)')
  expect(calls.status.at(-1)).toBe('Working on: fix the login bug please')
  await finish($, { answer: 'short' })
  expect(calls.status.at(-1)).toBe(undefined)
})

test('a passing check shows ok on both surfaces and does not toast', SHOWN, async ($, on) => {
  const { calls, clock } = world(on, ['PASS'])
  await finish($)
  await clock.settle()
  expect(calls.models.length).toBe(1)
  expect(calls.models[0]).toMatchObject({
    model: 'claude-haiku-5-5',
    effort: 'low',
    maxTokens: 40,
    timeoutMs: 15000,
  })
  expect(calls.toasts).toEqual([])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: 'Plain-English: ok' })).toBeDefined()
    await ui.unmount()
  }
})

test('a failing check toasts and the band names the rule, on both surfaces', SHOWN, async ($, on) => {
  const { calls, clock } = world(on, ['FAIL: no Next steps section'])
  await finish($)
  await clock.settle()
  expect(calls.toasts).toEqual(['Plain-English: missed: no Next steps section'])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(band(surface))
    expect(
      await ui.find({ type: 'Text', text: 'Plain-English: missed: no Next steps section' }),
    ).toBeDefined()
    await ui.unmount()
  }
})

test('the band is empty before any check and yields to a survey', SHOWN, async ($, on) => {
  const { clock } = world(on, ['PASS'])
  const before = await $.ui.mount(band('desktop'))
  expect(await before.find({ text: /Plain-English/ })).toBe(undefined)
  await finish($)
  await clock.settle()
  const survey = await $.ui.mount(band('desktop', true))
  expect(await survey.find({ text: /Plain-English/ })).toBe(undefined)
})

test('junk keeps the last verdict and never toasts', SHOWN, async ($, on) => {
  const { calls, clock } = world(on, ['FAIL: too wordy', 'huh?'])
  await finish($)
  await clock.settle()
  await finish($)
  await clock.settle()
  expect(calls.models.length).toBe(2)
  expect(calls.toasts).toEqual(['Plain-English: missed: too wordy'])
  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ text: 'Plain-English: missed: too wordy' })).toBeDefined()
})

test('no check for short, aborted, errored or subagent turns', async ($, on) => {
  const { calls, clock } = world(on, ['PASS'])
  await finish($, { answer: 'too short' })
  await finish($, { isAborted: true, reason: 'aborted' })
  await finish($, { reason: 'error' })
  await finish($, { agentId: 'agent-7' })
  await clock.settle()
  expect(calls.models.length).toBe(0)
})

test('a subagent turn leaves the main status line alone', async ($, on) => {
  const { calls } = world(on, ['PASS'])
  await $.turn.start({ text: 'build it', turnId: 't1' })
  const n = calls.status.length
  await finish($, { agentId: 'agent-7', answer: 'short' })
  expect(calls.status.length).toBe(n)
})

test('the check does not hold up turn.complete and the reply is untouched', async ($, on) => {
  const { calls, clock } = world(on, ['PASS'])
  const done = await finish($)
  expect(done.text).toBe(reply)
  expect(calls.models.length).toBe(0)
  await clock.settle()
  expect(calls.models.length).toBe(1)
})

test('stops after 25 checks and keeps the last verdict', SHOWN, async ($, on) => {
  const { calls, clock } = world(on, ['FAIL: x', 'PASS'])
  for (let i = 0; i < MAX_CHECKS + 5; i++) {
    await finish($)
    await clock.settle()
  }
  expect(calls.models.length).toBe(MAX_CHECKS)
  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ text: 'Plain-English: ok' })).toBeDefined()
})

test('stops once 150k tokens are used', async ($, on) => {
  const { calls, clock } = world(on, ['PASS'], 80000)
  for (let i = 0; i < 5; i++) {
    await finish($)
    await clock.settle()
  }
  expect(calls.models.length).toBe(2)
})

test('the band starts hidden: a verdict is kept but nothing is drawn', async ($, on) => {
  const { calls, clock } = world(on, ['FAIL: too wordy'])
  await finish($)
  await clock.settle()
  expect(calls.toasts).toEqual(['Plain-English: missed: too wordy'])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ text: /Plain-English/ })).toBe(undefined)
    await ui.unmount()
  }
})

test('the Off button on the band switches showBand off, on both surfaces', SHOWN, async ($, on) => {
  const { calls, clock } = world(on, ['PASS'])
  await finish($)
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    calls.config.length = 0
    const ui = await $.ui.mount(band(surface))
    await ui.press({ key: 'band-off' })
    expect(calls.config).toEqual([{ key: 'plain-english.showBand', value: false }])
    await ui.unmount()
  }
})

test('/plain-english band on|off sets the field and answers in plain words', async ($, on) => {
  const { calls } = world(on, ['PASS'])
  const on1 = await $.command.run({ command: 'plain-english', args: 'band on', ...asTyped })
  expect(on1.text).toBe('The Plain-English band is on.')
  const off = await $.command.run({ command: 'plain-english', args: ' Band  OFF ', ...asTyped })
  expect(off.text).toBe('The Plain-English band is off.')
  expect(calls.config).toEqual([
    { key: 'plain-english.showBand', value: true },
    { key: 'plain-english.showBand', value: false },
  ])
})

test('/plain-english with bad arguments changes nothing', async ($, on) => {
  const { calls } = world(on, ['PASS'])
  for (const args of ['', 'band', 'band maybe', 'show on', 'band on now']) {
    const out = await $.command.run({ command: 'plain-english', args, ...asTyped })
    expect(out.text).toBe('Use /plain-english band on or /plain-english band off.')
  }
  expect(calls.config).toEqual([])
})

test('a refused change is reported and not claimed', async ($, on) => {
  const { calls } = world(on, ['PASS'], 100, 'locked')
  const out = await $.command.run({ command: 'plain-english', args: 'band on', ...asTyped })
  expect(out.text).toBe('Could not change the band: locked')
  expect(calls.toasts.length).toBe(1)
})

test('the command is registered at session start and answers /plain-english', async ($, on) => {
  const { calls } = world(on, ['PASS'])
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  expect(calls.commands).toEqual(['plain-english'])
})

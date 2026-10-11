import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const STYLE_QUESTION = {
  question: 'Which design style should the page use?',
  header: 'Style',
  multiSelect: false,
  options: [
    { label: 'Minimal', description: 'Lots of space' },
    { label: 'Brutalist', description: 'Bold borders' },
    { label: 'Playful', description: 'Rounded and bright' },
  ],
}

const DB_QUESTION = {
  question: 'Which database should we use?',
  header: 'Database',
  multiSelect: false,
  options: [
    { label: 'Postgres', description: 'Server' },
    { label: 'SQLite', description: 'File' },
  ],
}

const BS = String.fromCharCode(92)
const TEMP = `C:${BS}Temp`
const WIN_PAGE = `${TEMP}${BS}claude-design-picker.html`
const OK = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const FAILED = { ...OK, exitCode: 1 }
const ANSWER = { result: { answers: { Style: 'Minimal' } } }

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

type World = {
  writes: { path: string; text: string }[]
  runs: (readonly string[])[]
  toasts: string[]
  asked: () => number
  answer: () => void
}

// Registers the bottom of the engine: file writes, commands and toasts are
// recorded, and the question stays open until `answer()`.
function world(on: On, clock: { sleep: (ms: number) => Promise<void>; advance: (ms: number) => Promise<void> }, opened = OK): World {
  const state: World = { writes: [], runs: [], toasts: [], asked: () => asked, answer: () => {} }
  let asked = 0
  let release = false

  on('fs.write', (_$, e) => {
    state.writes.push(e)
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    state.runs.push(e.argv)
    return { value: opened }
  })
  on('ui.toast', (_$, e) => {
    state.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($b, e) => {
    const { Box } = $b.ui.resolve(e)
    return <Box key="engine-band" />
  })
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    asked += 1
    while (!release) await clock.sleep(100)
    return ANSWER
  })
  state.answer = () => {
    release = true
  }

  return state
}

test('a design question reaches the dialog once, while the page is written and opened beside it', async ($, on) => {
  mock.env(on, { TEMP, OS: 'Windows_NT' })
  const clock = mock.clock(on)
  const w = world(on, clock)

  const call = $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.settle()

  expect(w.asked()).toBe(1)
  expect(w.writes.length).toBe(1)
  expect(w.writes[0]?.path).toBe(WIN_PAGE)
  expect(w.writes[0]?.text).toContain('s-minimal')
  expect(w.writes[0]?.text).toContain('class="neutral">Playful<')
  expect(w.runs).toEqual([['cmd', '/c', 'start', '', WIN_PAGE]])
  expect(w.toasts).toEqual([])

  w.answer()
  await clock.advance(200)
  const result = await call
  expect(result).toEqual(ANSWER)
})

test('the question is not held back by a slow write', async ($, on) => {
  mock.env(on, { TEMP, OS: 'Windows_NT' })
  const clock = mock.clock(on)
  let asked = 0
  let wrote = false

  on('fs.write', async () => {
    await clock.sleep(5000)
    wrote = true
    return { value: undefined }
  })
  on('process.run', () => ({ value: OK }))
  on('tool.call', { tool: 'AskUserQuestion' }, () => {
    asked += 1
    return ANSWER
  })

  const call = $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.settle()

  expect(asked).toBe(1)
  expect(wrote).toBe(false)
  await clock.advance(6000)
  expect(await call).toEqual(ANSWER)
})

test('a question that is not about looks is passed on with nothing written', async ($, on) => {
  mock.env(on, { TEMP, OS: 'Windows_NT' })
  const clock = mock.clock(on)
  const w = world(on, clock)
  w.answer()

  await $.tool.call({ tool: 'AskUserQuestion', questions: [DB_QUESTION] })

  expect(w.asked()).toBe(1)
  expect(w.writes).toEqual([])
  expect(w.runs).toEqual([])
  expect(w.toasts).toEqual([])
})

test('no temp folder gives a toast and the question still goes ahead', async ($, on) => {
  mock.env(on, { OS: 'Windows_NT' })
  const clock = mock.clock(on)
  const w = world(on, clock)
  w.answer()

  await $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.settle()

  expect(w.asked()).toBe(1)
  expect(w.writes).toEqual([])
  expect(w.toasts.length).toBe(1)
  expect(w.toasts[0]).toContain('no temp folder')
})

test('a failed opener gives a toast with the file path', async ($, on) => {
  mock.env(on, { TEMP, OS: 'Windows_NT' })
  const clock = mock.clock(on)
  const w = world(on, clock, FAILED)

  const call = $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.settle()

  expect(w.toasts.length).toBe(1)
  expect(w.toasts[0]).toContain(WIN_PAGE)
  expect(w.toasts[0]).toContain('did not open')
  w.answer()
  await clock.advance(200)
  await call
})

test('a refused opener and a failed write each give a toast', async ($, on) => {
  mock.env(on, { TEMP, OS: 'Windows_NT' })
  const clock = mock.clock(on)
  const toasts: string[] = []
  let writes = 0
  let release = false

  on('fs.write', () => {
    writes += 1
    if (writes === 1) return { value: undefined }
    throw new Error('disk full')
  })
  on('process.run', () => {
    throw new Error('spawn refused')
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    while (!release) await clock.sleep(100)
    return ANSWER
  })

  const first = $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.settle()
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('did not open')

  const second = $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.settle()
  expect(toasts.length).toBe(2)
  expect(toasts[1]).toContain('could not write')
  release = true
  await clock.advance(200)
  await first
  await second
})

test('a question answered before the page is ready does not open it late', async ($, on) => {
  mock.env(on, { TEMP, OS: 'Windows_NT' })
  const clock = mock.clock(on)
  const runs: (readonly string[])[] = []

  on('fs.write', async () => {
    await clock.sleep(1000)
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    runs.push(e.argv)
    return { value: OK }
  })
  on('ui.render', ($b, e) => {
    const { Box } = $b.ui.resolve(e)
    return <Box key="engine-band" />
  })
  on('tool.call', { tool: 'AskUserQuestion' }, () => ANSWER)

  await $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.advance(2000)
  expect(runs).toEqual([])
})

test('macOS uses open with the TMPDIR folder', async ($, on) => {
  mock.env(on, { TMPDIR: '/var/folders/ab/T/' })
  const clock = mock.clock(on)
  const w = world(on, clock)
  on('fs.exists', () => ({ value: true }))

  const call = $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.settle()

  expect(w.writes[0]?.path.split(String.fromCharCode(92)).join('/')).toContain('/var/folders/ab/T/claude-design-picker.html')
  expect(w.runs).toEqual([['open', '/var/folders/ab/T/claude-design-picker.html']])
  w.answer()
  await clock.advance(200)
  await call
})

test('Linux uses xdg-open and falls back to /tmp', async ($, on) => {
  mock.env(on, {})
  const clock = mock.clock(on)
  const w = world(on, clock)
  on('fs.exists', (_$, e) => ({ value: e.path.endsWith('tmp') }))

  const call = $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.settle()

  expect(w.writes[0]?.path.split(String.fromCharCode(92)).join('/')).toContain('/tmp/claude-design-picker.html')
  expect(w.runs).toEqual([['xdg-open', '/tmp/claude-design-picker.html']])
  w.answer()
  await clock.advance(200)
  await call
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band lists the options with a Reopen button on ${surface}, and clears when answered`, async ($, on) => {
    mock.env(on, { TEMP, OS: 'Windows_NT' })
    const clock = mock.clock(on)
    const w = world(on, clock)

    const call = $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
    await clock.settle()

    const ui = await $.ui.mount({ plugin: 'design-picker', surface, component: 'AbovePrompt', props: BAND_PROPS })
    const line = await ui.find({ type: 'Text', text: /Style: Minimal \| Brutalist \| Playful/ })
    expect(line).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'reopen' })).toBeDefined()

    await ui.press({ key: 'reopen' })
    expect(w.writes.length).toBe(2)
    expect(w.runs.length).toBe(2)

    w.answer()
    await clock.advance(200)
    await call

    const after = await $.ui.mount({ plugin: 'design-picker', surface, component: 'AbovePrompt', props: BAND_PROPS })
    expect(await after.find({ type: 'Button', key: 'reopen' })).toBeUndefined()
    expect(await after.find({ type: 'Text', text: /Minimal/ })).toBeUndefined()
    await ui.unmount()
    await after.unmount()
  })
}

test('no band is drawn for a question that is not about looks', async ($, on) => {
  mock.env(on, { TEMP, OS: 'Windows_NT' })
  const clock = mock.clock(on)
  const w = world(on, clock)

  const call = $.tool.call({ tool: 'AskUserQuestion', questions: [DB_QUESTION] })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'design-picker', surface: 'desktop', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await ui.find({ type: 'Button', key: 'reopen' })).toBeUndefined()
  w.answer()
  await clock.advance(200)
  await call
})

test('the band yields to a survey', async ($, on) => {
  mock.env(on, { TEMP, OS: 'Windows_NT' })
  const clock = mock.clock(on)
  const w = world(on, clock)

  const call = $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'design-picker', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, hasSurvey: true } })
  expect(await ui.find({ type: 'Button', key: 'reopen' })).toBeUndefined()
  w.answer()
  await clock.advance(200)
  await call
})

test('the band keeps what other bands draw', async ($, on) => {
  mock.env(on, { TEMP, OS: 'Windows_NT' })
  const clock = mock.clock(on)
  on('ui.render', { component: 'AbovePrompt' }, ($b, e) => {
    const { Text } = $b.ui.resolve(e)
    return <Text key="other-band">other band line</Text>
  })
  const w = world(on, clock)

  const call = $.tool.call({ tool: 'AskUserQuestion', questions: [STYLE_QUESTION] })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'design-picker', surface: 'desktop', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await ui.find({ type: 'Text', text: /other band line/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'reopen' })).toBeDefined()
  w.answer()
  await clock.advance(200)
  await call

  const after = await $.ui.mount({ plugin: 'design-picker', surface: 'desktop', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await after.find({ type: 'Text', text: /other band line/ })).toBeDefined()
})

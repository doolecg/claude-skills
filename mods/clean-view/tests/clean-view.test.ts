import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  EMPTY_ASK,
  EMPTY_CHECKLIST,
  answerOther,
  answersMessage,
  askAnswers,
  confirmPicks,
  isAnswered,
  parseAsk,
  pressOption,
  cleanName,
  easeToward,
  overall,
  paletteFor,
  pixelMeter,
  pixelSweep,
  planSteps,
  rasterCells,
  reportProgress,
  wrapText,
} from '../hooks/clean-logic'

const PLAN = 'mcp__clean-view__plan_steps'
const REPORT = 'mcp__clean-view__report_progress'
const SURFACES = ['terminal', 'desktop'] as const

const BAND = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 20,
  bodyColumns: 100,
  scroll: { bodyRows: 20 },
  view: {},
} as any

const sent: string[] = []
let helpers: { id: string; status: string }[] = []

function world(on: On) {
  sent.length = 0
  helpers = []
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }) as any)
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as any)
  on('agent.list', () => ({ value: helpers }) as any)
  on('settings.read', () => ({ value: { theme: 'dark' } }) as any)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as any)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => (sent.push(e.text), e) as any)
  on('classic.Notification', () => ({}) as any)
  on('ui.toast', () => ({ value: undefined }) as any)
  // The engine's own band, with nothing of its own to show.
  on('ui.render', { component: 'AbovePrompt' }, (($: any, e: any) => (globalThis as any).h($.ui.resolve(e).Box, {})) as any)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Build a landing page', usage: {} } }) as any)
  on('tool.call', { tool: ['Bash', 'Edit', 'TodoWrite', 'AskUserQuestion', 'ToolSearch'] }, () => ({ result: 'ok', text: 'ok' }) as any)
  return clock
}

async function startJob($: any, text = 'Build my landing page') {
  await $.session.start({ cwd: '.' })
  await $.turn.start({ text, turnId: 't1' })
}

async function band($: any, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ plugin: 'clean-view', surface, component: 'AbovePrompt', props: BAND })
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text))
  return { ui, all: texts.join('\n') }
}

async function rowText($: any, key: string, surface: 'terminal' | 'desktop' = 'terminal') {
  const ui = await $.ui.mount({ plugin: 'clean-view', surface, component: 'AbovePrompt', props: BAND })
  const found = await ui.find({ key })
  await ui.unmount()
  return String(found?.text ?? '')
}

const complete = (turnId: string, reason: 'answer' | 'error' | 'aborted', answer = 'ok') =>
  ({ answer, durationMs: 5, isAborted: reason === 'aborted', turnId, reason }) as any

test('names are cleaned of code, paths and file names, and trimmed to 40', () => {
  expect(cleanName('Build the pricing section in `src/Pricing.tsx`')).toBe('Build the pricing section in')
  expect(cleanName('Update the src/components/Header.tsx header')).toBe('Update the header')
  expect(cleanName('fix Pricing.tsx  spacing')).toBe('Fix spacing')
  expect(cleanName('')).toBe('Working on it')
  expect(cleanName('`npm run build`')).toBe('Working on it')
  const long = cleanName('Rewrite the entire onboarding experience so that every new customer feels welcome today')
  expect(long.length).toBeLessThanOrEqual(40)
  expect(long.endsWith('…')).toBe(true)
  expect(long.startsWith('Rewrite the entire onboarding')).toBe(true)
})

test('reporting an unplanned step adds it, and overall progress counts the current step', () => {
  let cl = planSteps(EMPTY_CHECKLIST, ['Read the notes', 'Build the page'], 1)
  cl = reportProgress(cl, 'Read the notes', 50)
  expect(overall(cl).percent).toBe(25)
  cl = reportProgress(cl, 'Check the colours', 10)
  expect(cl.tasks.map(t => t.name)).toEqual(['Check the colours', 'Read the notes', 'Build the page'])
  expect(cl.tasks.filter(t => t.status === 'active')).toHaveLength(1)
})

test('plan_steps then report_progress at 100 checks off step one and starts step two', async ($, on) => {
  world(on)
  await startJob($)
  const planned = await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section', 'Add the contact form'] } as any)
  expect((planned as any).result).toBe('Planned 3 steps. The first one has started.')
  expect(await rowText($, 'p0')).toContain('▶')
  expect(await rowText($, 'p0')).toContain('…')
  expect(await rowText($, 'p1')).toContain('○')
  const reported = await $.tool.call({ tool: REPORT, task: 'Read your brand notes', percent: 140 } as any)
  expect((reported as any).result).toBe('Progress noted: 100%.')
  expect(await rowText($, 'p0')).toContain('✓')
  expect(await rowText($, 'p0')).toContain('done')
  expect(await rowText($, 'p1')).toContain('▶')
  expect(await rowText($, 'p2')).toContain('○')
})

test('a to-do list plus a 60% report renders done, 60% and dim pending rows on both surfaces', async ($, on) => {
  world(on)
  await startJob($)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Read your brand notes', status: 'completed', activeForm: 'Reading' },
      { content: 'Build the pricing section', status: 'in_progress', activeForm: 'Building' },
      { content: 'Add the contact form', status: 'pending', activeForm: 'Adding' },
      { content: 'Polish the footer', status: 'pending', activeForm: 'Polishing' },
    ],
  } as any)
  await $.tool.call({ tool: REPORT, task: 'Build the pricing section', percent: 60 } as any)
  for (const surface of SURFACES) {
    expect(await rowText($, 't0', surface)).toMatch(/✓.*Read your brand notes.*done/s)
    expect(await rowText($, 't1', surface)).toMatch(/▶.*Build the pricing section.*60%/s)
    expect(await rowText($, 't2', surface)).toMatch(/○.*Add the contact form/s)
    expect(await rowText($, 't3', surface)).toMatch(/○.*Polish the footer/s)
    const { ui, all } = await band($, surface)
    expect(all).toContain('Step 2 of 4')
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
  }
})

test('a permission prompt shows Needs you, and the next tool run clears it', async ($, on) => {
  world(on)
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] } as any)
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' } as any)
  for (const surface of SURFACES) {
    const { ui, all } = await band($, surface)
    expect(all).toContain('Needs you')
    expect(all).toContain('Claude needs your OK to continue')
    expect(all).toContain('‖')
    await ui.unmount()
  }
  await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  const { ui, all } = await band($, 'terminal')
  expect(all).not.toContain('Needs you')
  await ui.unmount()
})

test('/simple off hides the band, and /simple flips it back', async ($, on) => {
  world(on)
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] } as any)
  const off = await $.command.run({ command: 'simple', args: 'off' } as any)
  expect((off as any).text).toBe('Task View is off.')
  for (const surface of SURFACES) {
    const { ui, all } = await band($, surface)
    expect(all).toBe('')
    await ui.unmount()
  }
  const allowed = await $.tool.call({ tool: 'Edit', file_path: 'a.txt', old_string: 'a', new_string: 'b' } as any)
  expect((allowed as any).deny).toBeUndefined()
  await $.command.run({ command: 'simple', args: '' } as any)
  const { ui, all } = await band($, 'terminal')
  expect(all).toContain('Read your brand notes')
  await ui.unmount()
})

test('tools are denied before a plan exists and allowed after', async ($, on) => {
  world(on)
  await startJob($)
  const denied = await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  expect(JSON.stringify(denied)).toContain('plan_steps')
  const search = await $.tool.call({ tool: 'ToolSearch', query: 'select:plan_steps' } as any)
  expect((search as any).deny).toBeUndefined()
  await $.tool.call({ tool: PLAN, steps: ['Look around', 'Report back'] } as any)
  const allowed = await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  expect((allowed as any).deny).toBeUndefined()
  expect((allowed as any).isError).not.toBe(true)
})

test('nothing is drawn above the prompt while no job runs', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '.' } as any)
  for (const surface of SURFACES) {
    const { ui, all } = await band($, surface)
    expect(all).toBe('')
    await ui.unmount()
  }
})

test('technical rows are hidden while on', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '.' } as any)
  const props = { tool_use_id: 'x', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false } as any
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'clean-view', surface, component: 'ToolUse', props, requestId: 'x' } as any)
    expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
    await ui.unmount()
  }
})

test('a finished job says All done and shrinks to one line after 5 seconds; an API error is one calm line', async ($, on) => {
  const clock = world(on)
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Look around'] } as any)
  await clock.advance(72_000)
  await $.tool.call({ tool: REPORT, task: 'Look around', percent: 100 } as any)
  await $.turn.complete(complete('t1', 'answer'))
  for (const surface of SURFACES) {
    const { ui, all } = await band($, surface)
    expect(all).toContain('All done')
    expect(all).toContain('took 1m 12s')
    expect(all).toContain('1 of 1 steps')
    await ui.unmount()
  }
  await clock.advance(5_000)
  const { ui, all } = await band($, 'terminal')
  expect(all).toContain('✓ All done')
  expect(all).not.toContain('Look around')
  await ui.unmount()

  await $.turn.start({ text: 'Do another thing', turnId: 't2' })
  await $.turn.complete(complete('t2', 'error', 'API Error: 429 rate_limit_error'))
  const after = await band($, 'terminal')
  expect(after.all).toContain('Stuck')
  expect(after.all).toContain('usage limit')
  await after.ui.unmount()
})

test('Esc stops the job, and Haiku names a new one', async ($, on) => {
  const clock = world(on)
  await startJob($, 'please could you build me a landing page with pricing')
  await clock.settle()
  const named = await band($, 'terminal')
  expect(named.all).toContain('Build a landing page')
  await named.ui.unmount()
  await $.turn.complete(complete('t1', 'aborted'))
  const { ui, all } = await band($, 'terminal')
  expect(all).toContain('Stopped')
  expect(all).toContain('you pressed Esc')
  await ui.unmount()
})

test('the on/off mode is published for the bottom bar', async ($, on) => {
  world(on)
  const seen: unknown[] = []
  on('state.set', { plugin: 'clean-view', key: 'modes' } as any, (async (_$: any, e: any, next: any) => {
    seen.push(e.value)
    return next(e)
  }) as any)
  await $.session.start({ cwd: '.' } as any)
  await $.command.run({ command: 'simple', args: 'off' } as any)
  expect(seen[0]).toEqual({ simple: { label: 'Task View', isOn: true } })
  expect(seen[seen.length - 1]).toEqual({ simple: { label: 'Task View', isOn: false } })
})

test('pixel meters are dense dot-matrix cells that fade up to a solid head and build up over time', () => {
  const look = { stops: ['#E8A06A', '#D9667F'], track: '#3A3531', tint: '#FFF6EC', tick: 0 }
  const bits = (p: { ch: string }) => p.ch.charCodeAt(0) - 0x2800
  const count = (list: { ch: string }[]) => list.reduce((n, p) => n + [...bits(p).toString(2)].filter(b => b === '1').length, 0)
  expect(count(pixelMeter(20, 0, look))).toBeLessThan(60)
  const done = pixelMeter(20, 1, look)
  expect(count(done)).toBe(160)
  expect(done.every(p => bits(p) === 0xff)).toBe(true)
  expect(pixelMeter(20, 1, { ...look, tick: 9 }).map(p => p.color)).toEqual(done.map(p => p.color))
  const half = pixelMeter(20, 0.5, look)
  expect(half[9]!.ch.charCodeAt(0) - 0x2800).toBe(0xff)
  expect(count(half.slice(0, 4))).toBeLessThan(count(half.slice(5, 9)))
  expect(count(half.slice(10))).toBeLessThan(40)
  const other = pixelMeter(20, 0.5, { ...look, seed: 4 })
  expect(other.map(p => p.ch).join('')).not.toBe(half.map(p => p.ch).join(''))
    const sweep = pixelSweep(10, { ...look, tick: 5 })
  expect(sweep.some(p => p.color !== sweep[9]!.color)).toBe(true)
  expect(rasterCells(half)).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
  expect(rasterCells(half).length).toBe(Math.ceil((20 * 12) / 3) * 4)
  expect(easeToward(0, 1, 0)).toBe(0)
  expect(easeToward(0, 1, 450)).toBeGreaterThan(0.5)
  expect(easeToward(0, 1, 900)).toBe(1)
})

test('the terminal draws meters as pixel Rasters, the desktop as SVG bars, and they build up', async ($, on) => {
  const clock = world(on)
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] } as any)
  await $.tool.call({ tool: REPORT, task: 'Read your brand notes', percent: 60 } as any)
  const term = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await term.find({ type: 'Raster', key: 'p0-bar' })).toBeDefined()
  expect(await term.find({ type: 'Raster', key: 'job-bar' })).toBeDefined()
  await term.unmount()
  const desk = await $.ui.mount({ plugin: 'clean-view', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await desk.find({ type: 'Raster' })).toBeUndefined()
  const fill = async (ui: any) => {
    const svg = (await ui.findAll({ type: 'Svg' }))[1]
    return Number(/<desc>(\d+) of \d+ lit<\/desc>/.exec(String(svg?.props?.source ?? ''))?.[1] ?? 0)
  }
  const before = await fill(desk)
  await desk.unmount()
  await clock.advance(1_000)
  const later = await $.ui.mount({ plugin: 'clean-view', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  const after = await fill(later)
  await later.unmount()
  expect(after).toBeGreaterThan(before)
})

// ---- questions in the band ---------------------------------------------------

const QUESTIONS = [
  {
    question: 'Which colour should the page be?',
    header: 'Colour',
    multiSelect: false,
    options: [
      { label: 'Warm', description: 'Coral and cream' },
      { label: 'Cool', description: 'Blue and grey' },
    ],
  },
  {
    question: 'Which sections do you want?',
    header: 'Sections',
    multiSelect: true,
    options: [
      { label: 'Pricing', description: 'Plans and costs' },
      { label: 'Contact', description: 'A form' },
      { label: 'FAQ', description: 'Common questions' },
    ],
  },
]

test('questions parse, answer one at a time, and finish with an answer for each', () => {
  const ask = parseAsk(QUESTIONS, 'u1')!
  expect(ask.questions).toHaveLength(2)
  expect(parseAsk([], 'u1')).toBeUndefined()
  expect(parseAsk('nope', 'u1')).toBeUndefined()
  let a = pressOption(ask, 'Cool')
  expect(a.answers).toEqual(['Cool', null])
  expect(a.current).toBe(1)
  a = pressOption(a, 'Pricing')
  a = pressOption(a, 'FAQ')
  expect(a.picks[1]).toEqual(['Pricing', 'FAQ'])
  expect(isAnswered(a)).toBe(false)
  a = pressOption(a, 'Pricing')
  expect(a.picks[1]).toEqual(['FAQ'])
  a = pressOption(a, 'Pricing')
  a = confirmPicks(a)
  expect(isAnswered(a)).toBe(true)
  expect(askAnswers(a)).toEqual({ 'Which colour should the page be?': 'Cool', 'Which sections do you want?': 'FAQ, Pricing' })
  expect(isAnswered(EMPTY_ASK)).toBe(false)
})

test('typing under Other answers a question, after the ticked labels on a multi-select one', () => {
  let a = answerOther(parseAsk(QUESTIONS, 'u1')!, '  Green  ')
  expect(a.answers[0]).toBe('Green')
  a = pressOption(a, 'Contact')
  a = answerOther(a, 'A map')
  expect(a.answers[1]).toBe('Contact, A map')
  expect(answerOther(a, '   ')).toBe(a)
})

test('question text wraps at spaces, and a word too long for a line is broken', () => {
  expect(wrapText('Which colour should the page be?', 12)).toEqual(['Which colour', 'should the', 'page be?'])
  expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  expect(wrapText('', 10)).toEqual([''])
})

/** Lets a pending tool call reach the point where it waits for the person. */
async function waitForAsk($: any) {
  for (let i = 0; i < 20; i++) await new Promise(r => (globalThis as any).setTimeout(r, 5))
}

async function planned($: any) {
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] } as any)
}

const mountBand = ($: any, cols: number) =>
  $.ui.mount({ plugin: 'clean-view', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: cols } })

test('a question takes the whole band; answering it sends the answers and brings the steps back', async ($, on) => {
  world(on)
  await planned($)
  const before = await band($, 'terminal')
  expect(await before.ui.find({ key: 'o0' })).toBeUndefined()
  await before.ui.unmount()

  const ran: any = await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS.slice(0, 1) } as any)
  expect(ran.deny).toContain('end your turn')
  const wide = await mountBand($, 140)
  expect(await wide.find({ key: 'p0' })).toBeUndefined()
  expect(await wide.find({ key: 'o0' })).toBeDefined()
  expect(await wide.find({ key: 'o1' })).toBeDefined()
  expect(await wide.find({ key: 'q0' })).toBeDefined()
  expect(await wide.find({ key: 'other' })).toBeDefined()
  const texts = (await wide.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join(' ')
  expect(texts).toContain('Which colour should the page be?')
  await wide.press({ key: 'o1' })
  await wide.unmount()
  expect(sent).toEqual(['Here are my answers:\n- Which colour should the page be? Cool'])

  const after = await band($, 'terminal')
  expect(await after.ui.find({ key: 'o0' })).toBeUndefined()
  expect(after.all).toContain('Step 1 of 2')
  expect(await after.ui.find({ key: 'p0' })).toBeDefined()
  await after.ui.unmount()
})

test('a multi-select question ticks options and finishes on Done; Other types an answer; Skip dismisses', async ($, on) => {
  world(on)
  await planned($)
  await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS } as any)
  const narrow = await mountBand($, 90)
  expect(await narrow.find({ key: 'p0' })).toBeUndefined()
  expect(await narrow.find({ key: 'o0' })).toBeDefined()
  await narrow.press({ key: 'q1' })
  await narrow.press({ key: 'o0' })
  await narrow.press({ key: 'o2' })
  expect(String((await narrow.find({ key: 'o0' }))?.text)).toContain('◼')
  expect(await narrow.find({ key: 'done' })).toBeDefined()
  await narrow.press({ key: 'done' })
  expect(sent).toEqual([])
  await narrow.press({ key: 'q0' })
  await narrow.input({ key: 'other', text: 'Green' })
  expect(sent).toEqual(['Here are my answers:\n- Which colour should the page be? Green\n- Which sections do you want? Pricing, FAQ'])
  await narrow.unmount()

  sent.length = 0
  await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS.slice(0, 1) } as any)
  const ui = await mountBand($, 140)
  await ui.press({ key: 'skip' })
  expect(sent[0]).toContain('Skip those questions')
  await ui.unmount()
})

test('a question with no job running still gets the panel', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '.' } as any)
  await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS.slice(0, 1) } as any)
  const ui = await mountBand($, 140)
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join(' ')
  expect(texts).toContain('Which colour should the page be?')
  expect(await ui.find({ key: 'o0' })).toBeDefined()
  await ui.press({ key: 'o0' })
  await ui.unmount()
  expect(sent).toHaveLength(1)
  expect(await mountBand($, 140).then(async (b: any) => (await b.find({ key: 'o0' })) === undefined)).toBe(true)
})

test('the answers read as a short message', () => {
  const a = pressOption(parseAsk(QUESTIONS.slice(0, 1), 'u1')!, 'Warm')
  expect(answersMessage(a)).toBe('Here are my answers:\n- Which colour should the page be? Warm')
})

test('the close button clears a job left waiting for a reply, and has no place on a job that is still working', async ($, on) => {
  world(on)
  await planned($)
  const working = await band($, 'terminal')
  expect(await working.ui.find({ key: 'close' })).toBeUndefined()
  await working.ui.unmount()

  await $.turn.complete(complete('t1', 'answer'))
  const done = await band($, 'terminal')
  expect(done.all).toContain('waiting for your reply')
  await done.ui.press({ key: 'close' })
  await done.ui.unmount()
  const gone = await band($, 'terminal')
  expect(gone.all).toBe('')
  await gone.ui.unmount()
})

test('the close button on a waiting job with a question up skips the question and clears the band', async ($, on) => {
  world(on)
  await planned($)
  await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS.slice(0, 1) } as any)
  const ui = await mountBand($, 140)
  expect(await ui.find({ key: 'close' })).toBeDefined()
  await ui.press({ key: 'close' })
  await ui.unmount()
  expect(sent[0]).toContain('Skip those questions')
  const gone = await band($, 'terminal')
  expect(gone.all).toBe('')
  expect(await gone.ui.find({ key: 'o0' })).toBeUndefined()
  await gone.ui.unmount()
})

test('with helpers still running the band says so, and finishes only after the last one', async ($, on) => {
  const clock = world(on)
  await planned($)
  helpers = [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'running' }]
  await $.turn.complete(complete('t1', 'answer'))
  const waiting = await band($, 'terminal')
  expect(waiting.all).toContain('Waiting for 2 helpers')
  expect(waiting.all).not.toContain('Needs you')
  expect(waiting.all).not.toContain('All done')
  expect(await waiting.ui.find({ key: 'close' })).toBeDefined()
  await waiting.ui.unmount()

  helpers = [{ id: 'a1', status: 'completed' }, { id: 'a2', status: 'running' }]
  await $.turn.complete({ ...complete('h1', 'answer'), agentId: 'a1' })
  await clock.advance(4_000)
  expect((await band($, 'terminal')).all).toContain('Waiting for 2 helpers')

  helpers = [{ id: 'a1', status: 'completed' }, { id: 'a2', status: 'completed' }]
  await $.turn.complete({ ...complete('h2', 'answer'), agentId: 'a2' })
  await clock.advance(4_000)
  const finished = await band($, 'terminal')
  expect(finished.all).not.toContain('Waiting for')
  expect(finished.all).toContain('waiting for your reply')
  await finished.ui.unmount()
})

test("a helper's own turns leave the main job alone", async ($, on) => {
  const clock = world(on)
  await planned($)
  await $.turn.start({ text: 'Read the notes', turnId: 'h0', agentId: 'a1' } as any)
  await $.turn.complete({ ...complete('h1', 'answer'), agentId: 'a1' })
  await clock.advance(4_000)
  const ui = await band($, 'terminal')
  expect(ui.all).toContain('Step 1 of 2')
  expect(ui.all).not.toContain('Needs you')
  expect(ui.all).not.toContain('All done')
  await ui.ui.unmount()
})

test("a helper's question keeps the engine's own dialog", async ($, on) => {
  world(on)
  await planned($)
  const ran: any = await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS.slice(0, 1), agentId: 'a1' } as any)
  expect(ran.deny).toBeUndefined()
  const ui = await mountBand($, 140)
  expect(await ui.find({ key: 'o0' })).toBeUndefined()
  await ui.unmount()
})

test('the accent and the band border follow the Bottom Bar colour', () => {
  expect(paletteFor('dark', 'Sky')).toMatchObject({ accent: '#6FB3E0', border: '#6FB3E0' })
  expect(paletteFor('light', 'Sky').accent).toBe('#2F6FA3')
  expect(paletteFor('dark', 'Nope')).toEqual(paletteFor('dark'))
})

// ---- Steps only ----------------------------------------------------------------

const TOOL_PROPS = { tool_use_id: 'x', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false } as any
const BOX_DRAWING = /[\u2500-\u257F\u2800-\u28FF]/

test('Steps only leaves tool rows in the transcript and keeps the step tools working', { options: { style: 'Steps only' } }, async ($, on) => {
  world(on)
  on('ui.render', { component: 'ToolUse' }, (($: any, e: any) => (globalThis as any).h($.ui.resolve(e).Text, {}, 'Bash ls')) as any)
  await startJob($)
  const planned = await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] } as any)
  expect((planned as any).result).toBe('Planned 2 steps. The first one has started.')
  await $.tool.call({ tool: REPORT, task: 'Read your brand notes', percent: 100 } as any)
  const denied = await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  expect((denied as any).deny).toBeUndefined()
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'clean-view',
      surface,
      component: 'ToolUse',
      props: TOOL_PROPS,
      requestId: 'x',
    } as any)
    expect((await ui.findAll({ type: 'Text' })).length).toBeGreaterThan(0)
    await ui.unmount()
  }
})

test('Steps only draws one compact line per step, with no meters', { options: { style: 'Steps only' } }, async ($, on) => {
  world(on)
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section', 'Add the contact form'] } as any)
  await $.tool.call({ tool: REPORT, task: 'Read your brand notes', percent: 100 } as any)
  await $.tool.call({ tool: REPORT, task: 'Build the pricing section', percent: 60 } as any)
  for (const surface of SURFACES) {
    const { ui, all } = await band($, surface)
    expect(all).toContain('Step 2 of 3')
    expect(all).not.toMatch(BOX_DRAWING)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await rowText($, 'p0', surface)).toMatch(/✓.*Read your brand notes.*done/s)
    expect(await rowText($, 'p1', surface)).toMatch(/▶.*Build the pricing section.*60%/s)
    expect(await rowText($, 'p2', surface)).toMatch(/○.*Add the contact form/s)
    await ui.unmount()
  }
  const term = await mountBand($, 100)
  const rows = await term.findAll({ type: 'Box', props: { height: 1 } })
  expect(rows.length).toBeGreaterThanOrEqual(4)
  await term.unmount()
})

test('Clean (the default) still hides tool rows', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '.' } as any)
  const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', component: 'ToolUse', props: TOOL_PROPS, requestId: 'x' } as any)
  expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
  await ui.unmount()
})

// ---- the desktop app --------------------------------------------------------------

const desktopTexts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join('\n')

test('the desktop band is native: no Raster, no box-drawing or braille, SVG meters with alt text', async ($, on) => {
  world(on)
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] } as any)
  await $.tool.call({ tool: REPORT, task: 'Read your brand notes', percent: 60 } as any)
  const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  const bars = await ui.findAll({ type: 'Svg' })
  expect(bars).toHaveLength(3)
  expect(bars.every((b: any) => String(b.props?.alt ?? '') !== '')).toBe(true)
  expect(String(bars[0]!.props?.alt)).toContain('Step 1 of 2')
  const all = await desktopTexts(ui)
  expect(all).not.toMatch(BOX_DRAWING)
  expect(all).toContain('Step 1 of 2')
  expect(all).toContain('Read your brand notes')
  await ui.unmount()
})

test('desktop questions use native buttons and an Other field, and answer like the terminal', async ($, on) => {
  world(on)
  await planned($)
  await $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS } as any)
  const ui = await $.ui.mount({ plugin: 'clean-view', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await desktopTexts(ui)).not.toMatch(BOX_DRAWING)
  expect(await desktopTexts(ui)).toContain('Which colour should the page be?')
  expect(await ui.find({ type: 'Button', key: 'o0' })).toBeDefined()
  expect(await ui.find({ key: 'other' })).toBeDefined()
  expect(await ui.find({ key: 'skip' })).toBeDefined()
  await ui.press({ key: 'o1' })
  await ui.press({ key: 'o0' })
  await ui.press({ key: 'o2' })
  await ui.press({ key: 'done' })
  await ui.unmount()
  expect(sent).toEqual(['Here are my answers:\n- Which colour should the page be? Cool\n- Which sections do you want? Pricing, FAQ'])
})

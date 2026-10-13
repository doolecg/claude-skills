import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  EMPTY_CHECKLIST,
  cleanName,
  easeToward,
  overall,
  pixelMeter,
  pixelSweep,
  planSteps,
  rasterCells,
  reportProgress,
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

function world(on: On) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }) as any)
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as any)
  on('settings.read', () => ({ value: { theme: 'dark' } }) as any)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as any)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => e as any)
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
  expect(await rowText($, 'p0')).toContain('Working')
  expect(await rowText($, 'p1')).toContain('Next')
  const reported = await $.tool.call({ tool: REPORT, task: 'Read your brand notes', percent: 140 } as any)
  expect((reported as any).result).toBe('Progress noted: 100%.')
  expect(await rowText($, 'p0')).toContain('✓')
  expect(await rowText($, 'p0')).toContain('Done')
  expect(await rowText($, 'p1')).toContain('▶')
  expect(await rowText($, 'p2')).toContain('Next')
})

test('a to-do list plus a 60% report renders done, 60%, Next and Up next on both surfaces', async ($, on) => {
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
    expect(await rowText($, 't0', surface)).toMatch(/✓.*Read your brand notes.*Done/s)
    expect(await rowText($, 't1', surface)).toMatch(/▶.*Build the pricing section.*60%/s)
    expect(await rowText($, 't2', surface)).toMatch(/○.*Add the contact form.*Next/s)
    expect(await rowText($, 't3', surface)).toMatch(/○.*Polish the footer.*Up next/s)
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
  expect((off as any).text).toBe('Clean View is off.')
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
  expect(seen[0]).toEqual({ simple: { label: 'Clean View', isOn: true } })
  expect(seen[seen.length - 1]).toEqual({ simple: { label: 'Clean View', isOn: false } })
})

test('pixel meters are thin, rise through random pixels and build up over time', () => {
  const look = { stops: ['#E8A06A', '#D9667F'], track: '#3A3531', tint: '#FFF6EC', tick: 0 }
  const bits = (p: { ch: string }) => p.ch.charCodeAt(0) - 0x2800
  const count = (list: { ch: string }[]) => list.reduce((n, p) => n + [...bits(p).toString(2)].filter(b => b === '1').length, 0)
  for (const f of [0, 0.3, 0.5, 1]) {
    for (const p of pixelMeter(20, f, look)) expect(bits(p) & ~0x36).toBe(0)
  }
  expect(count(pixelMeter(20, 0, look))).toBeLessThan(40)
  const done = pixelMeter(20, 1, look)
  expect(count(done)).toBe(80)
  expect(pixelMeter(20, 1, { ...look, tick: 9 }).map(p => p.color)).toEqual(done.map(p => p.color))
  const half = pixelMeter(20, 0.5, look)
  expect(count(half.slice(0, 8))).toBeGreaterThan(count(half.slice(12)))
  const other = pixelMeter(20, 0.5, { ...look, seed: 4 })
  expect(other.map(p => p.ch).join('')).not.toBe(half.map(p => p.ch).join(''))
  expect(count(pixelMeter(20, 0.6, look).slice(0, 12))).toBeGreaterThanOrEqual(count(half.slice(0, 12)) - 4)
  const sweep = pixelSweep(10, { ...look, tick: 5 })
  expect(sweep.some(p => p.color !== sweep[9]!.color)).toBe(true)
  expect(rasterCells(half)).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
  expect(rasterCells(half).length).toBe(Math.ceil((20 * 12) / 3) * 4)
  expect(easeToward(0, 1, 0)).toBe(0)
  expect(easeToward(0, 1, 450)).toBeGreaterThan(0.5)
  expect(easeToward(0, 1, 900)).toBe(1)
})

test('the terminal draws meters as pixel Rasters, the desktop as text, and they build up', async ($, on) => {
  const clock = world(on)
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] } as any)
  await $.tool.call({ tool: REPORT, task: 'Read your brand notes', percent: 60 } as any)
  const term = await $.ui.mount({ plugin: 'clean-view', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await term.find({ type: 'Raster', key: 'm0' })).toBeDefined()
  expect(await term.find({ type: 'Raster', key: 'bar' })).toBeDefined()
  await term.unmount()
  const desk = await $.ui.mount({ plugin: 'clean-view', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await desk.find({ type: 'Raster' })).toBeUndefined()
  const warmCells = async (ui: any) =>
    (await ui.findAll({ type: 'Text', text: /[⠀-⣿]/ })).filter((t: any) => t.props?.color !== undefined && t.props.color.toUpperCase() > '#B').length
  const before = await warmCells(desk)
  await desk.unmount()
  await clock.advance(1_000)
  const later = await $.ui.mount({ plugin: 'clean-view', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  const after = await warmCells(later)
  await later.unmount()
  expect(after).toBeGreaterThan(before)
})

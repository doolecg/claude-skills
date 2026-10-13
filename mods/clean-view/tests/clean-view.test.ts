import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { cleanName } from '../hooks/clean-logic'

const PLAN = 'mcp__clean-view__plan_steps'
const REPORT = 'mcp__clean-view__report_progress'
const SURFACES = ['terminal', 'desktop'] as const

const BAND = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 20,
  bodyColumns: 90,
  scroll: { bodyRows: 20 },
  view: {},
} as any

function world(on: On) {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('classic.Notification', () => ({}) as any)
  on('ui.toast', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('model.complete', () => ({
    value: { isAnswered: false, reason: 'aborted', usage: {} },
  }) as any)
  for (const tool of ['Bash', 'TodoWrite', 'AskUserQuestion']) {
    on('tool.call', { tool }, () => ({ result: 'ok', text: 'ok' }) as any)
  }
}

async function startJob($: any, text = 'Build my landing page') {
  await $.session.start({ cwd: '.' })
  await $.turn.start({ text, turnId: 't1' })
}

async function bandText($: any, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ plugin: 'clean-view', surface, component: 'AbovePrompt', props: BAND })
  const texts: string[] = []
  for (const t of await ui.findAll({ type: 'Text' })) texts.push(String(t.text))
  const out = { ui, all: texts.join('\n'), texts }
  return out
}

test('cleanName drops code, paths and file names, and trims long names', () => {
  expect(cleanName('Build the pricing section in `src/Pricing.tsx`')).toBe('Build the pricing section in')
  expect(cleanName('Edit src/app/Main.java now')).toBe('Edit now')
  expect(cleanName('fix Pricing.tsx bug')).toBe('Fix bug')
  expect(cleanName('')).toBe('Working on it')
  expect(cleanName('`a/b`')).toBe('Working on it')
  const long = cleanName('Rewrite the entire onboarding experience so that every new customer feels welcome and informed from day one')
  expect(long.length).toBeLessThanOrEqual(40)
  expect(long.endsWith('…')).toBe(true)
})

test('plan_steps then report_progress 100 checks off step one and starts step two', async ($, on) => {
  world(on)
  await startJob($)
  const planned = await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section', 'Add the contact form'] })
  expect(planned.deny).toBeUndefined()
  const row = async (id: string) => {
    const { ui } = await bandText($, 'terminal')
    const found = await ui.find({ key: id })
    await ui.unmount()
    return String(found?.text ?? '')
  }
  expect(await row('p0')).toContain('▶')
  expect(await row('p1')).toContain('Next')
  await $.tool.call({ tool: REPORT, task: 'Read your brand notes', percent: 100 })
  expect(await row('p0')).toContain('Done')
  expect(await row('p1')).toContain('▶')
  expect(await row('p1')).toContain('Working')
  await $.tool.call({ tool: REPORT, task: 'Build the pricing section', percent: 60 })
  expect(await row('p1')).toContain('60%')
  expect(await row('p2')).toContain('Next')
})

test('a to-do list plus a 60% report renders done, 60%, Next, Up next on every surface', async ($, on) => {
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
  await $.tool.call({ tool: REPORT, task: 'Build the pricing section', percent: 60 })
  for (const surface of SURFACES) {
    const { ui, all } = await bandText($, surface)
    expect(all).toContain('Build my landing page')
    expect(all).toContain('✓')
    expect(all).toContain('Done')
    expect(all).toContain('60%')
    expect(all).toContain('Up next')
    expect(all).toMatch(/Next/)
    expect(all).toContain('▶')
    expect(await ui.find({ type: 'Button', key: 'toggle' })).toBeDefined()
    await ui.unmount()
  }
})

test('a permission prompt shows Needs you', async ($, on) => {
  world(on)
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] })
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  for (const surface of SURFACES) {
    const { ui, all } = await bandText($, surface)
    expect(all).toContain('Needs you')
    expect(all).toContain('Claude needs your OK to continue')
    expect(all).toContain('‖')
    await ui.unmount()
  }
})

test('/simple off hides the band, leaving only the button', async ($, on) => {
  world(on)
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] })
  await $.command.run({ command: 'simple', args: 'off' })
  for (const surface of SURFACES) {
    const { ui, all } = await bandText($, surface)
    expect(all).not.toContain('Build my landing page')
    expect(all).not.toContain('Read your brand notes')
    const toggle = await ui.find({ type: 'Button', key: 'toggle' })
    expect(toggle?.text).toContain('OFF')
    await ui.unmount()
  }
  await $.command.run({ command: 'simple', args: '' })
  const { ui, all } = await bandText($, 'terminal')
  expect(all).toContain('Read your brand notes')
  await ui.unmount()
})

test('technical rows are hidden while on and come back when off', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '.' })
  for (const surface of SURFACES) {
    const props = { tool_use_id: 'x', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false } as any
    const ui = await $.ui.mount({ plugin: 'clean-view', surface, component: 'ToolUse', props, requestId: 'x' })
    expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
    await ui.unmount()
  }
})

test('tools are denied before a plan exists and allowed after', async ($, on) => {
  world(on)
  await startJob($)
  const denied = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(denied.deny).toContain('plan_steps')
  const search = await $.tool.call({ tool: 'TodoWrite', todos: [] } as any)
  expect(search.deny).toBeUndefined()
  await $.tool.call({ tool: PLAN, steps: ['Look around', 'Report back'] })
  const allowed = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(allowed.deny).toBeUndefined()
})

test('turn complete: finished, then an API error', async ($, on) => {
  world(on)
  await startJob($)
  await $.tool.call({ tool: PLAN, steps: ['Look around'] })
  await $.tool.call({ tool: REPORT, task: 'Look around', percent: 100 })
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  for (const surface of SURFACES) {
    const { ui, all } = await bandText($, surface)
    expect(all).toContain('All done')
    await ui.unmount()
  }
  await $.turn.start({ text: 'Do another thing', turnId: 't2' })
  await $.turn.complete({ answer: 'API Error: 429 rate limit', durationMs: 5, isAborted: false, turnId: 't2', reason: 'error' })
  const { ui, all } = await bandText($, 'terminal')
  expect(all).toContain('Stuck')
  expect(all).toContain('usage limit')
  await ui.unmount()
})

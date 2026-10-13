import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  applyProgress,
  atATime,
  badgeText,
  clock,
  EMPTY_DOCK,
  initials,
  instructionText,
  jobName,
  nudgeText,
  parseSize,
  restoreSize,
  summary,
  taskName,
} from '../hooks/dock-logic'

const SURFACES = ['terminal', 'desktop'] as const
const REPORT = 'mcp__clean-view__report_progress'
const PLAN = 'mcp__clean-view__plan_steps'
const PANE = {
  title: 'Agent Dock',
  isFocused: false,
  bodyColumns: 76,
  placement: 'dock',
  scroll: { bodyRows: 40 },
  view: {},
} as any
const BAND = { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 90, scroll: { bodyRows: 20 }, view: {} } as any

function world(on: On, entries: Record<string, unknown> = {}, sessionId = 's1') {
  const clk = mock.clock(on, { now: 5_000_000 })
  mock.store(on, entries)
  const seen = { submits: [] as string[], status: [] as (string | undefined)[], isOpen: false, toasts: [] as string[], agentModels: [] as unknown[] }
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: sessionId }) as any)
  on('env.get', () => ({ value: undefined }) as any)
  on('fs.write', () => ({ value: undefined }) as any)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('classic.Notification', () => ({}) as any)
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage: {} } }) as any)
  on('ui.toast', (_$, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    seen.status.push(e.text)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => {
    seen.isOpen = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    seen.isOpen = false
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: seen.isOpen ? [{ id: 'agent-dock', title: 'Agent Dock', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
  on('prompt.submit', (_$, e) => {
    if (e.origin.kind === 'plugin') seen.submits.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('tool.call', { tool: 'Agent' }, (_$, e) => {
    seen.agentModels.push((e as any).model)
    return { result: 'finished', text: 'finished' } as any
  })
  return { clk, seen }
}

async function pane($: any, surface: (typeof SURFACES)[number] = 'terminal') {
  const ui = await $.ui.mount({ plugin: 'clean-view', surface, component: 'Pane', props: PANE, requestId: 'agent-dock' })
  const texts: string[] = []
  for (const t of await ui.findAll({ type: 'Text' })) texts.push(String(t.text))
  return { ui, all: texts.join('\n') }
}

async function launch($: any, n: number, text = 'Research bakery pricing') {
  await $.session.start({ cwd: '.' })
  const { ui } = await pane($)
  await ui.press({ key: `size-${n}` })
  await ui.unmount()
  const sent = await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
  await $.tool.call({ tool: PLAN, steps: ['Split the work', 'Combine the results'] })
  return sent
}

async function until(clk: { advance: (ms: number) => Promise<unknown> }, ok: () => boolean) {
  for (let i = 0; i < 40 && !ok(); i++) await clk.advance(10)
}

function appendAgents($: any, names: string[]) {
  return $.session.append({
    door: 'response',
    origin: { kind: 'model', model: 'm' },
    uuid: 'u1',
    message: {
      type: 'assistant',
      role: 'assistant',
      content: names.map((name, i) => ({ type: 'tool_use', id: `tu${i}`, name: 'Agent', input: { description: name, prompt: 'go' } })),
    },
  })
}

test('parseSize accepts whole numbers 1 to 100 only', () => {
  expect(parseSize('10')).toBe(10)
  expect(parseSize(' 25 ')).toBe(25)
  for (const bad of ['0', '101', 'abc', '2.5', '', '-3']) expect(parseSize(bad)).toBeNull()
})

test('a saved size above 20 resets in a new session, 10 stays', () => {
  expect(restoreSize(50, false)).toBe(1)
  expect(restoreSize(10, false)).toBe(10)
  expect(restoreSize(50, true)).toBe(50)
  expect(restoreSize('x', false)).toBe(1)
})

test('logic helpers: names, initials, texts, counts and clocks', () => {
  expect(jobName('Research bakery pricing, then write a report')).toBe('Research bakery pricing')
  expect(jobName('x'.repeat(10) + ' ' + 'word '.repeat(20)).length).toBeLessThanOrEqual(40)
  expect(taskName('Price check: Panera Bread near me today')).toBe('Price check: Panera Bread near')
  expect(initials('Price check: Panera')).toBe('PP')
  expect(instructionText(5)).toContain('exactly 5 independent pieces')
  expect(nudgeText(3, 10)).toBe('You used 3 of 10 helpers. Split the remaining work across the other 7, one helper per piece, all in parallel.')
  expect(atATime('20', '20')).toBe(20)
  expect(atATime(undefined, undefined)).toBe(10)
  expect(clock(72_000)).toBe('1:12')
  expect(summary(50, 'Research bakery pricing', 134_000, 0)).toBe('50 agents finished Research bakery pricing in 2m 14s')
  expect(summary(3, 'X', 5000, 1)).toBe('3 agents finished X in 5s (1 got stuck)')
  const d = { ...EMPTY_DOCK, cards: [] }
  expect(badgeText(d.cards)).toBe('0 working · 0 queued · 0 done')
  const withCard = {
    ...EMPTY_DOCK,
    cards: [{ id: 'a', name: 'Price check: Panera', status: 'working' as const, percent: 0, hasReported: false, startedAt: 1, endedAt: 0, agentId: '' }],
  }
  const moved = applyProgress(withCard, 'agent-9', 'Price check: Panera', 60)
  expect(moved.cards[0]?.percent).toBe(60)
  expect(moved.cards[0]?.agentId).toBe('agent-9')
})

test('size 5 adds the exactly-5 instruction, size 1 adds nothing', async ($, on) => {
  world(on)
  const sent = await launch($, 5)
  expect(sent.context?.join('\n')).toContain('exactly 5 independent pieces')
  expect(sent.context?.join('\n')).toContain('report_progress')
  const { ui } = await pane($)
  await ui.press({ key: 'size-1' })
  await ui.unmount()
  const plain = await $.prompt.submit({ text: 'Hello again', origin: { kind: 'composer' }, wait: false })
  expect(plain.context ?? []).toHaveLength(0)
})

test('the 6th Agent call at size 5 is denied with the Team Size message', async ($, on) => {
  world(on)
  await launch($, 5)
  const results = []
  for (let i = 0; i < 6; i++) {
    results.push(await $.tool.call({ tool: 'Agent', description: `Part ${i}`, prompt: 'go' } as any))
  }
  expect(results.slice(0, 5).every(r => r.deny === undefined)).toBe(true)
  expect(results[5]?.deny).toBe('Team Size is 5: this request already has 5 helpers. Finish with the helpers you have.')
})

test('Fast & Cheap routes helpers to haiku only above size 1', async ($, on) => {
  const { seen } = world(on)
  await launch($, 3)
  await $.tool.call({ tool: 'Agent', description: 'Part one', prompt: 'go' } as any)
  expect(seen.agentModels[0]).toBe('haiku')
})

test('a request that used 3 of 10 helpers gets exactly one nudge', async ($, on) => {
  const { seen, clk } = world(on)
  await launch($, 10)
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Agent', description: `Part ${i}`, prompt: 'go' } as any)
  const done = { answer: 'ok', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as const
  await $.turn.complete(done)
  await clk.advance(10)
  await $.turn.complete(done)
  await clk.advance(10)
  expect(seen.submits).toEqual([nudgeText(3, 10)])
})

test('three Agent calls show three queued cards, then done, and the summary line', async ($, on) => {
  world(on)
  await launch($, 3)
  await appendAgents($, ['Price check: Panera', 'Price check: Crumbl', 'Price check: Nothing Bundt'])
  for (const surface of SURFACES) {
    const { ui, all } = await pane($, surface)
    expect(all).toContain('0 working')
    expect(all).toContain('3 queued')
    expect(all).toContain('Price check: Panera')
    expect(all).toContain('PP')
    await ui.unmount()
  }
  for (let i = 0; i < 3; i++) {
    await $.tool.call({ tool: 'Agent', tool_use_id: `tu${i}`, description: `Price check: ${i}`, prompt: 'go' } as any)
  }
  for (const surface of SURFACES) {
    const { ui, all } = await pane($, surface)
    expect(all).toContain('3 done')
    expect(all).toContain('3 agents finished Research bakery pricing in')
    expect(all).toContain('C O M P L E T E')
    await ui.unmount()
  }
})

test('a helper report_progress moves its card meter', async ($, on) => {
  world(on)
  await launch($, 3)
  await $.tool.call({ tool: 'Agent', description: 'Price check: Panera', prompt: 'go' } as any)
  const out = await $.tool.call({ tool: REPORT, task: 'Price check: Panera', percent: 60, agentId: 'helper-1' } as any)
  expect(out.deny).toBeUndefined()
  expect(out.result).toBe('Progress noted: 60%.')
})

test('/dock folds to a status badge and reopens', async ($, on) => {
  const { seen, clk } = world(on)
  await launch($, 3)
  await appendAgents($, ['A one', 'B two', 'C three'])
  seen.isOpen = false
  await $.command.run({ command: 'dock', args: '' })
  await until(clk, () => seen.isOpen)
  expect(seen.isOpen).toBe(true)
  await $.command.run({ command: 'dock', args: '' })
  await until(clk, () => !seen.isOpen)
  expect(seen.isOpen).toBe(false)
  await until(clk, () => seen.status.at(-1) !== undefined)
  expect(seen.status.at(-1)).toBe('◆ 0 working · 3 queued · 0 done')
  await $.command.run({ command: 'dock', args: '' })
  await until(clk, () => seen.isOpen)
  expect(seen.isOpen).toBe(true)
  const bad = await $.command.run({ command: 'dock', args: 'abc' })
  expect(bad.text).toBe('Team Size is a whole number from 1 to 100, e.g. /dock 10.')
  const big = await $.command.run({ command: 'dock', args: '50' })
  expect(big.text).toBe('Confirm the team of 50 in the Agent Dock.')
})

test('sizes above 20 ask first and never carry to a new session', async ($, on) => {
  const { clk } = world(on, { dock: { teamSize: 50, helperModel: 'fast', sessionId: 'older' } })
  await $.session.start({ cwd: '.' })
  for (const surface of SURFACES) {
    const { ui, all } = await pane($, surface)
    expect(all).toContain('Claude decides how many helpers')
    expect(all).not.toContain('across 50 helpers')
    await ui.press({ key: 'size-50' })
    const after = await ui.find({ type: 'Text', text: /Big team/ })
    expect(after).toBeDefined()
    await ui.press({ key: 'cancel' })
    await ui.unmount()
  }
  await clk.advance(1)
})

test('the band keeps a Dock button next to the Clean View button, and it opens the dock', async ($, on) => {
  const { seen, clk } = world(on)
  await $.session.start({ cwd: '.' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'clean-view', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Button', key: 'dock' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'toggle' })).toBeDefined()
    seen.isOpen = false
    await ui.press({ key: 'dock' })
    await until(clk, () => seen.isOpen)
    expect(seen.isOpen).toBe(true)
    await ui.unmount()
  }
})

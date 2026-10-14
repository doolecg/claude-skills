import { describe, expect, mock, test } from 'claude-code/testing'

import { NAMES, critterOf, critterPixels, rasterOf } from '../hooks/critter'
import {
  DARK,
  LIGHT,
  agentMetrics,
  applyStep,
  costOf,
  fmtDuration,
  fmtTokens,
  groupAgents,
  modelName,
  newAgent,
  paletteFor,
  reconcile,
  statusFromList,
  summaryOf,
  wantOpen,
  windowOf,
} from '../hooks/logic'
import { DENSE_FULL, sbMeter, sbRasterCells, sbSweep } from '../hooks/sidebar-kit'

const PLUGIN = 'flightdeck'
const T0 = 1_800_000_000_000
const SESSION = { cwd: 'F:/proj', surface: 'terminal', isInteractive: true } as any
const USAGE = { input_tokens: 10, output_tokens: 900, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 5_000 }

const pane = (bodyColumns = 60) =>
  ({
    plugin: PLUGIN,
    component: 'Pane' as const,
    requestId: 'flightdeck',
    props: { title: 'Flightdeck', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  }) as any

const command = (args = '') =>
  ({ command: 'flightdeck', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }) as any

// ---------------------------------------------------------------- pure behaviour

describe('logic', () => {
  test('model names, tokens and times read plainly', () => {
    expect(modelName('claude-haiku-5-5')).toBe('Haiku 5.5')
    expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
    expect(modelName('haiku')).toBe('Haiku')
    expect(modelName('inherit')).toBe('')
    expect(fmtTokens(35_900)).toBe('35.9k')
    expect(fmtTokens(812)).toBe('812')
    expect(fmtDuration(6_000)).toBe('0:06')
    expect(fmtDuration(3_725_000)).toBe('1:02:05')
  })

  test('the palette is Bottom Bar’s, picked by the theme', () => {
    expect(paletteFor('dark')).toBe(DARK)
    expect(paletteFor('light-daltonized')).toBe(LIGHT)
    expect(DARK.border).toBe('#4E4943')
    expect(DARK.panel).toBe('#24201D')
    expect(LIGHT.accent).toBe('#C15F3C')
  })

  test('an agent step sets its context and adds up its cost', () => {
    const a = applyStep(newAgent('a1', T0), { model: 'claude-haiku-5-5', usage: { ...USAGE, model: 'claude-haiku-5-5' } })
    expect(a.ctxTokens).toBe(35_910)
    expect(a.steps).toBe(1)
    expect(a.isCostKnown).toBe(true)
    expect(Math.abs(a.costUsd - costOf(USAGE, 'claude-haiku-5-5')!) < 1e-12).toBe(true)
    const b = applyStep(a, { model: 'claude-haiku-5-5', usage: { ...USAGE, model: 'claude-haiku-5-5' } })
    expect(Math.abs(b.costUsd - a.costUsd * 2) < 1e-12).toBe(true)
    const unpriced = applyStep(newAgent('a2', T0), { model: 'some-other-model', usage: { ...USAGE, model: 'some-other-model' } })
    expect(unpriced.isCostKnown).toBe(false)
    expect(windowOf('claude-haiku-4-5', '', 0)).toBe(200_000)
    expect(windowOf('claude-opus-5-5', 'claude-opus-5-5[1m]', 1_000_000)).toBe(1_000_000)
  })

  test('the agent list fills in what the hooks missed', () => {
    const known = [newAgent('a1', T0, { description: 'Say hi' })]
    const listed = [
      { id: 'a1', description: 'Say hi', type: 'general-purpose', status: 'completed' },
      { id: 'a2', description: 'Look around', type: 'Explore', status: 'running' },
      { id: 'mate', description: 'team', type: 'teammate', status: 'running', teammateId: 'x@team' },
    ]
    const out = reconcile(known, listed, T0 + 5000)
    expect(out.map(a => [a.id, a.status])).toEqual([
      ['a1', 'done'],
      ['a2', 'running'],
    ])
    expect(out[0]!.endedAt).toBe(T0 + 5000)
    expect(reconcile(out, listed, T0 + 9000)).toBe(out)
    expect(statusFromList('killed')).toBe('stopped')
    expect(statusFromList('idle')).toBe('waiting')
  })

  test('groups, totals and the metrics line', () => {
    const run = applyStep(newAgent('r', T0 + 2000), { model: 'claude-haiku-5-5', usage: { ...USAGE, model: 'claude-haiku-5-5' } })
    const done = { ...newAgent('d', T0, { status: 'done' as const, endedAt: T0 + 6000 }) }
    const g = groupAgents([done, run])
    expect(g.working.map(a => a.id)).toEqual(['r'])
    expect(g.finished.map(a => a.id)).toEqual(['d'])
    const s = summaryOf([done, run], T0 + 8000)
    expect(s.tokens).toBe('35.9k')
    expect(s.time).toBe('0:08')
    expect(agentMetrics(run, 200_000, T0 + 8000)).toBe('ctx 18% · 35.9k  ≈$0.001  0:06')
    expect(wantOpen('', false)).toBe(true)
    expect(wantOpen('', true)).toBe(false)
    expect(wantOpen('open', true)).toBe(true)
    expect(wantOpen('off', false)).toBe(false)
  })

  test('pixel meters and critters have the size they are drawn at', () => {
    const look = { stops: ['#E8A06A', '#D9667F'], track: '#3A3531', tint: '#FFF6EC', tick: 3 }
    expect(sbMeter(20, 0.4, look)).toHaveLength(20)
    expect(sbSweep(20, look)).toHaveLength(20)
    expect(sbMeter(8, 1, look).every(p => p.ch === DENSE_FULL)).toBe(true)
    // Three 32-bit words per cell, base64: 12 bytes is 16 characters.
    expect(sbRasterCells(sbMeter(5, 0.5, look), '#24201D')).toHaveLength(5 * 16)
    const r = rasterOf(critterPixels('agent-1'))
    expect([r.columns, r.rows]).toEqual([12, 6])
    expect(critterOf('agent-1')).toEqual(critterOf('agent-1'))
    expect(NAMES).toContain(critterOf('agent-1').name)
    expect(critterPixels('agent-1', true)[0]!.every(c => c === -1)).toBe(true)
  })
})

// ---------------------------------------------------------------- wiring

type World = { opened: any[]; closed: string[]; panes: string[]; modes: unknown[]; listed: any[] }

function world(on: any): World {
  const w: World = { opened: [], closed: [], panes: [], modes: [], listed: [] }
  const clock = mock.clock(on, { now: T0 })
  void clock
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('settings.read', () => ({ value: { theme: 'dark', effortLevel: 'high' } }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.usage', () => ({
    value: {
      startedAt: T0,
      context: { window: 1_000_000, tokens: 230_000, percent: 23 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 31 },
        { kind: 'seven_day', percentUsed: 12 },
      ],
      cost: { usd: 1.42 },
    },
  }))
  on('agent.list', () => ({ value: w.listed }))
  on('agent.spawn', (_$: any, e: any) => ({ agentId: `agent-${e.tool_use_id}`, model: 'claude-haiku-5-5' }))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  on('turn.step', async function* (_$: any, e: any) {
    const usage = { ...USAGE, model: e.model }
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage }
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  on('ui.open', (_$: any, e: any) => {
    w.opened.push(e)
    if (!w.panes.includes(e.id)) w.panes.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$: any, e: any) => {
    w.closed.push(e.id)
    w.panes = w.panes.filter(p => p !== e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: w.panes.map(id => ({ id, title: 'Flightdeck', isShown: true, isFocused: false, isPlaced: true })) }))
  on('state.set', { key: 'modes' }, async (_$: any, e: any, next: any) => {
    w.modes.push(e.value)
    return next(e)
  })
  return w
}

const spawn = ($: any, id: string, description = 'Say hi (agent one)') =>
  $.agent.spawn({ tool_use_id: id, prompt: 'say hi', description, subagentType: 'general-purpose', provider: { plugin: 'engine', tier: 'core' } })

async function step($: any, agentId: string | undefined) {
  const s = $.turn.step({ turnId: 'S1', index: 0, model: 'claude-haiku-5-5', messageCount: 1, ...(agentId ? { agentId } : {}) })
  for await (const _ of s) void _
  await s.result
}

async function texts($: any, surface: 'terminal' | 'desktop' = 'terminal', cols = 60) {
  const ui = await $.ui.mount({ ...pane(cols), surface })
  const all = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join('\n')
  return { ui, all }
}

describe('wiring', () => {
  test('/flightdeck opens the sidebar, publishes the mode on, and closes it again', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(w.modes.at(-1)).toEqual({ flightdeck: { label: 'Flightdeck', isOn: false } })
    const opened = await $.command.run(command())
    expect(opened.text).toBe('Flightdeck opened.')
    expect(w.opened[0]).toMatchObject({ id: 'flightdeck', title: 'Flightdeck', columns: 56 })
    expect(w.modes.at(-1)).toEqual({ flightdeck: { label: 'Flightdeck', isOn: true } })
    const closed = await $.command.run(command())
    expect(closed.text).toBe('Flightdeck closed.')
    expect(w.closed).toEqual(['flightdeck'])
    expect(w.modes.at(-1)).toEqual({ flightdeck: { label: 'Flightdeck', isOn: false } })
  })

  test('the main card shows the model, effort, context, cost and limits', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    for (const surface of ['terminal', 'desktop'] as const) {
      const { ui, all } = await texts($, surface)
      expect(all).toContain('FLIGHTDECK')
      expect(all).toContain('Opus 5.5')
      expect(all).toContain('high')
      expect(all).toContain('23%')
      expect(all).toContain('$1.42')
      expect(all).toContain('5h ')
      expect(all).toContain('7d ')
      expect(all).toContain('No subagents yet')
      await ui.unmount()
    }
  })

  test('a subagent shows while it works and moves to finished when it ends', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    await $.turn.start({ text: 'use two agents', turnId: 't1' })
    await spawn($, 'one')
    await spawn($, 'two', 'Say hi (agent two)')
    await step($, 'agent-one')
    const name = critterOf('agent-one').name

    const during = await texts($)
    expect(during.all).toContain('Working')
    expect(during.all).toContain('Say hi (agent one)')
    expect(during.all).toContain('Say hi (agent two)')
    expect(during.all).toContain(name)
    expect(during.all).toContain('Haiku 5.5')
    expect(during.all).toMatch(/ctx 4% · 35\.9k/)
    expect(during.all).toContain('2 agents working')
    expect(await during.ui.findAll({ type: 'Raster' })).not.toHaveLength(0)
    await during.ui.unmount()

    await $.turn.complete({ answer: 'hi', durationMs: 6000, isAborted: false, reason: 'answer', turnId: 'S1', agentId: 'agent-one' } as any)
    const after = await texts($)
    expect(after.all).toMatch(/Finished/)
    expect(after.all).toContain('✓ ')
    expect(after.all).toContain('1 agent working')
    await after.ui.unmount()
  })

  test('a narrow sidebar still draws every card', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    await spawn($, 'one')
    await step($, 'agent-one')
    for (const cols of [30, 44, 90]) {
      const { ui, all } = await texts($, 'terminal', cols)
      expect(all).toContain('FLIGHTDECK')
      expect(all).toContain(critterOf('agent-one').name)
      await ui.unmount()
    }
  })
})

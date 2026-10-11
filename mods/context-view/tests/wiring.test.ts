import { describe, expect, test } from 'claude-code/testing'

import { PARTS_37, makeUsage, usageAt } from './builder'
import { REAL_USAGE } from './fixture-real'

const PLUGIN = 'context-view'
const SURFACES = ['terminal', 'desktop'] as const

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
}
const pane = (bodyColumns = 100) =>
  ({
    component: 'Pane' as const,
    requestId: 'ctx',
    props: { title: 'Context', isFocused: false, bodyColumns, placement: 'inline', scroll: { offset: 0, bodyRows: 40 } },
  }) as any

const ON = { options: { showBand: true } }
const MESSAGES = [{ role: 'user', text: 'hello', toolUses: [] }]
const SESSION = { cwd: '/proj', surface: 'terminal', isInteractive: true } as any
const MEASURE = (changed: string[] = ['context']) =>
  ({ context: { window: 200_000, tokens: 1 }, rateLimits: [], changed }) as any

// What the engine would sit beneath the plugin: the usage op, pane opening, toasts and the band's own base.
type Current = { usage: any; fail?: string; placed?: any; theme?: string; denySet?: boolean }
type Log = { usage: any[]; toasts: string[]; opened: any[]; registered: string[]; compacts: number; sets: any[] }

function engine(on: any, current: Current, log: Log) {
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('command.register', (_$: any, e: any) => {
    log.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.usage', (_$: any, e: any) => {
    log.usage.push(e)
    if (current.fail) throw new Error(current.fail)
    return { value: current.usage }
  })
  on('ui.open', (_$: any, e: any) => {
    log.opened.push(e)
    return { value: current.placed ?? { isPlaced: true } }
  })
  on('ui.toast', (_$: any, e: any) => {
    log.toasts.push(e.text)
    return { value: undefined }
  })
  on('config.set', (_$: any, e: any) => {
    log.sets.push({ key: e.key, value: e.value })
    return current.denySet ? { deny: 'managed' } : { value: e.value }
  })
  on('config.list', () => ({ value: [{ key: 'theme', value: current.theme ?? 'dark' }] }))
  on('session.compact', () => {
    log.compacts += 1
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['below me'] }))
}

const fresh = (): Log => ({ usage: [], toasts: [], opened: [], registered: [], compacts: 0, sets: [] })
const textOf = async (ui: any, query: any) => (await ui.find(query))?.text

describe('refresh', () => {
  test('session.start registers /ctx and reads a free summary', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600) }, log)
    await $.session.start(SESSION)
    expect(log.registered).toEqual(['ctx'])
    expect(log.usage).toHaveLength(1)
    expect(log.usage[0]).toMatchObject({ breakdown: 'summary' })
  })

  test('session.measure refreshes when the context moved, not when only cost did', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600) }, log)
    await $.session.start(SESSION)
    const before = log.usage.length
    await $.session.measure(MEASURE(['cost']))
    expect(log.usage.length).toBe(before)
    await $.session.measure(MEASURE(['context']))
    expect(log.usage.length).toBe(before + 1)
    expect(log.usage[before]).toMatchObject({ breakdown: 'summary' })
  })

  test('the band follows each measure', ON, async ($, on) => {
    const log = fresh()
    const current = { usage: usageAt(73_600) }
    engine(on, current, log)
    await $.session.start(SESSION)
    await $.session.measure(MEASURE())
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await textOf(ui, { type: 'Text', text: /ctx 37%/ })).toContain('ctx 37% · 73.6k / 200k')
    current.usage = usageAt(100_000)
    await $.session.measure(MEASURE())
    expect(await textOf(ui, { type: 'Text', text: /ctx / })).toContain('ctx 50% · 100k / 200k')
  })

  test('session.compact refreshes, and a precompute does not', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600) }, log)
    await $.session.start(SESSION)
    const before = log.usage.length
    await $.session.compact({ trigger: 'precompute', messages: MESSAGES } as any)
    expect(log.usage.length).toBe(before)
    await $.session.compact({ trigger: 'manual', messages: MESSAGES } as any)
    expect(log.usage.length).toBe(before + 1)
  })

  test('a failing usage call is kept as a line, not thrown', async ($, on) => {
    const log = fresh()
    const current: Current = { usage: usageAt(73_600) }
    engine(on, current, log)
    await $.session.start(SESSION)
    current.fail = 'no session bound'
    await $.session.measure(MEASURE())
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...pane() })
    expect(await textOf(ui, { type: 'Text', text: /Could not read context numbers/ })).toContain('Could not read context numbers')
  })
})

describe('/ctx', () => {
  test('opens the pane after a fresh read', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600) }, log)
    await $.session.start(SESSION)
    const before = log.usage.length
    const out = await $.command.run({ command: 'ctx', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as any)
    expect(out.text).toBe('Context view opened.')
    expect(log.usage.length).toBe(before + 1)
    expect(log.opened).toEqual([{ id: 'ctx', title: 'Context' }])
  })

  test('says so when the pane cannot be placed', async ($, on) => {
    const log = fresh()
    const current: Current = { usage: usageAt(73_600), placed: { isPlaced: false, reason: 'narrow' } }
    engine(on, current, log)
    await $.session.start(SESSION)
    await $.session.measure(MEASURE())
    const out = await $.command.run({ command: 'ctx', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 60 } } as any)
    expect(out.text).toContain('ctx 37% · 73.6k / 200k')
    expect(out.text).toContain('wider')
  })
})

describe('toast', () => {
  test('once, the first time the meter is red', async ($, on) => {
    const log = fresh()
    const current = { usage: usageAt(100_000) }
    engine(on, current, log)
    await $.session.start(SESSION)
    expect(log.toasts).toEqual([])
    current.usage = usageAt(142_000)
    await $.session.measure(MEASURE())
    expect(log.toasts).toHaveLength(1)
    expect(log.toasts[0]).toContain('/compact')
    current.usage = usageAt(150_000)
    await $.session.measure(MEASURE())
    current.usage = usageAt(100_000)
    await $.session.measure(MEASURE())
    current.usage = usageAt(160_000)
    await $.session.measure(MEASURE())
    expect(log.toasts).toHaveLength(1)
  })

  test('no toast before the first response', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(160_000, { apiUsage: null }) }, log)
    await $.session.start(SESSION)
    await $.session.measure(MEASURE())
    expect(log.toasts).toEqual([])
  })
})

describe('band', () => {
  test('amber and red colours, and the hint to compact only in red', ON, async ($, on) => {
    const log = fresh()
    const current = { usage: usageAt(73_600) }
    engine(on, current, log)
    await $.session.start(SESSION)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
      expect((await ui.find({ type: 'Text', text: /^ctx 37%/ }))?.props.color).toBe('inactive')
      current.usage = usageAt(120_000)
      await $.session.measure(MEASURE())
      expect((await ui.find({ type: 'Text', text: /^ctx 60%/ }))?.props.color).toBe('warning')
      expect(await ui.find({ text: /\/compact/ })).toBeUndefined()
      current.usage = usageAt(150_000)
      await $.session.measure(MEASURE())
      expect((await ui.find({ type: 'Text', text: /^ctx 75%/ }))?.props.color).toBe('error')
      expect(await ui.find({ text: /you can run \/compact/ })).toBeDefined()
      current.usage = usageAt(73_600)
      await $.session.measure(MEASURE())
      await ui.unmount()
    }
  })

  test('keeps what the band below it draws, and yields to a survey', ON, async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600) }, log)
    await $.session.start(SESSION)
    await $.session.measure(MEASURE())
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
    expect(await ui.find({ text: /^ctx 37%/ })).toBeDefined()
    expect(await ui.find({ text: 'below me' })).toBeDefined()
    const survey = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND, props: { ...BAND.props, hasSurvey: true } })
    expect(await survey.find({ text: /^ctx/ })).toBeUndefined()
    expect(await survey.find({ text: 'below me' })).toBeDefined()
  })

  test('draws nothing of its own before the first response', ON, async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600, { apiUsage: null }) }, log)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ text: /^ctx/ })).toBeUndefined()
    expect(await ui.find({ text: 'below me' })).toBeDefined()
  })
})

describe('pane', () => {
  test('rows, footer and the grid on each surface: a Raster on the terminal, an Svg elsewhere', async ($, on) => {
    const log = fresh()
    engine(on, { usage: makeUsage({ window: 200_000, parts: PARTS_37, buffer: 33_000 }) }, log)
    await $.session.start(SESSION)
    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...pane() })
      expect(await ui.find({ text: /73\.6k \/ 200k tokens \(37%\)/ })).toBeDefined()
      expect(await ui.find({ text: 'Sonnet 5.5' })).toBeDefined()
      expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeDefined()
      expect(await ui.find({ type: surface === 'terminal' ? 'Svg' : 'Raster' })).toBeUndefined()
      expect(await ui.find({ text: 'Auto-compact at 167k (56% left)' })).toBeDefined()
      expect(await ui.find({ text: /Last response: input 5/ })).toBeDefined()
      expect(await ui.find({ text: /loaded on demand, not in the window/ })).toBeDefined()
      const keys = (await ui.findAll({ type: 'Button' })).map((b: any) => b.key).filter((k: string) => k.startsWith('cat:'))
      expect(keys).toEqual(['cat:System prompt', 'cat:System tools', 'cat:Memory files', 'cat:Skills', 'cat:Messages', 'cat:Free space', 'cat:Autocompact buffer', 'cat:MCP tools (deferred)'])
      await ui.unmount()
    }
  })

  test('the recorded 1M window draws 20 wide, the narrow pane 5 wide', async ($, on) => {
    const log = fresh()
    engine(on, { usage: REAL_USAGE }, log)
    await $.session.start(SESSION)
    const wide = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane(120) })
    expect((await wide.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 40, rows: 10 })
    expect(await wide.find({ text: /56\.2k \/ 1M tokens \(6%\)/ })).toBeDefined()
    expect(await wide.find({ text: 'Auto-compact at 967k (94% left)' })).toBeDefined()
    await wide.unmount()
    const narrow = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane(40) })
    expect((await narrow.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 10, rows: 40 })
    await narrow.unmount()
    const svg = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...pane(40) })
    expect((await svg.find({ type: 'Svg' }))?.props.width).toBe(5 * 15 - 3)
  })

  test('asks the engine for the width the pane draws in once it has been drawn', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600) }, log)
    await $.session.start(SESSION)
    expect(log.usage[0]).toEqual({ breakdown: 'summary' })
    await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...pane(60) })
    await $.session.measure(MEASURE())
    expect(log.usage[log.usage.length - 1]).toEqual({ breakdown: 'summary', columns: 60 })
  })

  test('empty state: no numbers, an empty grid', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600, { apiUsage: null }) }, log)
    await $.session.start(SESSION)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...pane() })
      expect(await ui.find({ text: 'No context reported yet' })).toBeDefined()
      expect(await ui.find({ text: /tokens \(/ })).toBeUndefined()
      expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeDefined()
    }
  })

  test('clicking a category highlights its squares, again clears it', async ($, on) => {
    const log = fresh()
    engine(on, { usage: makeUsage({ window: 200_000, parts: PARTS_37, buffer: 33_000 }) }, log)
    await $.session.start(SESSION)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...pane() })
      const gridType = surface === 'terminal' ? 'Raster' : 'Svg'
      const plain = JSON.stringify((await ui.find({ type: gridType }))?.props)
      await ui.press({ key: 'cat:Messages' })
      expect(await ui.find({ text: /Highlighted: Messages, 53k tokens \(27%\)/ })).toBeDefined()
      const lit = JSON.stringify((await ui.find({ type: gridType }))?.props)
      expect(lit).not.toBe(plain)
      await ui.press({ key: 'cat:Messages' })
      expect(JSON.stringify((await ui.find({ type: gridType }))?.props)).toBe(plain)
      await ui.press({ key: 'cat:MCP tools (deferred)' })
      expect(await ui.find({ text: /not drawn in the grid/ })).toBeDefined()
      await ui.press({ key: 'cat:MCP tools (deferred)' })
      await ui.unmount()
    }
  })

  for (const surface of SURFACES) test(`lists are collapsed, sorted biggest first, and a memory file shows its path (${surface})`, async ($, on) => {
    const log = fresh()
    engine(on, { usage: makeUsage({ window: 200_000, parts: PARTS_37, buffer: 33_000 }) }, log)
    await $.session.start(SESSION)
    {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...pane() })
      expect(await ui.find({ key: 'mem:0' }), 'find 1').toBeUndefined()
      await ui.press({ key: 'sec:memory' })
      const files = (await ui.findAll({ type: 'Button' })).filter((b: any) => b.key.startsWith('mem:'))
      expect(files.map((b: any) => b.key)).toEqual(['mem:0', 'mem:1'])
      expect(files[0]!.text).toContain('CLAUDE.md  2.4k  User')
      await ui.press({ key: 'mem:1' })
      expect((await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('|'), 'texts').toMatch(/Path: C:.proj.CLAUDE.md/)
      await ui.press({ key: 'sec:mcp' })
      expect(await ui.find({ text: /web · 1 tools · 4k · 1 on demand/ }), 'find 3').toBeDefined()
      expect(await ui.find({ text: /git · 2 tools · 800/ }), 'find 4').toBeDefined()
      await ui.press({ key: 'sec:skills' })
      await ui.press({ key: 'skill:0' })
      expect(await ui.find({ text: /plugin: plugin\. The context report gives no file path/ }), 'find 5').toBeDefined()
      await ui.press({ key: 'sec:commands' })
      expect(await ui.find({ text: /38 of 40 commands listed/ }), 'find 6').toBeDefined()
      await ui.press({ key: 'sec:agents' })
      expect(await ui.find({ text: /big {2}400/ }), 'find 7').toBeDefined()
      await ui.unmount()
    }
  })

  test('red state suggests /compact and changes nothing itself', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(150_000) }, log)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...pane() })
    expect(await ui.find({ text: 'Context is nearly full. You can run /compact to free space.' })).toBeDefined()
    expect(log.compacts).toBe(0)
  })

  test('auto-compact off in the footer', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600, { autoCompact: false, buffer: 0 }) }, log)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane() })
    expect(await ui.find({ text: 'Auto-compact off' })).toBeDefined()
  })

  test('Count exactly asks for one full breakdown, then the next measure goes back to summary', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600) }, log)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...pane() })
    expect(await ui.find({ text: /Count exactly sends one token-count request/ })).toBeDefined()
    const before = log.usage.length
    await ui.press({ key: 'exact' })
    expect(log.usage.length).toBe(before + 1)
    expect(log.usage[before]).toMatchObject({ breakdown: 'full' })
    expect(await ui.find({ text: /Exact count, made with the token-count API/ })).toBeDefined()
    await $.session.measure(MEASURE())
    expect(log.usage[before + 1]).toMatchObject({ breakdown: 'summary' })
    expect(await ui.find({ text: /Estimated for free/ })).toBeDefined()
  })

  test('another plugin pane is left alone', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600) }, log)
    on('ui.render', { component: 'Pane' }, () => ({ type: 'Text', props: {}, children: ['someone else'] }))
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane(), requestId: 'other' })
    expect(await ui.find({ text: 'someone else' })).toBeDefined()
  })
})

describe('/clear', () => {
  test('forgets the numbers and lets the toast fire again', ON, async ($, on) => {
    const log = fresh()
    const current = { usage: usageAt(150_000) }
    engine(on, current, log)
    await $.session.start(SESSION)
    expect(log.toasts).toHaveLength(1)
    await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as any)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ text: /^ctx/ })).toBeUndefined()
    await $.session.measure(MEASURE())
    expect(log.toasts).toHaveLength(2)
  })
})

describe('band on and off', () => {
  test('hidden by default, and nothing opens a pane by itself', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(150_000) }, log)
    await $.session.start(SESSION)
    await $.session.measure(MEASURE())
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
      expect(await ui.find({ text: /^ctx/ })).toBeUndefined()
      expect(await ui.find({ text: 'below me' })).toBeDefined()
      await ui.unmount()
    }
    expect(log.opened).toEqual([])
  })

  test('the toast still shows with the band off', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(150_000) }, log)
    await $.session.start(SESSION)
    expect(log.toasts).toHaveLength(1)
  })

  for (const surface of SURFACES) {
    test(`the Off button on the band writes the config row (${surface})`, ON, async ($, on) => {
      const log = fresh()
      engine(on, { usage: usageAt(73_600) }, log)
      await $.session.start(SESSION)
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
      expect(await ui.find({ key: 'band-off' })).toBeDefined()
      await ui.press({ key: 'band-off' })
      expect(log.sets).toEqual([{ key: 'context-view.showBand', value: false }])
      expect(await ui.find({ text: /^ctx/ })).toBeUndefined()
    })

    test(`the pane toggle turns the band on and off (${surface})`, async ($, on) => {
      const log = fresh()
      engine(on, { usage: usageAt(73_600) }, log)
      await $.session.start(SESSION)
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...pane() })
      expect((await ui.find({ key: 'band-toggle' }))?.props.label).toBe('Band: off')
      await ui.press({ key: 'band-toggle' })
      expect(log.sets).toEqual([{ key: 'context-view.showBand', value: true }])
      expect((await ui.find({ key: 'band-toggle' }))?.props.label).toBe('Band: on')
      const band = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
      expect(await band.find({ text: /^ctx 37%/ })).toBeDefined()
      await ui.press({ key: 'band-toggle' })
      expect(log.sets[1]).toEqual({ key: 'context-view.showBand', value: false })
      expect((await ui.find({ key: 'band-toggle' }))?.props.label).toBe('Band: off')
    })
  }

  test('the empty pane carries the toggle too', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600, { apiUsage: null }) }, log)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...pane() })
    expect(await ui.find({ key: 'band-toggle' })).toBeDefined()
  })

  test('/ctx band on and off write the row and do not open the pane', async ($, on) => {
    const log = fresh()
    engine(on, { usage: usageAt(73_600) }, log)
    await $.session.start(SESSION)
    const run = (args: string) =>
      $.command.run({ command: 'ctx', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as any)
    expect((await run('band on')).text).toBe('Context meter above the prompt: on.')
    expect((await run('band off')).text).toBe('Context meter above the prompt: off.')
    expect(log.sets.map(s => s.value)).toEqual([true, false])
    expect((await run('band')).text).toContain('off')
    expect(log.opened).toEqual([])
  })

  test('if the config row cannot be set, the choice is kept in the store', async ($, on) => {
    const log = fresh()
    const kept: any[] = []
    on('store.get', () => ({ value: undefined }))
    on('store.set', (_$: any, e: any) => {
      kept.push([e.key, e.value])
      return { value: undefined }
    })
    on('store.delete', () => ({ value: undefined }))
    engine(on, { usage: usageAt(73_600), denySet: true }, log)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...pane() })
    await ui.press({ key: 'band-toggle' })
    expect(kept).toEqual([['bandPick', { value: true, from: false }]])
    expect((await ui.find({ key: 'band-toggle' }))?.props.label).toBe('Band: on')
  })
})

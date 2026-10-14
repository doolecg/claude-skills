import { describe, expect, mock, test } from 'claude-code/testing'

import { CATALOG, fmtElapsed, installedFrom, jobOf, modesOf, move, parseArg, pickTab, progressOf, tabsFor } from '../hooks/logic'
import { DENSE_FULL, sbMeter } from '../hooks/sidebar-kit'

const SESSION = { cwd: 'F:/proj', surface: 'terminal', isInteractive: true } as any
const ALL = CATALOG.map(c => c.id)
const look = { stops: ['#E8A06A', '#D9667F'], track: '#3A3531', tint: '#FFF6EC', tick: 3 }

const pane = (bodyColumns = 56) =>
  ({
    plugin: 'sidebar',
    component: 'Pane' as const,
    requestId: 'sidebar',
    props: { title: 'Sidebar', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  }) as any

const command = (args = '') =>
  ({ command: 'sidebar', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }) as any

// ---------------------------------------------------------------- pure behaviour

describe('logic', () => {
  test('tabs follow the order, hide the hidden and carry badges', () => {
    const tabs = tabsFor(['bottom-bar', 'flightdeck', 'clean-view', 'unknown-mod'], [], [], {})
    expect(tabs.map(t => t.id)).toEqual(['flightdeck', 'clean-view', 'bottom-bar'])
    expect(tabsFor(ALL, ['clean-view', 'flightdeck'], [], {}).map(t => t.id).slice(0, 3)).toEqual(['clean-view', 'flightdeck', 'self-improve'])
    expect(tabsFor(ALL, [], ['flightdeck', 'bottom-bar'], {}).map(t => t.id)).not.toContain('flightdeck')
    const badged = tabsFor(['flightdeck', 'clean-view'], [], [], { flightdeck: 3.9, 'clean-view': -2 })
    expect(badged.map(t => t.badge)).toEqual([3, 0])
    expect(badged[0]).toMatchObject({ id: 'flightdeck', name: 'Flightdeck' })
  })

  test('move shifts one place and stops at the ends', () => {
    expect(move(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(move(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(move(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(move(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
    expect(move(['a', 'b'], 'z', 1)).toEqual(['a', 'b'])
  })

  test('pickTab keeps a showing tab and otherwise falls back to the first', () => {
    const tabs = tabsFor(['flightdeck', 'clean-view'], [], [], {})
    expect(pickTab('clean-view', tabs)).toBe('clean-view')
    expect(pickTab('self-improve', tabs)).toBe('flightdeck')
    expect(pickTab('', tabs)).toBe('flightdeck')
    expect(pickTab('sidebar', tabs)).toBe('sidebar')
    expect(pickTab('settings:flightdeck', tabs)).toBe('settings:flightdeck')
    expect(pickTab('', [])).toBe('sidebar')
  })

  test('arguments parse to the right action', () => {
    expect(parseArg('')).toEqual({ kind: 'flip' })
    expect(parseArg('nonsense')).toEqual({ kind: 'flip' })
    expect(parseArg('open')).toEqual({ kind: 'open' })
    expect(parseArg('ON')).toEqual({ kind: 'open' })
    expect(parseArg('close')).toEqual({ kind: 'close' })
    expect(parseArg('off')).toEqual({ kind: 'close' })
    expect(parseArg('tab clean-view')).toEqual({ kind: 'tab', id: 'clean-view' })
    expect(parseArg('tab')).toEqual({ kind: 'flip' })
    expect(parseArg('settings flightdeck')).toEqual({ kind: 'settings', id: 'flightdeck' })
    expect(parseArg('closed flightdeck')).toEqual({ kind: 'closed', id: 'flightdeck' })
    expect(parseArg('flightdeck')).toEqual({ kind: 'tab', id: 'flightdeck' })
    expect(parseArg('  Flightdeck ')).toEqual({ kind: 'tab', id: 'flightdeck' })
  })

  test('the installed list keeps enabled plugins by name', () => {
    const list = [{ id: 'flightdeck@doole-skills', enabled: true }, { id: 'clean-view@doole-skills', enabled: false }, { id: 'bottom-bar' }, { enabled: true }]
    expect(installedFrom(list)).toEqual(['flightdeck', 'bottom-bar'])
    expect(installedFrom(null)).toEqual([])
    expect(installedFrom({})).toEqual([])
  })

  test('published modes are kept only when well formed', () => {
    expect(modesOf({ flightdeck: { label: 'Flightdeck', isOn: true }, bad: { label: 1, isOn: true }, worse: { label: 'x' }, nul: null })).toEqual({
      flightdeck: { label: 'Flightdeck', isOn: true },
    })
    expect(modesOf(null)).toEqual({})
    expect(modesOf('x')).toEqual({})
  })

  test('Clean View’s checklist is cut down to a job, or null with none', () => {
    expect(jobOf(null)).toBeNull()
    expect(jobOf({ phase: 'idle' })).toBeNull()
    expect(jobOf({})).toBeNull()
    const job = jobOf({ title: 'Fix', phase: 'working', startedAt: 5, tasks: [{ id: 'a', name: 'Read', status: 'done', percent: 100, hasReported: true }, { name: 'Edit' }] })!
    expect(job.title).toBe('Fix')
    expect(job.finishedAt).toBe(0)
    expect(job.tasks[0]).toEqual({ id: 'a', name: 'Read', status: 'done', percent: 100, hasReported: true })
    expect(job.tasks[1]).toEqual({ id: '1', name: 'Edit', status: 'waiting', percent: 0, hasReported: false })
  })

  test('progress counts finished steps and the active one’s share', () => {
    const t = (status: string, percent = 0) => ({ id: status + percent, name: 'x', status, percent, hasReported: true })
    const base = { title: '', startedAt: 0, finishedAt: 0 }
    expect(progressOf({ ...base, phase: 'working', tasks: [t('done', 100), t('active', 50), t('waiting'), t('waiting')] })).toEqual({ step: 2, total: 4, percent: 38 })
    expect(progressOf({ ...base, phase: 'working', tasks: [t('done', 100), t('waiting')] })).toEqual({ step: 2, total: 2, percent: 50 })
    expect(progressOf({ ...base, phase: 'done', tasks: [t('done', 100), t('done', 100)] })).toEqual({ step: 2, total: 2, percent: 100 })
    expect(progressOf({ ...base, phase: 'working', tasks: [] })).toEqual({ step: 0, total: 0, percent: 0 })
    expect(progressOf({ ...base, phase: 'done', tasks: [] }).percent).toBe(100)
  })

  test('elapsed time reads plainly', () => {
    expect(fmtElapsed(-5)).toBe('0s')
    expect(fmtElapsed(42_000)).toBe('42s')
    expect(fmtElapsed(75_000)).toBe('1m 15s')
    expect(fmtElapsed(3_725_000)).toBe('1h 02m')
  })
})

describe('kit meter', () => {
  test('a full meter is solid, an empty one sparse', () => {
    const full = sbMeter(12, 1, look)
    expect(full).toHaveLength(12)
    expect(full.every(p => p.ch === DENSE_FULL)).toBe(true)
    const empty = sbMeter(12, 0, look)
    expect(empty).toHaveLength(12)
    expect(empty.every(p => p.ch !== DENSE_FULL)).toBe(true)
    const lit = (ch: string) => [...(ch.charCodeAt(0) - 0x2800).toString(2)].filter(b => b === '1').length
    expect(empty.reduce((n, p) => n + lit(p.ch), 0)).toBeLessThan(12 * 8 * 0.3)
  })

  test('the head is solid and the tail sparser than near the head', () => {
    const lit = (ch: string) => [...(ch.charCodeAt(0) - 0x2800).toString(2)].filter(b => b === '1').length
    const width = 40
    let tail = 0
    let near = 0
    for (let tick = 0; tick < 40; tick += 2) {
      const m = sbMeter(width, 0.5, { ...look, tick })
      expect(m[19]!.ch).toBe(DENSE_FULL)
      tail += lit(m[0]!.ch) + lit(m[1]!.ch) + lit(m[2]!.ch)
      near += lit(m[16]!.ch) + lit(m[17]!.ch) + lit(m[18]!.ch)
    }
    expect(tail).toBeLessThan(near)
  })
})

// ---------------------------------------------------------------- wiring

type World = { opened: any[]; closed: string[]; panes: string[]; ran: string[]; registered: string[]; clock: any; refuse: Set<string> }

function world(on: any): World {
  const w: World = { opened: [], closed: [], panes: [], ran: [], registered: [], clock: null, refuse: new Set() }
  w.clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('command.register', (_$: any, e: any) => {
    w.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('settings.read', () => ({ value: { theme: 'dark' } }))
  on('command.list', () => ({
    value: [
      { name: 'flightdeck', description: '' },
      { name: 'simple', description: '' },
    ],
  }))
  on('config.list', () => ({
    value: [
      { key: 'prompt-enhancer.mode', label: 'Mode', description: 'How', kind: 'boolean', value: true, options: [], isLocked: false, provider: { plugin: 'prompt-enhancer' } },
    ],
  }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify([{ id: 'bottom-bar@doole-skills', enabled: true }]), stderr: '' } }))
  on('command.run', { command: 'flightdeck' }, (_$: any, e: any) => {
    w.ran.push(`${e.command} ${e.args}`.trim())
    if (w.refuse.has(e.command)) throw new Error('gone')
    return { text: 'ok' }
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
  on('ui.panes', () => ({ value: w.panes.map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  return w
}

/** The installed list loads in the background after session start; this lets it finish. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0))
}

async function texts($: any) {
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  const all = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join('\n')
  return { ui, all }
}

describe('wiring', () => {
  test('session start registers /sidebar', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(w.registered).toContain('sidebar')
  })

  test('a tab the sidebar draws opens its pane at 56 columns under the strip', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab clean-view'))
    expect(w.opened.at(-1)).toMatchObject({ id: 'sidebar', title: 'Sidebar', columns: 56 })
    const { ui, all } = await texts($)
    expect(all).toContain("DOOLE'S SIDEBAR")
    expect(all).toContain('CLEAN VIEW')
    expect(all).toContain('No job running')
    await ui.unmount()
  })

  test('the ⋯ page lists the tabs and the ones not installed', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab sidebar'))
    const { ui, all } = await texts($)
    expect(all).toContain('TABS')
    expect(all).toContain('Flightdeck')
    expect(all).toContain('Clean View')
    expect(all).toContain('Not installed'.toUpperCase())
    await ui.unmount()
  })

  test('a mod’s settings page has a Back button', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('settings flightdeck'))
    const { ui, all } = await texts($)
    expect(all).toContain('FLIGHTDECK')
    expect(all).toContain('Back')
    expect(all).toContain('OPTIONS')
    await ui.unmount()
  })

  test('/sidebar close closes the pane and /sidebar flips it', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab clean-view'))
    const closed = await $.command.run(command('close'))
    expect(closed.text).toBe('Sidebar closed.')
    expect(w.closed).toEqual(['sidebar'])
    const opened = await $.command.run(command('open'))
    expect(opened.text).toBe('Sidebar opened.')
    expect(w.panes).toContain('sidebar')
    const flipped = await $.command.run(command(''))
    expect(flipped.text).toBe('Sidebar closed.')
    expect(w.panes).not.toContain('sidebar')
  })

  test('a pane mod’s tab runs its open command and takes the sidebar’s pane away', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab sidebar'))
    expect(w.panes).toContain('sidebar')
    await $.command.run(command('tab flightdeck'))
    await w.clock.advance(10)
    await settle()
    expect(w.ran).toContain('flightdeck open')
    expect(w.closed).toContain('sidebar')
    expect(w.panes).not.toContain('sidebar')
  })

  test('leaving a pane mod’s tab runs its close command', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab flightdeck'))
    await w.clock.advance(10)
    await $.command.run(command('tab clean-view'))
    await w.clock.advance(10)
    await settle()
    expect(w.ran).toEqual(['flightdeck open', 'flightdeck close'])
    expect(w.panes).toContain('sidebar')
  })

  test('a pane mod that refuses to open falls back to its settings page', async ($, on) => {
    const w = world(on)
    w.refuse.add('flightdeck')
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab flightdeck'))
    await w.clock.advance(10)
    await settle()
    expect(w.panes).toContain('sidebar')
    const { ui, all } = await texts($)
    expect(all).toContain('Back')
    await ui.unmount()
  })

  test('the pane mod closing itself switches the sidebar off', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab flightdeck'))
    await w.clock.advance(10)
    const told = await $.command.run(command('closed flightdeck'))
    await w.clock.advance(10)
    await settle()
    expect(told.text).toBeUndefined()
    expect(w.ran).toEqual(['flightdeck open'])
    // The sidebar is off now, so a bare /sidebar opens it rather than closing it.
    expect((await $.command.run(command(''))).text).toBe('Sidebar opened.')
  })
})

import { describe, expect, mock, test } from 'claude-code/testing'

import { CATALOG, blocksOf, fmtAgo, fmtElapsed, footerOf, installedFrom, jobOf, modesOf, move, parseArg, pickTab, progressOf, tabsFor } from '../hooks/logic'
import { DENSE_FULL, sbAsker, sbBadge, sbMeter, sbPaneMove, sbTabRows } from '../hooks/sidebar-kit'

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

  test('every tab icon is one cell, its label one word, and the strip badges are one superscript cell', () => {
    for (const c of CATALOG) expect([...c.icon]).toHaveLength(1)
    for (const c of CATALOG) expect(c.label).toMatch(/^\S+$/)
    expect(CATALOG.find(c => c.id === 'bottom-bar')?.icon).toBe('▭')
    expect([0, 1, 5, 9, 12].map(sbBadge)).toEqual([' ', '¹', '⁵', '⁹', '⁺'])
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

describe('kit strip rows', () => {
  test('the tabs fill the width in as few rows as fit, full rows reaching both edges', () => {
    const tabs = tabsFor(CATALOG.map(c => c.id), [], [], {})
    const rows = sbTabRows(tabs, 52)
    expect(rows).toHaveLength(3)
    expect(rows.flatMap(r => r.tabs).map(t => t.id)).toEqual(tabs.map(t => t.id))
    const cells = (r: (typeof rows)[number]) => r.tabs.reduce((n, t, i) => n + r.gaps[i]! + [...`${t.icon} ${t.label}`].length + 2, 0)
    expect(cells(rows[0]!)).toBe(52)
    for (const r of rows) expect(cells(r)).toBeLessThanOrEqual(52)
  })
})

describe('kit strip asks', () => {
  const strip = (isOn: boolean, active: string, isSettings = false) => ({ isOn, active, tabs: [], theme: 'dark', colour: 'Coral', isSettings })

  test('a pane mod opens when its tab turns up and closes when it goes', () => {
    expect(sbPaneMove('flightdeck', strip(true, 'flightdeck'), strip(true, 'clean-view'))).toBe('open')
    expect(sbPaneMove('flightdeck', strip(true, 'flightdeck'), undefined)).toBe('open')
    expect(sbPaneMove('flightdeck', strip(true, 'flightdeck'), strip(true, 'flightdeck', true))).toBe('open')
    expect(sbPaneMove('flightdeck', strip(true, 'clean-view'), strip(true, 'flightdeck'))).toBe('close')
    expect(sbPaneMove('flightdeck', strip(false, 'flightdeck'), strip(true, 'flightdeck'))).toBe('close')
    expect(sbPaneMove('flightdeck', strip(true, 'flightdeck', true), strip(true, 'flightdeck'))).toBe('close')
  })

  test('a mod opened by its own command with the sidebar off is left alone', () => {
    expect(sbPaneMove('flightdeck', strip(false, 'flightdeck'), strip(false, 'flightdeck'))).toBeUndefined()
    expect(sbPaneMove('flightdeck', strip(false, ''), undefined)).toBeUndefined()
    expect(sbPaneMove('flightdeck', strip(true, 'clean-view'), strip(true, 'idea-shelf'))).toBeUndefined()
    expect(sbPaneMove('flightdeck', strip(true, 'flightdeck'), strip(true, 'flightdeck'))).toBeUndefined()
  })

  test('a press that leaves the tab closes the mod’s pane first, then asks; its own tab only asks', async () => {
    const log: string[] = []
    const ask = sbAsker(async args => void log.push(`ask ${args}`), 'flightdeck', async () => void log.push('close'))
    for (const args of ['tab clean-view', 'tab flightdeck', 'settings flightdeck']) {
      ask(args)
      for (let i = 0; i < 5; i++) await new Promise(r => (globalThis as any).setTimeout(r, 0))
    }
    expect(log).toEqual(['close', 'ask tab clean-view', 'ask tab flightdeck', 'close', 'ask settings flightdeck'])
  })
})

// ---------------------------------------------------------------- wiring

type World = { opened: any[]; closed: string[]; panes: string[]; ran: string[]; registered: string[]; clock: any }

function world(on: any): World {
  const w: World = { opened: [], closed: [], panes: [], ran: [], registered: [], clock: null }
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
  // Every command that reaches the bottom: the sidebar answers `/sidebar` itself, so a tab switch must leave this empty.
  on('command.run', (_$: any, e: any) => {
    w.ran.push(`${e.command} ${e.args}`.trim())
    return { text: 'ok' }
  })
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
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
  for (let i = 0; i < 20; i++) await new Promise(r => (globalThis as any).setTimeout(r, 0))
}

async function texts($: any) {
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  const all = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join('\n')
  return { ui, all }
}

// A stand-in for a pane mod (Flightdeck). Hooks run in a world of their own, so it spells out what the kit's `sbAsker` and
// `sbPaneMove` do (those are tested above): `/fd-press <args>` is its strip press, written as its `sidebarAsk` state after it
// closes its own pane; it opens and closes that pane as the sidebar's strip moves; `/fd-strip` tells the test the last strip it saw.
const FLIGHTDECK = {
  name: 'flightdeck',
  register: ((on: any) => {
    let n = 0
    let strip: any
    const shows = (v: any) => !!v && v.isOn === true && v.active === 'flightdeck' && v.isSettings !== true
    on('command.run', { command: 'fd-press' }, async ($: any, e: any) => {
      if (e.args !== 'tab flightdeck') await $.ui.close({ id: 'flightdeck' })
      await $.state.set({ plugin: 'flightdeck', key: 'sidebarAsk' }, { args: e.args, n: (n += 1) })
      return {}
    })
    on('command.run', { command: 'fd-strip' }, async () => ({ text: JSON.stringify(strip ?? null) }))
    on('state.set', { key: 'strip' }, async ($: any, e: any, next: any) => {
      const ran = await next(e)
      if (e.plugin !== 'sidebar') return ran
      strip = e.value
      if (shows(e.value) && !shows(e.previous)) await $.ui.open({ id: 'flightdeck', title: 'Flightdeck' })
      else if (shows(e.previous) && !shows(e.value)) await $.ui.close({ id: 'flightdeck' })
      return ran
    })
  }) as any,
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

  const stripOf = async ($: any) => JSON.parse((await $.command.run({ command: 'fd-strip', args: '', origin: { kind: 'composer' as const } })).text)
  const press = async ($: any, args: string) => {
    await $.command.run({ command: 'fd-press', args, origin: { kind: 'composer' as const } })
    await settle()
  }

  test('a pane mod’s tab goes to the strip, which the mod follows, and takes the sidebar’s pane away', { plugins: [FLIGHTDECK] }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab sidebar'))
    expect(w.panes).toContain('sidebar')
    await $.command.run(command('tab flightdeck'))
    expect(await stripOf($)).toMatchObject({ isOn: true, active: 'flightdeck', isSettings: false })
    expect(w.closed).toContain('sidebar')
    expect(w.panes).not.toContain('sidebar')
    expect(w.ran).toEqual([])
  })

  test('leaving a pane mod’s tab moves the strip on and brings the sidebar’s pane back', { plugins: [FLIGHTDECK] }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab flightdeck'))
    await $.command.run(command('tab clean-view'))
    expect(await stripOf($)).toMatchObject({ isOn: true, active: 'clean-view', isSettings: false })
    expect(w.panes).toContain('sidebar')
    expect(w.ran).toEqual([])
  })

  test('a pane mod that is not loaded here shows its settings page instead', { plugins: [FLIGHTDECK] }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab self-improve'))
    expect(await stripOf($)).toMatchObject({ isOn: true, active: 'self-improve', isSettings: true })
    expect(w.panes).toContain('sidebar')
    const { ui, all } = await texts($)
    expect(all).toContain('Back')
    await ui.unmount()
    expect(w.ran).toEqual([])
  })

  test('pressing a tab in the sidebar’s own pane switches to it', { plugins: [FLIGHTDECK] }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab sidebar'))
    const { ui } = await texts($)
    await ui.press({ key: 'sb-tab:flightdeck' })
    await settle()
    expect(await stripOf($)).toMatchObject({ active: 'flightdeck', isSettings: false })
    expect(w.panes).not.toContain('sidebar')
    expect(w.ran).toEqual([])
    await ui.unmount()
  })

  test('a strip press in another mod’s pane switches tabs through its state, with no command run', { plugins: [FLIGHTDECK] }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab flightdeck'))
    expect(w.panes).toContain('flightdeck')
    await press($, 'tab clean-view')
    expect(await stripOf($)).toMatchObject({ isOn: true, active: 'clean-view' })
    expect(w.panes).toContain('sidebar')
    expect(w.panes).not.toContain('flightdeck')
    const { ui, all } = await texts($)
    expect(all).toContain('CLEAN VIEW')
    await ui.unmount()

    await press($, 'tab flightdeck')
    expect(await stripOf($)).toMatchObject({ active: 'flightdeck', isSettings: false })
    expect(w.panes).toContain('flightdeck')
    expect(w.panes).not.toContain('sidebar')
    await press($, 'settings flightdeck')
    expect(await stripOf($)).toMatchObject({ active: 'flightdeck', isSettings: true })
    expect(w.panes).toContain('sidebar')
    expect(w.panes).not.toContain('flightdeck')
    await press($, 'tab flightdeck')
    expect(w.panes).toContain('flightdeck')
    await press($, 'close')
    expect(await stripOf($)).toMatchObject({ isOn: false })
    expect(w.panes).toEqual([])
    expect(w.ran).toEqual([])
  })

  test('tabs switch while a turn is running, with no command run and nothing queued', { plugins: [FLIGHTDECK] }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.turn.start({ text: 'Do a long job', turnId: 't1' })
    await $.command.run(command('tab flightdeck'))
    await press($, 'tab clean-view')
    expect(await stripOf($)).toMatchObject({ isOn: true, active: 'clean-view' })
    expect(w.panes).toContain('sidebar')
    await press($, 'tab flightdeck')
    expect(w.panes).toContain('flightdeck')
    expect(w.ran).toEqual([])
  })

  test('every tab shows its icon and one word, the open one filled in the accent colour alone', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab clean-view'))
    const { ui, all } = await texts($)
    expect(all).toContain(' ✶ Steps')
    expect(all).toContain(' ✎ Enhance')
    expect(all).not.toContain('◖')
    const open = (await ui.findAll({ type: 'Text' })).find((t: any) => String(t.text) === ' ✶ Steps')
    expect(open?.props?.backgroundColor).toBe('#D97757')
    await ui.unmount()
  })

  test('the pane mod closing itself switches the sidebar off', { plugins: [FLIGHTDECK] }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab flightdeck'))
    const told = await $.command.run(command('closed flightdeck'))
    expect(told.text).toBeUndefined()
    expect(await stripOf($)).toMatchObject({ isOn: false })
    expect(w.ran).toEqual([])
    // The sidebar is off now, so a bare /sidebar opens it rather than closing it.
    expect((await $.command.run(command(''))).text).toBe('Sidebar opened.')
  })
})

// ---------------------------------------------------------------- Context footer and Rule Guard

const FOOTER = {
  context: { percent: 42, tokens: 84000, window: 200000 },
  hindsight: 'up',
  codegraph: 'indexed',
  git: { branch: 'main', changed: 3, ahead: 1, behind: 0 },
  passes: { count: 2, limit: 3, editedSince: true, extra: [] },
}

// Stand-ins for the Context and Rule Guard mods: each publishes its state when told to.
const CONTEXT = {
  name: 'context',
  register: ((on: any) => {
    on('command.run', { command: 'ctx-publish' }, async ($: any, e: any) => {
      // Hooks run in a world of their own, so the footer is spelled out here (it is FOOTER above).
      const footer = {
        context: { percent: 42, tokens: 84000, window: 200000 },
        hindsight: 'up',
        codegraph: 'indexed',
        git: { branch: 'main', changed: 3, ahead: 1, behind: 0 },
        passes: { count: 2, limit: 3, editedSince: true, extra: [] },
      }
      await $.state.set({ plugin: 'context', key: 'footer' }, e.args === 'none' ? null : footer)
      return {}
    })
  }) as any,
}
const RULE_GUARD = {
  name: 'rule-guard',
  register: ((on: any) => {
    on('command.run', { command: 'rg-publish' }, async ($: any) => {
      await $.state.set({ plugin: 'rule-guard', key: 'blocks' }, [{ at: 1_800_000_000_000 - 120_000, rule: 'plainTags', label: 'Plain version tags', what: 'git tag v1.2.0' }])
      return {}
    })
  }) as any,
}

describe('context footer', () => {
  test('a well formed footer is kept, anything else drops it', () => {
    expect(footerOf(FOOTER)).toMatchObject({ hindsight: 'up', git: { branch: 'main', changed: 3 }, passes: { count: 2, limit: 3 } })
    expect(footerOf(null)).toBeNull()
    expect(footerOf({ context: {} })).toBeNull()
    expect(footerOf({ ...FOOTER, hindsight: 'odd', git: { changed: 2 } })).toMatchObject({ hindsight: 'off', git: null })
  })

  test('the footer is not a tab of its own', () => {
    expect(tabsFor(ALL, [], [], {}).map(t => t.id)).not.toContain('context')
    expect(tabsFor(ALL, [], [], {}).map(t => t.id)).toContain('rule-guard')
  })

  test('Rule Guard stops read newest first, with their age', () => {
    expect(blocksOf([{ at: 5, label: 'X', what: 'git push' }, { nope: 1 }])).toEqual([{ at: 5, rule: '', label: 'X', what: 'git push' }])
    expect(blocksOf('x')).toEqual([])
    expect(fmtAgo(0, 30_000)).toBe('just now')
    expect(fmtAgo(0, 4 * 60_000)).toBe('4m ago')
    expect(fmtAgo(0, 2 * 3_600_000)).toBe('2h ago')
  })

  test('Context publishing its footer draws it at the bottom of the tab, and it goes when Context stops', { plugins: [CONTEXT] }, async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run(command('tab clean-view'))
    await $.command.run({ ...command(''), command: 'ctx-publish' })
    let { ui, all } = await texts($)
    expect(all).toContain('CONTEXT')
    expect(all).toContain('main')
    expect(all).toContain(' · 3 changed')
    expect(all).toContain('Hindsight')
    expect(all).toContain(' 2 of 3')
    expect(all.indexOf('CONTEXT ')).toBeGreaterThan(all.indexOf('CLEAN VIEW'))
    await ui.unmount()
    await $.command.run({ ...command('none'), command: 'ctx-publish' })
    ;({ ui, all } = await texts($))
    expect(all).not.toContain('PASSES')
    await ui.unmount()
  })

  test('Rule Guard has a tab with what it stopped and its rules', { plugins: [RULE_GUARD] }, async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await settle()
    await $.command.run({ ...command(''), command: 'rg-publish' })
    await $.command.run(command('tab rule-guard'))
    const { ui, all } = await texts($)
    expect(all).toContain('RULE GUARD')
    expect(all).toContain('Plain version tags')
    expect(all).toContain('git tag v1.2.0')
    expect(all).toContain('2m ago')
    expect(all).toContain('RULES')
    await ui.unmount()
  })
})

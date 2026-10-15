import { expect, test } from 'claude-code/testing'

import { groupRows, parseValue, pluginRows, shown, titleOf } from '../hooks/logic'

const row = (key: string, kind: string, value: unknown, extra: Record<string, unknown> = {}) => ({
  key,
  label: key.split('.').pop(),
  kind,
  value,
  provider: { plugin: key.includes('.') ? key.slice(0, key.indexOf('.')) : 'engine', tier: key.includes('.') ? 'user' : 'core' },
  isLocked: false,
  ...extra,
})

const ROWS = [
  row('theme', 'choice', 'dark', { options: ['dark', 'light'] }),
  row('bottom-bar.colour', 'choice', 'Coral', { options: ['Coral', 'Sky'], description: 'The accent colour' }),
  row('bottom-bar.name', 'text', "Doole's Tools"),
  row('self-improve.maxCalls', 'number', 4),
  row('clean-view.enabled', 'boolean', true),
]

// A world whose /config holds ROWS and records each change.
function world(on: any, hasOpen = true) {
  const rows = ROWS.map(r => ({ ...r }))
  const sets: { key: string; value: unknown }[] = []
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  if (hasOpen) on('ui.open', () => ({ value: { isPlaced: true } }))
  on('config.list', () => ({ value: rows }))
  on('config.set', (_$: any, e: any) => {
    sets.push({ key: e.key, value: e.value })
    const r = rows.find(x => x.key === e.key)
    if (r) r.value = e.value
    return { value: e.value }
  })
  return sets
}

const PANE = (surface: string) =>
  ({
    plugin: 'mod-settings',
    surface,
    component: 'Pane' as const,
    requestId: 'mod-settings',
    props: { title: 'Mod Settings', isFocused: false, bodyColumns: 44, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  }) as any

const texts = async (ui: any) => ((await ui.findAll({ type: 'Text' })) as any[]).map(t => String(t.text)).join(' | ')

test('only plugin rows are kept, grouped by mod in name order, with friendly names', () => {
  const groups = groupRows(pluginRows(ROWS as any))
  expect(groups.map(g => g.title)).toEqual(['Bottom Bar', 'Self Improve', 'Task View'])
  expect(groups[0]!.rows.map(r => r.key)).toEqual(['bottom-bar.colour', 'bottom-bar.name'])
  expect(titleOf('prompt-enhancer')).toBe('Prompt Enhancer')
})

test('number fields are checked; values read plainly', () => {
  expect(parseValue('number', '12')).toEqual({ value: 12 })
  expect(parseValue('number', 'ten')).toEqual({ error: 'Enter a number' })
  expect(parseValue('text', 'hi')).toEqual({ value: 'hi' })
  expect(shown(true)).toBe('On')
  expect(shown('')).toBe('(empty)')
})

test('in the app /doole_settings opens a side panel listing each mod; opening one shows its settings, and a change goes through /config', async ($, on) => {
  const sets = world(on)
  await $.session.start({ cwd: 'F:/proj', surface: 'desktop', isInteractive: true } as any)
  await $.command.run({ command: 'doole_settings', args: '' } as any)
  const ui = await $.ui.mount(PANE('desktop'))
  const all = await texts(ui)
  expect(all).toContain('Mod Settings')
  expect(all).toContain('3 mods · 4 settings')
  expect(all).toContain('Bottom Bar')
  expect(all).not.toContain('The accent colour')
  await ui.press({ key: 'mod:bottom-bar:toggle' })
  expect(await texts(ui)).toContain('The accent colour')
  expect(await ui.find({ type: 'Select', key: 'bottom-bar.colour:select' })).toBeDefined()
  expect(await ui.find({ type: 'Input', key: 'bottom-bar.name:input' })).toBeDefined()
  await ui.press({ key: 'mod:clean-view:toggle' })
  expect(await texts(ui)).not.toContain('The accent colour')
  await ui.press({ key: 'clean-view.enabled:off' })
  expect(sets).toEqual([{ key: 'clean-view.enabled', value: false }])
  expect(await texts(ui)).toContain('enabled is now Off')
  await ui.unmount()
})

test('in the terminal the pane points to /config instead', async ($, on) => {
  world(on)
  await $.session.start({ cwd: 'F:/proj', surface: 'terminal', isInteractive: true } as any)
  await $.command.run({ command: 'doole_settings', args: '' } as any)
  const ui = await $.ui.mount(PANE('terminal'))
  expect(await texts(ui)).toContain('type /config')
})

test('a long value, label and description with no spaces are cut to the narrow panel', async ($, on) => {
  const long = row('bottom-bar.folder', 'text', 'C:/' + 'x'.repeat(200), { isLocked: true, label: 'F' + 'y'.repeat(100), description: 'D' + 'z'.repeat(100) })
  ROWS.push(long as any)
  try {
    world(on)
    await $.session.start({ cwd: 'F:/proj', surface: 'desktop', isInteractive: true } as any)
    await $.command.run({ command: 'doole_settings', args: '' } as any)
    const ui = await $.ui.mount(PANE('desktop'))
    await ui.press({ key: 'mod:bottom-bar:toggle' })
    const all = ((await ui.findAll({ type: 'Text' })) as any[]).map(t => String(t.text))
    const words = all.flatMap(t => t.split(/\s+/))
    expect(words.some(w => w.includes('xxxx') && w.endsWith('…'))).toBe(true)
    for (const w of words) expect(w.length, w).toBeLessThanOrEqual(44 - 10)
    await ui.unmount()
  } finally {
    ROWS.pop()
  }
})

// A stand-in for the Main Menu (the Sidebar mod): `/sb-strip <json>` writes its `strip` state, every `sidebarAsk` Mod Settings writes is recorded,
// and `/sb-asks` tells the test what was asked (hooks run in a world of their own).
const SIDEBAR = {
  name: 'sidebar',
  register: ((on: any) => {
    const asked: string[] = []
    on('command.run', { command: 'sb-asks' }, async () => ({ text: JSON.stringify(asked) }))
    on('command.run', { command: 'sb-strip' }, async ($: any, e: any) => {
      await $.state.set({ plugin: 'sidebar', key: 'strip' }, JSON.parse(e.args))
      return {}
    })
    on('state.set', { key: 'sidebarAsk' }, async ($: any, e: any, next: any) => {
      const ran = await next(e)
      if (e.plugin === 'mod-settings') asked.push(e.value.args)
      return ran
    })
  }) as any,
}
const asks = async ($: any): Promise<string[]> => JSON.parse((await $.command.run({ command: 'sb-asks', args: '', origin: { kind: 'composer' as const } })).text)
const TABS = [
  { id: 'flightdeck', icon: '✈', name: 'Flightdeck', label: 'Flightdeck', badge: 0 },
  { id: 'mod-settings', icon: '⚙', name: 'Mod Settings', label: 'Settings', badge: 0 },
]
const setStrip = ($: any, isOn: boolean, active: string) =>
  $.command.run({ command: 'sb-strip', args: JSON.stringify({ isOn, active, tabs: TABS, theme: 'dark', colour: 'Coral' }), origin: { kind: 'composer' as const } })

function tabWorld(on: any) {
  const opened: any[] = []
  const closed: string[] = []
  let panes: string[] = []
  const sets = world(on, false)
  on('ui.open', (_$: any, e: any) => {
    opened.push(e)
    panes.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$: any, e: any) => {
    closed.push(e.id)
    panes = panes.filter(p => p !== e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: panes.map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  return { opened, closed, sets }
}

test('as the Main Menu’s last tab, the pane follows the strip at the menu’s width and draws the strip above its settings', { plugins: [SIDEBAR] }, async ($, on) => {
  const w = tabWorld(on)
  await $.session.start({ cwd: 'F:/proj', surface: 'desktop', isInteractive: true } as any)
  await setStrip($, true, 'mod-settings')
  expect(w.opened.at(-1)).toMatchObject({ id: 'mod-settings', title: 'Mod Settings', columns: 56 })
  const ui = await $.ui.mount({ ...PANE('desktop'), props: { ...PANE('desktop').props, bodyColumns: 56 } })
  const all = await texts(ui)
  expect(all).toContain('MAIN MENU')
  expect(all).toContain('MOD SETTINGS')
  expect(all).toContain('3 mods · 4 settings')
  expect(await ui.find({ type: 'Button', key: 'sb-tab:flightdeck' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'sb-close' })).toBeDefined()
  // A mod’s settings still open and change in place under the strip.
  await ui.press({ key: 'mod:clean-view:toggle' })
  await ui.press({ key: 'clean-view.enabled:off' })
  expect(w.sets).toEqual([{ key: 'clean-view.enabled', value: false }])
  // A strip press asks the Main Menu for that tab, through state and not a command.
  await ui.press({ key: 'sb-tab:flightdeck' })
  await new Promise(r => (globalThis as any).setTimeout(r, 0))
  expect(w.closed).toContain('mod-settings')
  expect(await asks($)).toEqual(['tab flightdeck'])
  await ui.unmount()
  await setStrip($, true, 'flightdeck')
  expect(w.closed).toContain('mod-settings')
})

test('without the Main Menu the pane is the plain 44 column panel with no strip', { plugins: [SIDEBAR] }, async ($, on) => {
  const w = tabWorld(on)
  await $.session.start({ cwd: 'F:/proj', surface: 'desktop', isInteractive: true } as any)
  await $.command.run({ command: 'doole_settings', args: '' } as any)
  expect(w.opened.at(-1)).toMatchObject({ id: 'mod-settings', columns: 44 })
  await setStrip($, true, 'flightdeck')
  const ui = await $.ui.mount(PANE('desktop'))
  const all = await texts(ui)
  expect(all).not.toContain('MAIN MENU')
  expect(all).toContain('Mod Settings')
  await ui.unmount()
})

test('/doole_settings with the Main Menu up asks for the Mod Settings tab instead of opening a pane of its own', { plugins: [SIDEBAR] }, async ($, on) => {
  const w = tabWorld(on)
  await $.session.start({ cwd: 'F:/proj', surface: 'desktop', isInteractive: true } as any)
  await setStrip($, true, 'flightdeck')
  await $.command.run({ command: 'doole_settings', args: '' } as any)
  expect(await asks($)).toEqual(['tab mod-settings'])
  expect(w.opened).toEqual([])
})

test('in the terminal the tab keeps the strip and points to /config', { plugins: [SIDEBAR] }, async ($, on) => {
  tabWorld(on)
  await $.session.start({ cwd: 'F:/proj', surface: 'terminal', isInteractive: true } as any)
  await setStrip($, true, 'mod-settings')
  const ui = await $.ui.mount(PANE('terminal'))
  const all = await texts(ui)
  expect(all).toContain('MAIN MENU')
  expect(all).toContain('type /config')
  await ui.unmount()
})

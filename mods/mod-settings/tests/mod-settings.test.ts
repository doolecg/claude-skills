import { expect, test } from 'claude-code/testing'

import { groupRows, parseValue, pluginRows, shown, titleOf } from '../hooks/logic'
import { optionsOf, pluginEntries, userConfigFields, withOption } from '../hooks/plugin-config'

const field = (type: string, title: string, def: unknown, extra: Record<string, unknown> = {}) => ({ type, title, description: `${title} help`, default: def, ...extra })

// Manifests by plugin name, fields in the order the mod declares them.
const MANIFESTS: Record<string, unknown> = {
  'bottom-bar': {
    name: 'bottom-bar',
    userConfig: {
      enabled: field('boolean', 'Enabled', true),
      name: field('string', 'Pill name', "Doole's Tools"),
      colour: field('string', 'Colour', 'Coral', { options: ['Coral', 'Sky'], description: 'The accent colour' }),
    },
  },
  'self-improve': { name: 'self-improve', userConfig: { maxCalls: field('number', 'Max calls', 4) } },
  'clean-view': { name: 'clean-view', userConfig: { enabled: field('boolean', 'Enabled', true) } },
}

const LIST = [
  { id: 'bottom-bar@dooles-tools', version: '1.10.0', scope: 'project', enabled: true, installPath: 'C:\\p\\cache\\bottom-bar-old', hasUserConfig: true },
  { id: 'bottom-bar@dooles-tools', version: '1.10.0', scope: 'user', enabled: true, installPath: 'C:\\p\\cache\\bottom-bar', hasUserConfig: true },
  { id: 'self-improve@dooles-tools', scope: 'user', enabled: true, installPath: 'C:\\p\\cache\\self-improve', hasUserConfig: true },
  { id: 'clean-view@dooles-tools', scope: 'user', enabled: true, installPath: 'C:\\p\\cache\\clean-view', hasUserConfig: true },
  { id: 'off-plugin@dooles-tools', scope: 'user', enabled: false, installPath: 'C:\\p\\cache\\off-plugin', hasUserConfig: true },
  { id: 'plain@dooles-tools', scope: 'user', enabled: true, installPath: 'C:\\p\\cache\\plain', hasUserConfig: false },
]

const SETTINGS_PATH = 'C:/cfg/settings.json'
const SAVED = {
  theme: 'dark',
  permissions: { allow: ['Bash(ls)'] },
  pluginConfigs: {
    'bottom-bar@dooles-tools': { options: { colour: 'Sky', showUsage: false } },
    'other@elsewhere': { options: { keep: 'me' }, mcpServers: { a: 1 } },
  },
}

const norm = (path: unknown) => String(path).split(String.fromCharCode(92)).join('/')

// A world with `claude plugin list`, the manifests, and a settings.json held in `files`; every write is recorded.
function world(on: any, hasOpen = true, saved: unknown = SAVED) {
  const files: Record<string, string> = { [SETTINGS_PATH]: JSON.stringify(saved, null, 2) }
  for (const entry of LIST) {
    const name = entry.id.split('@')[0]!
    if (MANIFESTS[name]) files[`${entry.installPath.replace(/\\/g, '/')}/.claude-plugin/plugin.json`] = JSON.stringify(MANIFESTS[name])
  }
  const writes: { path: string; text: string }[] = []
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  if (hasOpen) on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify(LIST), stderr: '' } }))
  on('settings.read', () => ({ value: JSON.parse(files[SETTINGS_PATH]!) }))
  on('env.get', (_$: any, e: any) => ({ value: e.name === 'CLAUDE_CONFIG_DIR' ? 'C:/cfg' : undefined }))
  on('fs.exists', (_$: any, e: any) => ({ value: norm(e.path) in files }))
  on('fs.read', (_$: any, e: any) => {
    const key = norm(e.path)
    if (!(key in files)) throw new Error(`no file ${key}`)
    return { value: files[key] }
  })
  on('fs.write', (_$: any, e: any) => {
    writes.push({ path: norm(e.path), text: e.text })
    files[norm(e.path)] = e.text
    return { value: undefined }
  })
  return { writes, files }
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

test('cards are built from the manifests in manifest order, saved values over defaults, one per plugin, enabled ones only', () => {
  const entries = pluginEntries(LIST)
  expect(entries.map(e => e.id)).toEqual(['bottom-bar@dooles-tools', 'self-improve@dooles-tools', 'clean-view@dooles-tools', 'plain@dooles-tools'])
  expect(entries[0]!.installPath).toBe('C:\\p\\cache\\bottom-bar')
  const bar = entries[0]!
  const fields = userConfigFields(JSON.stringify(MANIFESTS['bottom-bar']))
  expect(fields.map(f => f.key)).toEqual(['enabled', 'name', 'colour'])
  expect(fields.map(f => f.kind)).toEqual(['boolean', 'text', 'choice'])
  const rows = pluginRows(bar, fields, optionsOf(SAVED, bar.id))
  expect(rows.map(r => [r.key, r.value])).toEqual([
    ['bottom-bar.enabled', true],
    ['bottom-bar.name', "Doole's Tools"],
    ['bottom-bar.colour', 'Sky'],
  ])
  expect(rows[2]!.options).toEqual(['Coral', 'Sky'])
  const groups = groupRows([...pluginRows(entries[1]!, userConfigFields(JSON.stringify(MANIFESTS['self-improve'])), {}), ...rows])
  expect(groups.map(g => g.title)).toEqual(['Bottom Bar', 'Self Improve'])
  expect(titleOf('prompt-enhancer')).toBe('Prompt Enhancer')
})

test('a change sets only that option and keeps every other key', () => {
  const next = JSON.parse(withOption(JSON.stringify(SAVED), 'bottom-bar@dooles-tools', 'enabled', false))
  expect(next).toEqual({ ...SAVED, pluginConfigs: { ...SAVED.pluginConfigs, 'bottom-bar@dooles-tools': { options: { colour: 'Sky', showUsage: false, enabled: false } } } })
  const fresh = withOption('', 'a@b', 'x', 1)
  expect(JSON.parse(fresh)).toEqual({ pluginConfigs: { 'a@b': { options: { x: 1 } } } })
  expect(fresh.split('\n')[1]).toBe('  "pluginConfigs": {')
})

test('number fields are checked; values read plainly', () => {
  expect(parseValue('number', '12')).toEqual({ value: 12 })
  expect(parseValue('number', 'ten')).toEqual({ error: 'Enter a number' })
  expect(parseValue('text', 'hi')).toEqual({ value: 'hi' })
  expect(shown(true)).toBe('On')
  expect(shown('')).toBe('(empty)')
})

test('in the app /doole_settings opens a side panel listing each mod; opening one shows its settings, and a change is saved into settings.json', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: 'F:/proj', surface: 'desktop', isInteractive: true } as any)
  await $.command.run({ command: 'doole_settings', args: '' } as any)
  const ui = await $.ui.mount(PANE('desktop'))
  const all = await texts(ui)
  expect(all).toContain('Mod Settings')
  expect(all).toContain('3 mods · 5 settings')
  expect(all).toContain('Bottom Bar')
  expect(all).not.toContain('The accent colour')
  await ui.press({ key: 'mod:bottom-bar:toggle' })
  expect(await texts(ui)).toContain('The accent colour')
  expect(await ui.find({ type: 'Select', key: 'bottom-bar.colour:select' })).toBeDefined()
  expect(await texts(ui)).toContain('Pill name')
  expect(await ui.find({ type: 'Input', key: 'bottom-bar.name:input' })).toBeDefined()
  await ui.press({ key: 'mod:clean-view:toggle' })
  expect(await texts(ui)).not.toContain('The accent colour')
  await ui.press({ key: 'clean-view.enabled:off' })
  expect(w.writes).toHaveLength(1)
  expect(w.writes[0]!.path).toBe(SETTINGS_PATH)
  expect(JSON.parse(w.writes[0]!.text)).toEqual({ ...SAVED, pluginConfigs: { ...SAVED.pluginConfigs, 'clean-view@dooles-tools': { options: { enabled: false } } } })
  expect(await texts(ui)).toContain('Enabled saved. Run /reload-plugins to apply it.')
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
  const long = { ...MANIFESTS['bottom-bar'] as any }
  long.userConfig = { ...long.userConfig, folder: field('string', 'F' + 'y'.repeat(100), 'C:/' + 'x'.repeat(200), { description: 'D' + 'z'.repeat(100) }) }
  const saved = MANIFESTS['bottom-bar']
  MANIFESTS['bottom-bar'] = long
  try {
    world(on)
    await $.session.start({ cwd: 'F:/proj', surface: 'desktop', isInteractive: true } as any)
    await $.command.run({ command: 'doole_settings', args: '' } as any)
    const ui = await $.ui.mount(PANE('desktop'))
    await ui.press({ key: 'mod:bottom-bar:toggle' })
    const all = ((await ui.findAll({ type: 'Text' })) as any[]).map(t => String(t.text))
    const words = all.flatMap(t => t.split(/\s+/))
    expect(words.some(w => w.includes('yyyy') && w.endsWith('…')) && words.some(w => w.includes('zzzz') && w.endsWith('…'))).toBe(true)
    for (const w of words) expect(w.length, w).toBeLessThanOrEqual(44 - 10)
    await ui.unmount()
  } finally {
    MANIFESTS['bottom-bar'] = saved
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
  const sets = world(on, false).writes
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
  expect(all).toContain('3 mods · 5 settings')
  expect(await ui.find({ type: 'Button', key: 'sb-tab:flightdeck' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'sb-close' })).toBeDefined()
  // A mod’s settings still open and change in place under the strip.
  await ui.press({ key: 'mod:clean-view:toggle' })
  await ui.press({ key: 'clean-view.enabled:off' })
  expect(w.sets.map(x => JSON.parse(x.text).pluginConfigs['clean-view@dooles-tools'].options)).toEqual([{ enabled: false }])
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

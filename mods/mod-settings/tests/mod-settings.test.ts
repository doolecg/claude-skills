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
function world(on: any) {
  const rows = ROWS.map(r => ({ ...r }))
  const sets: { key: string; value: unknown }[] = []
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
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

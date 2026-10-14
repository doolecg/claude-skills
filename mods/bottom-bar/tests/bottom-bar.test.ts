import { test, expect, mock } from 'claude-code/testing'

import {
  ACCENTS,
  EFFORTS,
  EMPTY_FIGURES,
  DARK,
  LIGHT,
  SEPARATOR,
  clip,
  effortLabel,
  isModCommand,
  mergeModes,
  modelChoiceLabel,
  modelChoices,
  modelName,
  paletteFor,
  pickerSections,
  stateFromReply,
  sameFigures,
  segmentOffset,
  segments,
  toolLabel,
  windowLabel,
} from '../hooks/bar-logic'
import { toolboxWidth } from '../hooks/toolbox'
import {
  currentAlias,
  effortName,
  launchList,
  modLines,
  nextOption,
  pickInstalls,
  settingsList,
  spaced,
} from '../hooks/toolbox-logic'

const PICKER = 'bottom-bar-tools'
const TOOLBOX = 'bottom-bar-toolbox'

const cmd = (name: string, plugin: string, source: string, description = `${name} command`) => ({
  name,
  description,
  plugin,
  source,
})

// A mod's own command (plugin, no ':'), a namespaced plugin command, and a built-in.
const CLEAN = cmd('clean-view', 'clean-view', 'plugin')
const PROMPT = cmd('prompt-upgrade', 'prompt-upgrade', 'plugin')
const BRAIN = cmd('superpowers:brainstorming', 'superpowers', 'plugin')
const COMPACT = cmd('compact', '', 'builtin')
const ALL = [CLEAN, PROMPT, BRAIN, COMPACT]

const BAR_PROPS = { modes: [] as string[] } as any
const PANE_PROPS = {
  title: "Doole's Tools",
  isFocused: true,
  bodyColumns: 60,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as any

const draw = (...args: any[]) => (globalThis as any).h(...args)

const mountBar = ($: any, surface: 'terminal' | 'desktop' = 'terminal', props: any = BAR_PROPS) =>
  $.ui.mount({ plugin: 'bottom-bar', surface, component: 'SessionMode', props })

const mountPane = ($: any, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'bottom-bar', surface, component: 'Pane', requestId: PICKER, props: PANE_PROPS })

const startSession = ($: any) => $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

// Registers what sits beneath the mod in a real session: the saved store (`mock.store`,
// with a recorder on the `tools` key so a test can read what was written), the clock,
// the command list, the pane open/close, the session hooks the bar listens to, and a
// recorder for the commands the bar runs.
function world(on: any, saved: Record<string, unknown> = {}, commands: any[] = ALL) {
  const seen = {
    writes: [] as unknown[],
    ran: [] as string[],
    runs: [] as { command: string; args: string }[],
    opened: [] as string[],
    titles: [] as string[],
    closed: [] as string[],
    toasts: [] as string[],
    unknownCommands: false,
  }
  // Registered before mock.store so it sees the write, then passes it down to the store.
  on('store.set', { key: 'tools' }, async (_$: any, e: any, next: any) => {
    seen.writes.push(e.value)
    return next(e)
  })
  mock.store(on, saved)
  mock.clock(on)
  on('command.list', () => ({ value: commands }))
  on('ui.open', (_$: any, e: any) => {
    seen.opened.push(e.id)
    seen.titles.push(e.title)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$: any, e: any) => {
    seen.closed.push(e.id)
    return { value: undefined }
  })
  on('ui.toast', (_$: any, e: any) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('command.run', (_$: any, e: any) => {
    seen.ran.push(e.command)
    seen.runs.push({ command: e.command, args: e.args })
    // The engine rejects a command nothing serves; a hook that fails stands in for that.
    if (seen.unknownCommands) throw new Error('unknown command')
    return { text: `ran ${e.command}` }
  })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  return seen
}

// The /config model row, as the engine lists it: plain family aliases, a default and a 1M variant.
const MODEL_OPTIONS = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'opus[1m]']
const MODEL_ROWS = (options: readonly string[]) => [
  { key: 'theme', label: 'Theme', kind: 'choice', value: 'dark', options: ['dark', 'light'], isLocked: false },
  { key: 'model', label: 'Model', kind: 'choice', value: 'default', options, isLocked: false },
]

// Answers what the bar reads to fill its model and effort segments (session.start refreshes
// from these) and what the pickers write (config.set), recording each write.
function seedModel(
  on: any,
  opts: { model?: string; effort?: string; options?: readonly string[]; rows?: any[] } = {},
) {
  const engine = {
    model: opts.model ?? 'claude-opus-5-5',
    effort: opts.effort ?? 'high',
    configSets: [] as { key: string; value: unknown }[],
    denyModel: undefined as string | undefined,
  }
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1_000_000, percent: 10 }, rateLimits: [] },
  }))
  on('session.model', () => ({ value: engine.model }))
  on('agent.list', () => ({ value: [] }))
  on('settings.read', () => ({ value: { effortLevel: engine.effort } }))
  const extra = opts.rows ?? []
  on('config.list', () => ({ value: [...MODEL_ROWS(opts.options ?? MODEL_OPTIONS), ...extra] }))
  on('config.set', (_$: any, e: any) => {
    engine.configSets.push({ key: e.key, value: e.value })
    if (engine.denyModel !== undefined) return { deny: engine.denyModel }
    const found = extra.find(r => r.key === e.key)
    if (found) found.value = e.value
    else engine.model = String(e.value)
    return { value: e.value }
  })
  return engine
}

const keysOf = async (bar: any, prefix: string) =>
  (await bar.findAll({ type: 'Button' })).map((b: any) => b.key as string).filter((k: string) => k.startsWith(prefix))

// The first node under `tree` with this prop value, depth first.
function findProp(tree: any, prop: string, value: unknown): any {
  if (tree?.props?.[prop] === value) return tree
  for (const child of tree?.children ?? []) {
    const hit = typeof child === 'object' ? findProp(child, prop, value) : undefined
    if (hit) return hit
  }
  return undefined
}

// ---------------------------------------------------------------- bar-logic

test('modelName shortens ids and leaves unknown ones alone', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
  expect(modelName('Opus 5.5')).toBe('Opus 5.5')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('sonnet')).toBe('Sonnet')
  expect(modelName('some-other-model')).toBe('some-other-model')
})

test('windowLabel prints a size or nothing', () => {
  expect(windowLabel(1_000_000)).toBe('1M')
  expect(windowLabel(200_000)).toBe('200K')
  expect(windowLabel(1_500_000)).toBe('1.5M')
  expect(windowLabel(0)).toBe('')
  expect(windowLabel(Number.NaN)).toBe('')
})

test('toolLabel turns a command into a title', () => {
  expect(toolLabel('clean-view')).toBe('Clean View')
  expect(toolLabel('superpowers:brainstorming')).toBe('Brainstorming')
  expect(toolLabel('prompt_upgrade')).toBe('Prompt Upgrade')
})

test('effortLabel, isModCommand, paletteFor and sameFigures', () => {
  expect(effortLabel(undefined)).toBe('')
  expect(effortLabel(null)).toBe('')
  expect(effortLabel('high')).toBe('high')
  expect(effortLabel(3)).toBe('3')

  expect(isModCommand(CLEAN)).toBe(true)
  expect(isModCommand(BRAIN)).toBe(false)
  expect(isModCommand(COMPACT)).toBe(false)

  expect(paletteFor('light')).toBe(LIGHT)
  expect(paletteFor('light-daltonized')).toBe(LIGHT)
  expect(paletteFor('dark')).toBe(DARK)
  expect(paletteFor(undefined)).toBe(DARK)

  expect(sameFigures(EMPTY_FIGURES, { ...EMPTY_FIGURES })).toBe(true)
  expect(sameFigures(EMPTY_FIGURES, { ...EMPTY_FIGURES, ctx: 5 })).toBe(false)
  expect(sameFigures(EMPTY_FIGURES, { ...EMPTY_FIGURES, agents: 1 })).toBe(false)
})

test('segments show only the figures that exist', () => {
  const keys = (f: any) => segments(f, DARK).map(s => s.key)
  expect(keys(EMPTY_FIGURES)).toEqual(['ctx', 'agents'])
  expect(
    keys({ model: 'Opus 5.5', window: 1_000_000, effort: 'high', ctx: 42, fiveHour: 30, agents: 2 }),
  ).toEqual(['model', 'effort', 'ctx', 'fiveHour', 'agents'])

  const model = segments({ ...EMPTY_FIGURES, model: 'Opus 5.5', window: 1_000_000 }, DARK).find(s => s.key === 'model')
  expect(model?.parts.map(p => p.text).join('')).toBe('◆ Opus 5.5 · 1M')

  const one = segments({ ...EMPTY_FIGURES, agents: 1 }, DARK).find(s => s.key === 'agents')
  expect(one?.parts.map(p => p.text).join('')).toBe('◆ 1 agent')
  const none = segments(EMPTY_FIGURES, DARK).find(s => s.key === 'agents')
  expect(none?.parts.map(p => p.text).join('')).toBe('◇ 0 agents')
})

test('segmentOffset: columns from the row start to where a segment starts', () => {
  const list = segments({ model: 'Opus 5.5', window: 1_000_000, effort: 'high', ctx: 42, fiveHour: 30, agents: 0 }, DARK)
  expect(list.map(x => x.key)).toEqual(['model', 'effort', 'ctx', 'fiveHour', 'agents'])
  const width = (key: string) => [...list.find(x => x.key === key)!.parts.map(p => p.text).join('')].length

  expect(segmentOffset(list, 'model')).toBe(0)
  // '◆ Opus 5.5 · 1M' is 15 columns, then the separator.
  expect(width('model')).toBe(15)
  expect(segmentOffset(list, 'effort')).toBe(width('model') + SEPARATOR.length)
  expect(segmentOffset(list, 'effort')).toBe(18)
  expect(segmentOffset(list, 'ctx')).toBe(width('model') + width('effort') + 2 * SEPARATOR.length)

  // A segment that is not drawn, or an empty list, starts at 0.
  expect(segmentOffset(list, 'nope')).toBe(0)
  expect(segmentOffset([], 'model')).toBe(0)

  // Columns count characters, not UTF-16 units.
  const emoji = [
    { key: 'a', parts: [{ text: '😀😀', color: '#fff' }] },
    { key: 'b', parts: [{ text: 'x', color: '#fff' }] },
  ]
  expect(segmentOffset(emoji, 'b')).toBe(2 + SEPARATOR.length)
})

test('EFFORTS lists the five levels from low to max', () => {
  expect([...EFFORTS]).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
})

test('modelChoices keeps only the plain family aliases, in the row order', () => {
  expect(modelChoices(['default', 'sonnet', 'opus', 'haiku', 'fable', 'opus[1m]'])).toEqual([
    'sonnet',
    'opus',
    'haiku',
    'fable',
  ])
  expect(modelChoices(['haiku', 'opus'])).toEqual(['haiku', 'opus'])
  expect(modelChoices(['default', 'opus[1m]', 'claude-opus-5-5'])).toEqual(['opus', 'sonnet', 'haiku', 'fable'])
  expect(modelChoices([])).toEqual(['opus', 'sonnet', 'haiku', 'fable'])
  expect(modelChoices(undefined)).toEqual(['opus', 'sonnet', 'haiku', 'fable'])
})

test('modelChoiceLabel shows the full name for the model in use', () => {
  expect(modelChoiceLabel('opus', 'Opus 5.5')).toBe('Opus 5.5')
  expect(modelChoiceLabel('sonnet', 'Opus 5.5')).toBe('Sonnet')
  expect(modelChoiceLabel('haiku', 'Haiku 4.5')).toBe('Haiku 4.5')
  expect(modelChoiceLabel('fable', '')).toBe('Fable')
  expect(modelChoiceLabel('opus', 'some-other-model')).toBe('Opus')
})

test('clip shortens with an ellipsis', () => {
  expect(clip('hello world', 6)).toBe('hello…')
  expect(clip('hello', 5)).toBe('hello')
  expect(clip('hi', 6)).toBe('hi')
  expect(clip('abc', 0)).toBe('')
  expect(clip('abc', -3)).toBe('')
  expect(clip('abc', 1)).toBe('…')
  // counts characters, not UTF-16 units
  expect(clip('😀😀😀', 2)).toBe('😀…')
})

test('pickerSections: mods first, other commands only when searched, chosen not repeated', () => {
  // No query: only the mods.
  let s = pickerSections(ALL, [], '')
  expect(s.inPill).toEqual([])
  expect(s.mods.map(c => c.name)).toEqual(['clean-view', 'prompt-upgrade'])
  expect(s.others).toEqual([])

  // A blank query counts as no query.
  s = pickerSections(ALL, [], '   ')
  expect(s.others).toEqual([])

  // A chosen command is listed under inPill and not repeated under mods.
  s = pickerSections(ALL, ['clean-view'], '')
  expect(s.inPill.map(c => c.name)).toEqual(['clean-view'])
  expect(s.mods.map(c => c.name)).toEqual(['prompt-upgrade'])

  // A query finds namespaced and built-in commands, by name.
  s = pickerSections(ALL, [], 'brain')
  expect(s.mods).toEqual([])
  expect(s.others.map(c => c.name)).toEqual(['superpowers:brainstorming'])
  s = pickerSections(ALL, [], 'COMPACT')
  expect(s.others.map(c => c.name)).toEqual(['compact'])

  // ... and by plugin name.
  s = pickerSections(ALL, [], 'superpowers')
  expect(s.others.map(c => c.name)).toEqual(['superpowers:brainstorming'])

  // The query narrows mods too.
  s = pickerSections(ALL, [], 'prompt')
  expect(s.mods.map(c => c.name)).toEqual(['prompt-upgrade'])

  // A chosen other command is in the pill and not repeated under others.
  s = pickerSections(ALL, ['compact'], 'compact')
  expect(s.inPill.map(c => c.name)).toEqual(['compact'])
  expect(s.others).toEqual([])

  // A chosen command that is no longer installed is still shown, marked.
  s = pickerSections(ALL, ['gone-mod'], '')
  expect(s.inPill).toEqual([{ name: 'gone-mod', description: 'not installed now', plugin: '', source: 'plugin' }])

  // Other commands are capped at 30.
  const many = Array.from({ length: 50 }, (_, i) => cmd(`ns:cmd-${i}`, 'ns', 'plugin'))
  expect(pickerSections(many, [], 'cmd').others).toHaveLength(30)
})

// ---------------------------------------------------------------------- ui

test('terminal: the bar draws a pill and the pill opens the tools box', async ($, on) => {
  world(on)
  let engine = 0
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    engine++
    return draw($.ui.resolve(e).Text, {}, 'engine bar')
  })
  const bar = await mountBar($)

  expect(await bar.find({ key: 'pill' })).toBeDefined()
  expect(await bar.find({ type: 'Text', text: /Doole's Tools/ })).toBeDefined()
  expect(await bar.find({ type: 'Text', text: '0 agents' })).toBeDefined()
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()

  await bar.press({ key: 'pill' })
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()
  expect(await bar.find({ type: 'Text', text: 'Choose pills' })).toBeDefined()

  await bar.press({ key: 'pill' })
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()

  // On the terminal the mod draws the bar itself and never asks the engine for one.
  expect(engine).toBe(0)
})

test('terminal: the footer modes are shown beside the pill', async ($, on) => {
  world(on)
  const bar = await mountBar($, 'terminal', { modes: ['focus', 'memory paused'] })
  expect(await bar.find({ type: 'Text', text: /focus & memory paused/ })).toBeDefined()
  expect(await bar.find({ key: 'pill' })).toBeDefined()
})

test('terminal: measured figures reach the bar', async ($, on) => {
  world(on)
  await $.session.measure({
    context: { window: 1_000_000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 30 }],
    changed: ['context', 'rateLimits'],
  } as any)
  const bar = await mountBar($)
  expect(await bar.find({ type: 'Text', text: ' 42%' })).toBeDefined()
  expect(await bar.find({ type: 'Text', text: '30%' })).toBeDefined()
})

test('desktop: the hook defers to the engine and draws no pill', async ($, on) => {
  world(on)
  const asked: string[] = []
  // What sits beneath the mod is the engine's own drawing; the mod must pass the call to it.
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    asked.push(e.surface)
    return draw($.ui.resolve(e).Text, {}, 'engine footer')
  })
  const bar = await mountBar($, 'desktop')
  expect(asked).toEqual(['desktop'])
  expect(await bar.find({ type: 'Text', text: 'engine footer' })).toBeDefined()
  expect(await bar.find({ key: 'pill' })).toBeUndefined()
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()
})

// ------------------------------------------------------------------ picker

test('picker: choose opens the pane and pick:<name> toggles a command in the store', async ($, on) => {
  const seen = world(on)

  // Pressing "choose" loads the command list into state and opens the pane.
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-choose' })
  expect(seen.opened).toEqual([PICKER])

  const pane = await mountPane($)
  expect(await pane.find({ key: 'pick:clean-view' })).toBeDefined()
  expect(await pane.find({ key: 'pick:prompt-upgrade' })).toBeDefined()
  // Not a mod and no search yet: not listed.
  expect(await pane.find({ key: 'pick:superpowers:brainstorming' })).toBeUndefined()
  expect(await pane.find({ key: 'pick:compact' })).toBeUndefined()
  expect(await pane.find({ key: 'done' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Nothing yet.' })).toBeDefined()
  expect(seen.writes).toEqual([])

  // Add one.
  await pane.press({ key: 'pick:clean-view' })
  expect(seen.writes.at(-1)).toEqual(['clean-view'])
  const added = await pane.find({ key: 'pick:clean-view' })
  expect(added?.text).toMatch(/^● \/clean-view/)

  // Add a second, order kept.
  await pane.press({ key: 'pick:prompt-upgrade' })
  expect(seen.writes.at(-1)).toEqual(['clean-view', 'prompt-upgrade'])

  // Pressing a chosen one takes it out again.
  await pane.press({ key: 'pick:clean-view' })
  expect(seen.writes.at(-1)).toEqual(['prompt-upgrade'])
  const removed = await pane.find({ key: 'pick:clean-view' })
  expect(removed?.text).toMatch(/^○ \/clean-view/)

  // Done closes the pane.
  await pane.press({ key: 'done' })
  expect(seen.closed).toEqual([PICKER])
})

test('picker: the chosen commands become buttons in the bar and run when pressed', async ($, on) => {
  const seen = world(on)

  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-choose' })
  const pane = await mountPane($)
  await pane.press({ key: 'pick:clean-view' })
  await pane.press({ key: 'pick:prompt-upgrade' })

  // The tools row shows one button per chosen command, labelled as a title.
  const tool = await bar.find({ key: 'tool:clean-view' })
  expect(tool).toBeDefined()
  expect(tool?.text).toContain('Clean View')
  expect(await bar.find({ key: 'tool:prompt-upgrade' })).toBeDefined()
  expect(await bar.find({ type: 'Text', text: 'Nothing in the pill yet' })).toBeUndefined()

  // Pressing one runs the command and closes the row.
  await bar.press({ key: 'tool:clean-view' })
  expect(seen.ran).toEqual(['clean-view'])
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()
})

test('picker: a search lists other commands and they can be added too', async ($, on) => {
  const seen = world(on)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-choose' })
  const pane = await mountPane($)

  await pane.input({ key: 'filter', text: 'brain', kind: 'change' })
  expect(await pane.find({ key: 'pick:superpowers:brainstorming' })).toBeDefined()
  expect(await pane.find({ key: 'pick:clean-view' })).toBeUndefined()

  await pane.press({ key: 'pick:superpowers:brainstorming' })
  expect(seen.writes.at(-1)).toEqual(['superpowers:brainstorming'])
  await pane.press({ key: 'pick:superpowers:brainstorming' })
  expect(seen.writes.at(-1)).toEqual([])
})

test('saved tools come back at session start', async ($, on) => {
  world(on, { tools: ['clean-view', 'prompt-upgrade'], other: 1 })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  expect(await bar.find({ key: 'tool:clean-view' })).toBeDefined()
  expect(await bar.find({ key: 'tool:prompt-upgrade' })).toBeDefined()
})

test('a saved command that is gone shows a toast instead of failing', async ($, on) => {
  const seen = world(on, { tools: ['gone-mod'] })
  seen.unknownCommands = true
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  expect(await bar.find({ key: 'tool:gone-mod' })).toBeDefined()
  await bar.press({ key: 'tool:gone-mod' })
  expect(seen.toasts.join(' ')).toContain('/gone-mod is not available')
})

// ------------------------------------------------------------ model and effort

test('model picker: pressing the model segment lists the plain family aliases only', async ($, on) => {
  world(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)

  // The segments are buttons once the figures exist.
  expect(await bar.find({ key: 'model' })).toBeDefined()
  expect(await bar.find({ key: 'effort' })).toBeDefined()
  expect(await keysOf(bar, 'set-')).toEqual([])

  await bar.press({ key: 'model' })
  // Only sonnet, opus, haiku and fable, in the row's order; not default or opus[1m].
  expect(await keysOf(bar, 'set-model:')).toEqual([
    'set-model:sonnet',
    'set-model:opus',
    'set-model:haiku',
    'set-model:fable',
  ])
  expect(await bar.find({ key: 'set-model:default' })).toBeUndefined()
  expect(await bar.find({ key: 'set-model:opus[1m]' })).toBeUndefined()
  expect(await keysOf(bar, 'set-effort:')).toEqual([])

  // The model in use is marked and shown by its full name.
  expect((await bar.find({ key: 'set-model:opus' }))?.text).toMatch(/^● Opus 5\.5/)
  expect((await bar.find({ key: 'set-model:sonnet' }))?.text).toMatch(/^○ Sonnet/)
})

test('model picker: with no plain aliases in the row it offers the four families', async ($, on) => {
  world(on)
  seedModel(on, { options: ['default', 'opus[1m]'] })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'model' })
  expect(await keysOf(bar, 'set-model:')).toEqual([
    'set-model:opus',
    'set-model:sonnet',
    'set-model:haiku',
    'set-model:fable',
  ])
})

test('model picker: picking a model sets it through config.set and closes the box', async ($, on) => {
  const seen = world(on)
  const engine = seedModel(on)
  await startSession($)
  const bar = await mountBar($)

  await bar.press({ key: 'model' })
  await bar.press({ key: 'set-model:sonnet' })

  expect(engine.configSets).toEqual([{ key: 'model', value: 'sonnet' }])
  expect(await keysOf(bar, 'set-')).toEqual([])
  expect(seen.toasts).toEqual([])
  // The bar refreshed from the new model.
  expect((await bar.find({ key: 'model' }))?.text).toContain('Sonnet')

  // Reopening marks the new model as the one in use.
  await bar.press({ key: 'model' })
  expect((await bar.find({ key: 'set-model:sonnet' }))?.text).toMatch(/^● Sonnet/)
  expect((await bar.find({ key: 'set-model:opus' }))?.text).toMatch(/^○ Opus/)
})

test('model picker: a refused change shows a toast and keeps the model', async ($, on) => {
  const seen = world(on)
  const engine = seedModel(on)
  engine.denyModel = 'managed by your organisation'
  await startSession($)
  const bar = await mountBar($)

  await bar.press({ key: 'model' })
  await bar.press({ key: 'set-model:haiku' })

  expect(engine.configSets).toEqual([{ key: 'model', value: 'haiku' }])
  expect(seen.toasts.join(' ')).toContain('Could not change the model: managed by your organisation')
  expect(await keysOf(bar, 'set-')).toEqual([])
  expect((await bar.find({ key: 'model' }))?.text).toContain('Opus 5.5')
})

test('effort picker: pressing the effort segment lists the five levels and picking one runs /effort', async ($, on) => {
  const seen = world(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  expect((await bar.find({ key: 'effort' }))?.text).toContain('high')

  await bar.press({ key: 'effort' })
  expect(await keysOf(bar, 'set-effort:')).toEqual([
    'set-effort:low',
    'set-effort:medium',
    'set-effort:high',
    'set-effort:xhigh',
    'set-effort:max',
  ])
  expect(await keysOf(bar, 'set-model:')).toEqual([])
  // The current level is marked.
  expect((await bar.find({ key: 'set-effort:high' }))?.text).toMatch(/^● high/)
  expect((await bar.find({ key: 'set-effort:low' }))?.text).toMatch(/^○ low/)

  await bar.press({ key: 'set-effort:max' })
  expect(seen.runs).toEqual([{ command: 'effort', args: 'max' }])
  expect(await keysOf(bar, 'set-')).toEqual([])
  // The bar shows the new level straight away.
  expect((await bar.find({ key: 'effort' }))?.text).toContain('max')
})

test('effort picker: a command that fails shows a toast and keeps the level', async ($, on) => {
  const seen = world(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)

  seen.unknownCommands = true
  await bar.press({ key: 'effort' })
  await bar.press({ key: 'set-effort:low' })

  expect(seen.runs).toEqual([{ command: 'effort', args: 'low' }])
  expect(seen.toasts.join(' ')).toContain('Could not set effort to low')
  expect(await keysOf(bar, 'set-')).toEqual([])
  expect((await bar.find({ key: 'effort' }))?.text).toContain('high')
})

test('pickers: the same segment again closes the box, the other segment swaps it', async ($, on) => {
  world(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)

  await bar.press({ key: 'model' })
  expect((await keysOf(bar, 'set-model:')).length).toBe(4)
  await bar.press({ key: 'model' })
  expect(await keysOf(bar, 'set-')).toEqual([])

  await bar.press({ key: 'effort' })
  expect((await keysOf(bar, 'set-effort:')).length).toBe(5)
  await bar.press({ key: 'effort' })
  expect(await keysOf(bar, 'set-')).toEqual([])

  // Pressing the other segment swaps the box.
  await bar.press({ key: 'model' })
  await bar.press({ key: 'effort' })
  expect(await keysOf(bar, 'set-model:')).toEqual([])
  expect((await keysOf(bar, 'set-effort:')).length).toBe(5)
})

test('pickers: the pill closes the box, and a box closes the pill row', async ($, on) => {
  world(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)

  await bar.press({ key: 'model' })
  expect((await keysOf(bar, 'set-model:')).length).toBe(4)
  await bar.press({ key: 'pill' })
  expect(await keysOf(bar, 'set-')).toEqual([])
  // ... and the pill opened its own row.
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()

  await bar.press({ key: 'effort' })
  expect((await keysOf(bar, 'set-effort:')).length).toBe(5)
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()
})

test('pickers: the box sits above the segment it belongs to', async ($, on) => {
  world(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)

  await bar.press({ key: 'model' })
  const modelBox = findProp(await bar.drawn(), 'alignSelf', 'flex-start')
  expect(modelBox?.props.marginLeft ?? 0).toBe(0)

  await bar.press({ key: 'effort' })
  const effortBox = findProp(await bar.drawn(), 'alignSelf', 'flex-start')
  // The effort segment starts after '◆ Opus 5.5 · 1M' and one separator.
  expect(effortBox?.props.marginLeft).toBe(18)
})

test('pickers: the model and effort segments only become buttons once they have a figure', async ($, on) => {
  world(on)
  // No session start and nothing measured: no model, no effort, so nothing to press.
  const bar = await mountBar($)
  expect(await bar.find({ key: 'model' })).toBeUndefined()
  expect(await bar.find({ key: 'effort' })).toBeUndefined()
  expect(await bar.find({ key: 'pill' })).toBeDefined()
})

test('stateFromReply reads on and off from a command reply', () => {
  expect(stateFromReply('Diff panel shown')).toBe('on')
  expect(stateFromReply('Diff panel hidden')).toBe('off')
  expect(stateFromReply('collision-guard: Collision Guard is on. Before an edit, it asks')).toBe('on')
  expect(stateFromReply('Clean View is now off.')).toBe('off')
  expect(stateFromReply('Ran the report.')).toBeUndefined()
})

test('mergeModes keeps each mod\'s own entries and drops malformed ones', () => {
  const first = mergeModes({}, 'clean-view', { simple: { label: 'Clean View', isOn: true }, bad: { isOn: 'yes' } })
  expect(first).toEqual({ simple: { label: 'Clean View', isOn: true, plugin: 'clean-view' } })
  const both = mergeModes(first, 'guard', { guard: { isOn: false } })
  expect(both.guard).toEqual({ label: 'Guard', isOn: false, plugin: 'guard' })
  expect(mergeModes(both, 'clean-view', {})).toEqual({ guard: { label: 'Guard', isOn: false, plugin: 'guard' } })
})

// A stand-in mod with an on/off mode: `/demo` flips it and publishes it as its `modes` state.
const DEMO_MOD = {
  name: 'demo-mode',
  register: ((on: any) => {
    let isOn = true
    on('session.start', async ($: any, e: any, next: any) => {
      const ran = await next(e)
      await $.command.register({ name: 'demo', description: 'Flip the demo mode' })
      await $.state.set({ plugin: 'demo-mode', key: 'modes' }, { demo: { label: 'Demo Mode', isOn } })
      return ran
    })
    on('command.run', { command: 'demo' }, async ($: any) => {
      isOn = !isOn
      await $.state.set({ plugin: 'demo-mode', key: 'modes' }, { demo: { label: 'Demo Mode', isOn } })
      return { text: isOn ? 'Demo is on.' : 'Demo is off.' }
    })
  }) as any,
}

test('a mod that publishes its mode shows on and off in its pill, live', { plugins: [DEMO_MOD] }, async ($, on) => {
  const DEMO = cmd('demo', 'demo-mode', 'plugin', 'Flip the demo mode')
  world(on, { tools: ['demo'] }, [DEMO, COMPACT])
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
  await startSession($)
  const bar = await mountBar($)
  expect((await bar.find({ key: 'tool:demo' }))?.text).toContain('● Demo Mode')

  await bar.press({ key: 'tool:demo' })
  expect((await bar.find({ key: 'tool:demo' }))?.text).toContain('○ Demo Mode')

  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-choose' })
  const pane = await mountPane($)
  expect((await pane.find({ key: 'pick:demo' }))?.text).toContain('Demo Mode on/off button, now off')
})

// ------------------------------------------------------- 1.2.0: name, /choose-pills

const registerCommands = (on: any) => on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
// The label state is what titles the picker pane.
const paneTitle = async ($: any, seen: ReturnType<typeof world>) => {
  await $.command.run({ command: 'choose-pills', args: '' })
  return seen.titles.at(-1)
}

test('the pill shows the default name when no name is configured', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  await startSession($)
  const bar = await mountBar($)
  expect((await bar.find({ key: 'pill' }))?.text).toContain("Doole's Tools")
  expect(await paneTitle($, seen)).toBe("Doole's Tools")
})

test('the pill shows the configured name and publishes it as the label', { options: { name: "Tristen's Tools" } }, async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  await startSession($)
  const bar = await mountBar($)
  const pill = (await bar.find({ key: 'pill' }))?.text
  expect(pill).toContain("Tristen's Tools")
  expect(pill).not.toContain("Doole's Tools")
  expect(await paneTitle($, seen)).toBe("Tristen's Tools")
})

test('a blank configured name falls back to the default', { options: { name: '   ' } }, async ($, on) => {
  world(on)
  registerCommands(on)
  await startSession($)
  const bar = await mountBar($)
  expect((await bar.find({ key: 'pill' }))?.text).toContain("Doole's Tools")
})

const runCommand = ($: any, command: string) =>
  $.command.run({ command, args: '', origin: { kind: 'plugin', name: 'bottom-bar' }, presentation: { isFullscreen: false, columns: 80 } })

test('the configured name is trimmed and titles the picker pane', { options: { name: " Tristen's Tools " } }, async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  await startSession($)
  const bar = await mountBar($)
  expect((await bar.find({ key: 'pill' }))?.text).toContain("Tristen's Tools")
  await runCommand($, 'choose-pills')
  expect(seen.opened).toEqual([PICKER])
  expect(seen.titles).toEqual(["Tristen's Tools"])
})

test('the pill opens the toolbox box, and pressing it again closes it', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  await startSession($)
  const bar = await mountBar($)

  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()
  await bar.press({ key: 'pill' })
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()
  expect((await bar.find({ key: 'pill' }))?.text).toContain('▼')
  // The toolbox is the bar's own box: no command runs to open it.
  expect(seen.runs).toEqual([])

  await bar.press({ key: 'pill' })
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()
  expect((await bar.find({ key: 'pill' }))?.text).toContain('▲')
})

test('an open model box is swapped for the toolbox by the pill', async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'model' })
  expect((await keysOf(bar, 'set-model:')).length).toBe(4)
  await bar.press({ key: 'pill' })
  expect(await keysOf(bar, 'set-')).toEqual([])
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()
})

test('toolbox: the header spells the name out and the rows are labelled', async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })

  expect(await bar.find({ type: 'Text', text: "◆ D O O L E ' S   T O O L S" })).toBeDefined()
  expect(await bar.find({ type: 'Text', text: 'Opus 5.5 · High' })).toBeUndefined()
  expect(await bar.find({ type: 'Text', text: 'Model     ' })).toBeDefined()
  expect(await bar.find({ type: 'Text', text: 'Effort    ' })).toBeDefined()
})

test('toolbox: a configured name is spelled out in the header', { options: { name: "Tristen's Tools" } }, async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  expect(await bar.find({ type: 'Text', text: "◆ T R I S T E N ' S   T O O L S" })).toBeDefined()
})

test('toolbox: the model and effort chips mark what is in use', async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })

  expect(await keysOf(bar, 'tb-model:')).toEqual([
    'tb-model:sonnet',
    'tb-model:opus',
    'tb-model:haiku',
    'tb-model:fable',
  ])
  expect(await keysOf(bar, 'tb-effort:')).toEqual([
    'tb-effort:low',
    'tb-effort:medium',
    'tb-effort:high',
    'tb-effort:xhigh',
    'tb-effort:max',
  ])
  // The model in use shows its full name; the others a family name.
  expect((await bar.find({ key: 'tb-model:opus' }))?.text).toContain('Opus 5.5')
  expect((await bar.find({ key: 'tb-model:sonnet' }))?.text).toContain('Sonnet')
  expect((await bar.find({ key: 'tb-effort:xhigh' }))?.text).toContain('XHigh')
  // Only the one in use is filled.
  const filled = async (key: string) => findProp(await bar.find({ key }), 'backgroundColor', DARK.accent)
  expect(await filled('tb-model:opus')).toBeDefined()
  expect(await filled('tb-model:sonnet')).toBeUndefined()
  const inUse = async (key: string) => findProp(await bar.find({ key }), 'backgroundColor', DARK.info)
  expect(await inUse('tb-effort:high')).toBeDefined()
  expect(await inUse('tb-effort:low')).toBeUndefined()
})

test('toolbox: an effort chip runs /effort and the box stays open', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })

  await bar.press({ key: 'tb-effort:max' })
  expect(seen.runs).toEqual([{ command: 'effort', args: 'max' }])
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()
  expect(findProp(await bar.find({ key: 'tb-effort:max' }), 'backgroundColor', DARK.info)).toBeDefined()
  expect(findProp(await bar.find({ key: 'tb-effort:high' }), 'backgroundColor', DARK.info)).toBeUndefined()
  expect((await bar.find({ key: 'effort' }))?.text).toContain('max')
})

test('toolbox: a model chip sets the model through config.set and the box stays open', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  const engine = seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })

  await bar.press({ key: 'tb-model:sonnet' })
  expect(engine.configSets).toEqual([{ key: 'model', value: 'sonnet' }])
  expect(seen.toasts).toEqual([])
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()
  expect(findProp(await bar.find({ key: 'tb-model:sonnet' }), 'backgroundColor', DARK.accent)).toBeDefined()
  expect(findProp(await bar.find({ key: 'tb-model:opus' }), 'backgroundColor', DARK.accent)).toBeUndefined()
})

test('toolbox: a refused model change shows a toast and keeps the box open', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  const engine = seedModel(on)
  engine.denyModel = 'managed by your organisation'
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-model:haiku' })
  expect(seen.toasts.join(' ')).toContain('Could not change the model: managed by your organisation')
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()
  expect(findProp(await bar.find({ key: 'tb-model:opus' }), 'backgroundColor', DARK.accent)).toBeDefined()
})

// A plugin's own /config rows, as the engine lists them, and some of the engine's.
const configRow = (key: string, kind: string, value: unknown, extra: Record<string, unknown> = {}) => ({
  key,
  label: key.split('.')[1] ?? key,
  description: `${key} setting`,
  kind,
  value,
  provider: { plugin: key.split('.')[0] },
  isLocked: false,
  ...extra,
})
const ENGINE = { provider: { plugin: 'engine' } }
const SETTING_ROWS = () => [
  configRow('demo.enabled', 'boolean', false),
  configRow('demo.style', 'choice', 'b', { options: ['a', 'b', 'c'] }),
  configRow('demo.title', 'text', 'hello'),
  configRow('demo.limit', 'number', 5),
  configRow('engine.spinner', 'boolean', true, ENGINE),
  configRow('engine.shape', 'choice', 'x', { ...ENGINE, options: ['x', 'y'] }),
  configRow('plain', 'boolean', true),
]

test("toolbox: a plugin's /config rows get a control each; the engine's are left out", async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on, { rows: SETTING_ROWS() })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-settings' })

  expect(await bar.find({ key: 'tb-set:demo.enabled' })).toBeDefined()
  expect(await bar.find({ key: 'tb-set:demo.style' })).toBeDefined()
  expect(await bar.find({ key: 'tb-set:demo.title' })).toBeDefined()
  expect(await bar.find({ key: 'tb-set:demo.limit' })).toBeDefined()
  expect(await bar.find({ key: 'tb-set:engine.spinner' })).toBeUndefined()
  expect(await bar.find({ key: 'tb-set:engine.shape' })).toBeUndefined()
  expect(await bar.find({ key: 'tb-set:plain' })).toBeUndefined()
  expect(await bar.find({ key: 'tb-set:theme' })).toBeUndefined()
  expect(await bar.find({ key: 'tb-set:model' })).toBeUndefined()
  // A boolean is an on/off button, a choice shows its value.
  expect((await bar.find({ key: 'tb-set:demo.enabled' }))?.text).toContain('Off')
  expect((await bar.find({ key: 'tb-set:demo.style' }))?.text).toContain('b ▸')
})

test('toolbox: with no plugin setting the box says so', async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on, { rows: [configRow('engine.spinner', 'boolean', true, ENGINE)] })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-settings' })
  expect(await bar.find({ type: 'Text', text: 'No mod has options yet.' })).toBeDefined()
})

test('toolbox: a boolean setting flips through config.set', async ($, on) => {
  world(on)
  registerCommands(on)
  const engine = seedModel(on, { rows: SETTING_ROWS() })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-settings' })

  await bar.press({ key: 'tb-set:demo.enabled' })
  expect(engine.configSets).toEqual([{ key: 'demo.enabled', value: true }])
  expect((await bar.find({ key: 'tb-set:demo.enabled' }))?.text).toContain('On')
  expect(await bar.find({ key: 'tb-back' })).toBeDefined()

  await bar.press({ key: 'tb-set:demo.enabled' })
  expect(engine.configSets.at(-1)).toEqual({ key: 'demo.enabled', value: false })
  expect((await bar.find({ key: 'tb-set:demo.enabled' }))?.text).toContain('Off')
})

test('toolbox: a choice setting steps to the next option, round to the first', async ($, on) => {
  world(on)
  registerCommands(on)
  const engine = seedModel(on, { rows: SETTING_ROWS() })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-settings' })

  await bar.press({ key: 'tb-set:demo.style' })
  expect(engine.configSets).toEqual([{ key: 'demo.style', value: 'c' }])
  expect((await bar.find({ key: 'tb-set:demo.style' }))?.text).toContain('c ▸')
  await bar.press({ key: 'tb-set:demo.style' })
  expect(engine.configSets.at(-1)).toEqual({ key: 'demo.style', value: 'a' })
  expect(await bar.find({ key: 'tb-back' })).toBeDefined()
})

test('toolbox: a text or number setting is an input that submits through config.set', async ($, on) => {
  world(on)
  registerCommands(on)
  const engine = seedModel(on, { rows: SETTING_ROWS() })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-settings' })

  await bar.input({ key: 'tb-set:demo.title', text: '  new title ', kind: 'submit' })
  expect(engine.configSets).toEqual([{ key: 'demo.title', value: 'new title' }])
  await bar.input({ key: 'tb-set:demo.limit', text: '12', kind: 'submit' })
  expect(engine.configSets.at(-1)).toEqual({ key: 'demo.limit', value: 12 })
  await bar.input({ key: 'tb-set:demo.limit', text: 'abc', kind: 'submit' })
  expect(engine.configSets.at(-1)).toEqual({ key: 'demo.limit', value: 0 })
})

test('toolbox: a refused setting shows a toast', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  const engine = seedModel(on, { rows: SETTING_ROWS() })
  engine.denyModel = 'locked by policy'
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-settings' })
  await bar.press({ key: 'tb-set:demo.enabled' })
  expect(seen.toasts.join(' ')).toContain('Could not change enabled: locked by policy')
})

test('toolbox: a locked setting shows its value and no control', async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on, { rows: [configRow('demo.enabled', 'boolean', true, { isLocked: true })] })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-settings' })
  expect(await bar.find({ key: 'tb-set:demo.enabled' })).toBeUndefined()
  expect(await bar.find({ type: 'Text', text: 'true (locked)' })).toBeDefined()
})

test('toolbox: an on/off mode is a toggle that runs its command', { plugins: [DEMO_MOD] }, async ($, on) => {
  const DEMO = cmd('demo', 'demo-mode', 'plugin', 'Flip the demo mode')
  const seen = world(on, {}, [DEMO, CLEAN, COMPACT])
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })

  expect((await bar.find({ key: 'tb-mode:demo' }))?.text).toContain('On')
  // A mode is a toggle, not a launcher.
  expect(await bar.find({ key: 'tb-launch:demo' })).toBeUndefined()
  expect(await bar.find({ key: 'tb-launch:clean-view' })).toBeDefined()

  await bar.press({ key: 'tb-mode:demo' })
  expect((await bar.find({ key: 'tb-mode:demo' }))?.text).toContain('Off')
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()
  await bar.press({ key: 'tb-mode:demo' })
  expect((await bar.find({ key: 'tb-mode:demo' }))?.text).toContain('On')
  expect(seen.toasts).toEqual([])
})

test("toolbox: the launchers are the mods' own commands, and one closes the box and runs", async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })

  expect(await keysOf(bar, 'tb-launch:')).toEqual(['tb-launch:clean-view', 'tb-launch:prompt-upgrade'])
  expect((await bar.find({ key: 'tb-launch:clean-view' }))?.text).toContain('Clean View')

  await bar.press({ key: 'tb-launch:clean-view' })
  expect(seen.runs).toEqual([{ command: 'clean-view', args: '' }])
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()
  expect((await bar.find({ key: 'pill' }))?.text).toContain('▲')
})

test('toolbox: a launcher whose command is gone shows a toast', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  seen.unknownCommands = true
  await bar.press({ key: 'tb-launch:prompt-upgrade' })
  expect(seen.toasts.join(' ')).toContain('/prompt-upgrade is not available')
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()
})

test('toolbox: Choose pills opens the picker pane and closes the box', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  expect((await bar.find({ key: 'tb-choose' }))?.text).toContain('Choose pills')

  await bar.press({ key: 'tb-choose' })
  expect(seen.opened).toEqual([PICKER])
  expect(seen.runs).toEqual([])
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()

  const pane = await mountPane($)
  expect(await pane.find({ key: 'pick:clean-view' })).toBeDefined()
})

test('toolbox: the box has a fixed width that follows the terminal width', async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const mountAt = (columns: number) =>
    $.ui.mount({
      plugin: 'bottom-bar',
      surface: 'terminal',
      component: 'SessionMode',
      props: BAR_PROPS,
      viewport: { columns, rows: 40 },
    } as any)
  for (const columns of [100, 50]) {
    const bar = await mountAt(columns)
    // The open box is shared state: the second mount finds it already open.
    if (!(await bar.find({ key: 'tb-choose' }))) await bar.press({ key: 'pill' })
    const box = findProp(await bar.drawn(), 'borderStyle', 'round')
    expect(box.props.width).toBe(toolboxWidth(columns))
    // Every row of the toolbox is as wide as the box inside its border and padding.
    expect(findProp(box, 'key', 'head').props.width).toBe(toolboxWidth(columns) - 4)
    expect(box.props.alignSelf).toBe('flex-end')
  }
})

test('toolboxWidth stays between 40 and 68 columns and clear of the edge', () => {
  expect(toolboxWidth(200)).toBe(68)
  expect(toolboxWidth(80)).toBe(68)
  expect(toolboxWidth(60)).toBe(56)
  expect(toolboxWidth(20)).toBe(40)
})

// ------------------------------------------------------------ toolbox-logic

test('spaced spells a name out in capitals, or falls back to plain capitals', () => {
  expect(spaced("Doole's Tools", 60)).toBe("D O O L E ' S   T O O L S")
  expect(spaced('ab', 3)).toBe('A B')
  expect(spaced('ab', 2)).toBe('AB')
  expect(spaced("Doole's Tools", 10)).toBe("DOOLE'S TOOLS")
  expect(spaced('', 5)).toBe('')
})

test('effortName capitalises a level, with xhigh as XHigh', () => {
  expect(effortName('low')).toBe('Low')
  expect(effortName('high')).toBe('High')
  expect(effortName('xhigh')).toBe('XHigh')
  expect(effortName('')).toBe('')
})

test('currentAlias finds the alias of the model in use', () => {
  const aliases = ['sonnet', 'opus', 'haiku', 'fable']
  expect(currentAlias(aliases, 'Opus 5.5')).toBe('opus')
  expect(currentAlias(aliases, 'sonnet')).toBe('sonnet')
  expect(currentAlias(aliases, 'Haiku 4.5')).toBe('haiku')
  expect(currentAlias(aliases, 'some-other-model')).toBe('')
  expect(currentAlias(aliases, '')).toBe('')
})

test("launchList keeps the mods' commands and drops the ones with an on/off mode", () => {
  const modes = { 'prompt-upgrade': { label: 'Prompt', isOn: true, plugin: 'prompt-upgrade' } }
  expect(launchList(ALL, {}).map(c => c.name)).toEqual(['clean-view', 'prompt-upgrade'])
  expect(launchList(ALL, modes).map(c => c.name)).toEqual(['clean-view'])
  expect(launchList([], modes)).toEqual([])
})

test("settingsList keeps the plugins' dotted rows of a usable kind, and not the engine's", () => {
  const rows = [
    configRow('demo.enabled', 'boolean', true),
    configRow('demo.style', 'choice', 'a', { options: ['a', 'b'] }),
    configRow('demo.title', 'text', undefined),
    configRow('demo.limit', 'number', 3),
    configRow('demo.other', 'list', 'x'),
    configRow('engine.spinner', 'boolean', true, ENGINE),
    configRow('theme', 'choice', 'dark', ENGINE),
    configRow('plain', 'boolean', true),
  ] as any[]
  const out = settingsList(rows)
  expect(out.map(s => s.key)).toEqual(['demo.enabled', 'demo.style', 'demo.title', 'demo.limit'])
  expect(out[0]).toEqual({
    key: 'demo.enabled',
    label: 'enabled',
    description: 'demo.enabled setting',
    kind: 'boolean',
    value: true,
    options: [],
    isLocked: false,
  })
  expect(out[1]!.options).toEqual(['a', 'b'])
  // A missing value reads as an empty string; a number stays a number.
  expect(out[2]!.value).toBe('')
  expect(out[3]!.value).toBe(3)
  expect(settingsList([])).toEqual([])
})

test('nextOption steps on and wraps round to the first', () => {
  expect(nextOption(['a', 'b', 'c'], 'a')).toBe('b')
  expect(nextOption(['a', 'b', 'c'], 'c')).toBe('a')
  // An unknown value starts the round at the first option.
  expect(nextOption(['a', 'b', 'c'], 'zzz')).toBe('a')
  expect(nextOption(['a'], 'a')).toBe('a')
  expect(nextOption([], 'a')).toBeUndefined()
  expect(nextOption(['1', '2'], 1)).toBe('2')
})

test('/choose-pills is registered at session start', async ($, on) => {
  world(on)
  const registered: { name: string; description?: string }[] = []
  on('command.register', (_$: any, e: any) => {
    registered.push({ name: e.name, description: e.description })
    return { value: { command: e.name } } as any
  })
  expect(registered).toEqual([])
  await startSession($)
  expect(registered.map(r => r.name)).toEqual(['choose-pills'])
  expect(registered[0]!.description).toBeTruthy()
})

test('/choose-pills opens the picker pane, with every mod listed', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  await startSession($)
  const reply = await runCommand($, 'choose-pills')
  expect(seen.opened).toEqual([PICKER])
  // The mod answers it itself; nothing underneath ran.
  expect(seen.ran).toEqual([])
  expect(reply).toEqual({})

  const pane = await mountPane($)
  expect(await pane.find({ key: 'pick:clean-view' })).toBeDefined()
  expect(await pane.find({ key: 'pick:prompt-upgrade' })).toBeDefined()
  expect(await pane.find({ key: 'done' })).toBeDefined()
})

test('/choose-pills closes an open box on the bar', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()
  await runCommand($, 'choose-pills')
  expect(seen.opened).toEqual([PICKER])
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()
})

// A mod that publishes an on/off mode once, at session start; its command's reply is the only
// sign of a later flip (it does not republish the mode).
const QUIET_MOD = {
  name: 'quiet-mode',
  register: ((on: any) => {
    on('session.start', async ($: any, e: any, next: any) => {
      const ran = await next(e)
      await $.state.set({ plugin: 'quiet-mode', key: 'modes' }, { quiet: { label: 'Quiet Mode', isOn: true } })
      return ran
    })
    on('command.run', { command: 'quiet' }, async () => ({ text: 'Quiet is off.' }))
  }) as any,
}
const QUIET = cmd('quiet', 'quiet-mode', 'plugin', 'Flip the quiet mode')

test(
  "a mode command run by someone else updates the mode's state from its reply",
  { plugins: [QUIET_MOD] },
  async ($, on) => {
    // Not a chosen pill: only the mode state marks the command.
    world(on, {}, [QUIET, COMPACT])
    registerCommands(on)
    await startSession($)
    await runCommand($, 'choose-pills')
    const pane = await mountPane($)
    expect((await pane.find({ key: 'pick:quiet' }))?.text).toContain('now on')

    await runCommand($, 'quiet')
    expect((await pane.find({ key: 'pick:quiet' }))?.text).toContain('Quiet Mode on/off button, now off')
  },
)

test('a chosen mode pill follows a reply from a command someone else ran', { plugins: [QUIET_MOD] }, async ($, on) => {
  world(on, { tools: ['quiet'] }, [QUIET, COMPACT])
  registerCommands(on)
  await startSession($)
  const bar = await mountBar($)
  expect((await bar.find({ key: 'tool:quiet' }))?.text).toContain('● Quiet Mode')

  await runCommand($, 'quiet')
  expect((await bar.find({ key: 'tool:quiet' }))?.text).toContain('○ Quiet Mode')
})

test('a command that is no mode and no pill leaves the mode pills alone', { plugins: [QUIET_MOD] }, async ($, on) => {
  const seen = world(on, { tools: ['quiet'] }, [QUIET, COMPACT])
  registerCommands(on)
  await startSession($)
  const bar = await mountBar($)

  // The world's catch-all replies "ran compact": no state in it, and compact is no mode.
  await runCommand($, 'compact')
  expect(seen.ran).toContain('compact')
  expect((await bar.find({ key: 'tool:quiet' }))?.text).toContain('● Quiet Mode')
})

// ------------------------------------------------- settings page, colour, mods

const openSettings = async (bar: any) => {
  await bar.press({ key: 'pill' })
  await bar.press({ key: 'tb-settings' })
}

test('settings page: the gear opens it, Back returns home, the cross closes the box', async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  expect(await bar.find({ key: 'tb-settings' })).toBeDefined()
  expect(await bar.find({ key: 'tb-close' })).toBeDefined()
  expect(await bar.find({ key: 'tb-back' })).toBeUndefined()

  await bar.press({ key: 'tb-settings' })
  expect(await bar.find({ type: 'Text', text: '◆ S E T T I N G S' })).toBeDefined()
  expect(await bar.find({ key: 'tb-back' })).toBeDefined()
  expect(await bar.find({ key: 'tb-name' })).toBeDefined()
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()
  expect(await bar.find({ key: 'tb-model:opus' })).toBeUndefined()

  await bar.press({ key: 'tb-back' })
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()
  expect(await bar.find({ key: 'tb-back' })).toBeUndefined()

  await bar.press({ key: 'tb-settings' })
  await bar.press({ key: 'tb-close' })
  expect(await bar.find({ key: 'tb-back' })).toBeUndefined()
  expect(await bar.find({ key: 'tb-choose' })).toBeUndefined()
  expect((await bar.find({ key: 'pill' }))?.text).toContain('▲')

  // Opening the box again starts on the home page.
  await bar.press({ key: 'pill' })
  expect(await bar.find({ key: 'tb-choose' })).toBeDefined()
})

test("settings page: the bar's own options are left out of the mod options", async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on, { rows: [configRow('bottom-bar.name', 'text', 'x'), configRow('demo.enabled', 'boolean', true)] })
  await startSession($)
  const bar = await mountBar($)
  await openSettings(bar)
  expect(await bar.find({ key: 'tb-set:bottom-bar.name' })).toBeUndefined()
  expect(await bar.find({ key: 'tb-set:demo.enabled' })).toBeDefined()
})

test('settings page: a colour chip sets bottom-bar.colour', async ($, on) => {
  world(on)
  registerCommands(on)
  const engine = seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await openSettings(bar)
  expect(await keysOf(bar, 'tb-colour:')).toEqual([
    'tb-colour:Coral',
    'tb-colour:Amber',
    'tb-colour:Sage',
    'tb-colour:Sky',
    'tb-colour:Lilac',
    'tb-colour:Rose',
  ])
  await bar.press({ key: 'tb-colour:Lilac' })
  expect(engine.configSets).toEqual([{ key: 'bottom-bar.colour', value: 'Lilac' }])
})

test('the colour option recolours the filled model chip', { options: { colour: 'Sky' } }, async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  const chip = await bar.find({ key: 'tb-model:opus' })
  expect(findProp(chip, 'backgroundColor', ACCENTS.Sky![0])).toBeDefined()
  expect(findProp(chip, 'backgroundColor', DARK.accent)).toBeUndefined()
})

test('paletteFor swaps the accent for a colour, keeping Coral and unknown names as they are', () => {
  expect(paletteFor('dark', 'Sky')).toEqual({ ...DARK, accent: ACCENTS.Sky![0] })
  expect(paletteFor('light', 'Sky')).toEqual({ ...LIGHT, accent: ACCENTS.Sky![1] })
  expect(paletteFor('light-daltonized', 'Rose').accent).toBe(ACCENTS.Rose![1])
  expect(paletteFor('dark', 'Coral')).toBe(DARK)
  expect(paletteFor('light', 'Coral')).toBe(LIGHT)
  expect(paletteFor('dark', 'Nope')).toBe(DARK)
  expect(paletteFor('dark', undefined)).toBe(DARK)
})

test('settings page: the name input sets bottom-bar.name, trimmed, and blank is ignored', async ($, on) => {
  world(on)
  registerCommands(on)
  const engine = seedModel(on)
  await startSession($)
  const bar = await mountBar($)
  await openSettings(bar)

  await bar.input({ key: 'tb-name', text: '   ', kind: 'submit' })
  expect(engine.configSets).toEqual([])
  expect((await bar.find({ key: 'pill' }))?.text).toContain("Doole's Tools")

  await bar.input({ key: 'tb-name', text: '  Mine  ', kind: 'submit' })
  expect(engine.configSets).toEqual([{ key: 'bottom-bar.name', value: 'Mine' }])
  expect((await bar.find({ key: 'pill' }))?.text).toContain('Mine')
})

// A fake `claude plugin list --json` and the files beneath each install.
const plugin = (id: string, enabled: boolean, extra: Record<string, unknown> = {}) => ({
  id,
  scope: 'user',
  enabled,
  installPath: `/p/${id.split('@')[0]}`,
  ...extra,
})
const PLUGIN_LIST = [
  plugin('demo@mk', true),
  plugin('plain@mk', true),
  plugin('bottom-bar@mk', true),
  plugin('off@mk', false),
  plugin('elsewhere@mk', true, { scope: 'project', projectPath: '/other' }),
]
const MOD_FILES: Record<string, string> = {
  '/p/demo/hooks/hooks.json': JSON.stringify({ modules: ['hooks/index.ts'] }),
  '/p/demo/.claude-plugin/plugin.json': JSON.stringify({ description: 'Demo mod' }),
  '/p/plain/hooks/hooks.json': JSON.stringify({ hooks: {} }),
  '/p/bottom-bar/hooks/hooks.json': JSON.stringify({ modules: ['hooks/index.ts'] }),
  '/p/off/hooks/hooks.json': JSON.stringify({ modules: ['hooks/index.ts'] }),
  '/p/off/.claude-plugin/plugin.json': JSON.stringify({ description: 'Off mod' }),
  '/p/elsewhere/hooks/hooks.json': JSON.stringify({ modules: ['hooks/index.ts'] }),
}

// Answers the engine calls the mods list is built from, and the enable/disable the rows run.
function modsWorld(on: any, opts: { list?: unknown[]; files?: Record<string, string>; fail?: boolean } = {}) {
  const seen = { argvs: [] as string[][] }
  const done = { isStdoutTruncated: false, isStderrTruncated: false }
  on('session.root', () => ({ value: '/work' }))
  on('process.run', (_$: any, e: any) => {
    seen.argvs.push([...e.argv])
    const isList = e.argv[2] === 'list'
    if (!isList && opts.fail) return { value: { exitCode: 1, stdout: '', stderr: 'boom\nmore', ...done } }
    return { value: { exitCode: 0, stdout: isList ? JSON.stringify(opts.list ?? PLUGIN_LIST) : '', stderr: '', ...done } }
  })
  on('fs.read', (_$: any, e: any) => {
    // The engine resolves a rooted path against the drive on Windows; match on the tail.
    const path = String(e.path).replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
    const text = (opts.files ?? MOD_FILES)[path]
    if (text === undefined) throw new Error(`no such file: ${e.path}`)
    return { value: text }
  })
  return seen
}

test('toolbox: the mods list shows installed mods only, with an on/off toggle each', async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on)
  const seen = modsWorld(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })

  expect(seen.argvs[0]).toEqual(['claude', 'plugin', 'list', '--json'])
  expect(await keysOf(bar, 'tb-mod:')).toEqual(['tb-mod:demo@mk', 'tb-mod:off@mk'])
  expect(await bar.find({ type: 'Text', text: 'MODS' })).toBeDefined()
  expect(await bar.find({ type: 'Text', text: 'No mods installed.' })).toBeUndefined()
  expect((await bar.find({ key: 'tb-mod:demo@mk' }))?.text).toContain('On')
  expect((await bar.find({ key: 'tb-mod:off@mk' }))?.text).toContain('Off')
})

test('toolbox: with no mod installed the list says so', async ($, on) => {
  world(on)
  registerCommands(on)
  seedModel(on)
  modsWorld(on, { list: [plugin('plain@mk', true)] })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })
  expect(await bar.find({ type: 'Text', text: 'No mods installed.' })).toBeDefined()
  expect(await keysOf(bar, 'tb-mod:')).toEqual([])
})

test('toolbox: pressing a disabled mod enables it, then reloads plugins', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  seedModel(on)
  const proc = modsWorld(on)
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })

  await bar.press({ key: 'tb-mod:off@mk' })
  expect(proc.argvs.at(-1)).toEqual(['claude', 'plugin', 'enable', 'off@mk', '--scope', 'user'])
  expect(seen.runs).toEqual([{ command: 'reload-plugins', args: '' }])
  expect(seen.toasts).toEqual([])
  expect((await bar.find({ key: 'tb-mod:off@mk' }))?.text).toContain('On')

  await bar.press({ key: 'tb-mod:off@mk' })
  expect(proc.argvs.at(-1)).toEqual(['claude', 'plugin', 'disable', 'off@mk', '--scope', 'user'])
})

test('toolbox: a failing enable shows a toast and does not reload', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  seedModel(on)
  modsWorld(on, { fail: true })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })

  await bar.press({ key: 'tb-mod:off@mk' })
  expect(seen.toasts.join(' ')).toContain('Could not enable Off: boom')
  expect(seen.runs).toEqual([])
  expect((await bar.find({ key: 'tb-mod:off@mk' }))?.text).toContain('Off')
})

test('toolbox: a mod with a published mode is a tb-mode toggle in the MODS list', { plugins: [DEMO_MOD] }, async ($, on) => {
  world(on, {}, [cmd('demo', 'demo-mode', 'plugin', 'Flip the demo mode'), COMPACT])
  registerCommands(on)
  seedModel(on)
  modsWorld(on, {
    list: [plugin('demo-mode@mk', true)],
    files: {
      '/p/demo-mode/hooks/hooks.json': JSON.stringify({ modules: ['hooks/index.ts'] }),
      '/p/demo-mode/.claude-plugin/plugin.json': JSON.stringify({ description: 'Flips a demo mode' }),
    },
  })
  await startSession($)
  const bar = await mountBar($)
  await bar.press({ key: 'pill' })

  expect(await keysOf(bar, 'tb-mode:')).toEqual(['tb-mode:demo'])
  expect(await keysOf(bar, 'tb-mod:')).toEqual([])
  expect((await bar.find({ key: 'tb-mode:demo' }))?.text).toContain('On')
})

// ------------------------------------------------------ pickInstalls, modLines

test('pickInstalls: the user install wins, other projects are dropped, paths match loosely', () => {
  const user = { id: 'a@mk', scope: 'user', enabled: true, installPath: '/u/a' }
  const mine = { id: 'a@mk', scope: 'project', enabled: false, installPath: '/m/a', projectPath: '/work' }
  const theirs = { id: 'b@mk', scope: 'project', enabled: true, installPath: '/t/b', projectPath: '/other' }

  expect(pickInstalls([mine, user], '/work')).toEqual([user])
  expect(pickInstalls([user, mine], '/work')).toEqual([user])
  expect(pickInstalls([theirs], '/work')).toEqual([])
  expect(pickInstalls([{ ...theirs, projectPath: undefined }], '/work')).toEqual([])
  expect(pickInstalls([mine], '/work')).toEqual([mine])
  expect(pickInstalls([], '/work')).toEqual([])

  // Windows paths: case, slash direction and a trailing slash do not matter.
  const win = { id: 'w@mk', scope: 'local', enabled: true, installPath: 'C:\\p\\w', projectPath: 'C:\\Users\\Me\\Proj' }
  expect(pickInstalls([win], 'c:/users/me/proj/')).toEqual([win])
  expect(pickInstalls([win], 'C:/Users/Me/Other')).toEqual([])
})

test('modLines: a running mode becomes a tb-mode row, other mods a tb-mod row, orphan modes follow', () => {
  const mod = (name: string, isEnabled: boolean) => ({
    id: `${name}@mk`,
    name,
    label: toolLabel(name),
    description: `${name} mod`,
    scope: 'user',
    isEnabled,
  })
  const modes = {
    demo: { label: 'Demo Mode', isOn: false, plugin: 'demo-mode' },
    stray: { label: 'Stray', isOn: true, plugin: 'stray-mod' },
  }
  const out = modLines([mod('demo-mode', true), mod('plain', false)], modes)
  expect(out.map(l => l.key)).toEqual(['tb-mode:demo', 'tb-mod:plain@mk', 'tb-mode:stray'])
  expect(out[0]).toMatchObject({ label: 'Demo Mode', about: 'demo-mode mod', isOn: false, command: 'demo' })
  expect(out[1]).toMatchObject({ label: 'Plain', isOn: false })
  expect(out[1]!.mod?.id).toBe('plain@mk')
  expect(out[2]).toMatchObject({ about: '', isOn: true, command: 'stray' })

  // A disabled mod keeps its plugin row even when its mode is still published.
  expect(modLines([mod('demo-mode', false)], { demo: modes.demo }).map(l => l.key)).toEqual([
    'tb-mod:demo-mode@mk',
    'tb-mode:demo',
  ])
  expect(modLines([], {})).toEqual([])
})

// ------------------------------------------------------------------ fullscreen

test('toolbox: in fullscreen the pill opens a docked pane; the main screen keeps the box in the bar', async ($, on) => {
  const seen = world(on)
  registerCommands(on)
  seedModel(on)
  await startSession($)
  const mountAt = (isFullscreen: boolean) =>
    $.ui.mount({
      plugin: 'bottom-bar',
      surface: 'terminal',
      component: 'SessionMode',
      props: BAR_PROPS,
      viewport: { columns: 120, rows: 40, isFullscreen },
    } as any)

  const full = await mountAt(true)
  await full.press({ key: 'pill' })
  expect(seen.opened).toContain(TOOLBOX)
  expect(await full.find({ key: 'tb-choose' })).toBeUndefined()

  const pane = await $.ui.mount({
    plugin: 'bottom-bar',
    surface: 'terminal',
    component: 'Pane',
    requestId: TOOLBOX,
    props: PANE_PROPS,
  })
  expect(await pane.find({ key: 'tb-choose' })).toBeDefined()

  await full.press({ key: 'pill' })
  expect(seen.closed).toContain(TOOLBOX)

  const before = seen.opened.length
  const main = await mountAt(false)
  await main.press({ key: 'pill' })
  expect(seen.opened.length).toBe(before)
  expect(await main.find({ key: 'tb-choose' })).toBeDefined()
})

import { expect, mock, test } from 'claude-code/testing'

import { DARK, mergeSegments, publishedSegments, segmentCommand, splitCommand } from '../hooks/bar-logic'

// ---------------------------------------------------------------- pure logic

test('mergeSegments keeps a mod\'s valid entries and leaves out malformed ones', () => {
  const merged = mergeSegments({}, 'alpha', {
    one: { label: 'Alpha', detail: 'ready', command: '/alpha run', state: 'done', actions: [{ label: 'Undo', command: 'alpha undo' }, { label: '', command: 'x' }] },
    noCommand: { label: 'No' },
    badCommand: { label: 'Bad', command: 'rm -rf /\nnext' },
    noLabel: { command: 'alpha' },
    oddState: { label: 'Odd', command: 'alpha', state: 'sleeping' },
  })
  expect(Object.keys(merged)).toEqual(['alpha:one', 'alpha:oddState'])
  expect(merged['alpha:one']).toEqual({
    plugin: 'alpha',
    id: 'one',
    label: 'Alpha',
    detail: 'ready',
    command: 'alpha run',
    state: 'done',
    actions: [{ label: 'Undo', command: 'alpha undo' }],
  })
  expect(merged['alpha:oddState']!.state).toBe('idle')
})

test('a republish replaces only that mod\'s segments, and order is by mod then by its own order', () => {
  let all = mergeSegments({}, 'zeta', { z: { label: 'Zeta', command: 'zeta' } })
  all = mergeSegments(all, 'alpha', { second: { label: 'A2', command: 'a' }, first: { label: 'A1', command: 'a' } })
  expect(Object.keys(all)).toEqual(['alpha:second', 'alpha:first', 'zeta:z'])
  all = mergeSegments(all, 'zeta', { z: { label: 'Zeta busy', command: 'zeta', state: 'working' } })
  expect(Object.keys(all)).toEqual(['alpha:second', 'alpha:first', 'zeta:z'])
  expect(all['zeta:z']!.label).toBe('Zeta busy')
  all = mergeSegments(all, 'alpha', null)
  expect(Object.keys(all)).toEqual(['zeta:z'])
})

test('a mod gets four segments and three actions at most', () => {
  const many = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`s${i}`, { label: `S${i}`, command: 'x', actions: Array.from({ length: 5 }, () => ({ label: 'Go', command: 'x' })) }]))
  const all = mergeSegments({}, 'busy', many)
  expect(Object.keys(all)).toHaveLength(4)
  expect(all['busy:s0']!.actions).toHaveLength(3)
})

test('commands are a name and optional arguments, without the slash', () => {
  expect(segmentCommand('/enhance-prompt')).toBe('enhance-prompt')
  expect(segmentCommand('enhance-prompt undo')).toBe('enhance-prompt undo')
  expect(segmentCommand('two\nlines')).toBeUndefined()
  expect(segmentCommand('')).toBeUndefined()
  expect(segmentCommand(3)).toBeUndefined()
  expect(splitCommand('enhance-prompt undo')).toEqual({ command: 'enhance-prompt', args: 'undo' })
  expect(splitCommand('demo')).toEqual({ command: 'demo', args: '' })
})

test('published segments are keyed by mod and id, with their detail and actions', () => {
  const all = mergeSegments({}, 'pe', { enhance: { label: 'Enhance Prompt', detail: 'Hindsight 6 · CodeGraph 3', command: 'enhance-prompt', actions: [{ label: 'Undo', command: 'enhance-prompt undo' }] } })
  const [seg] = publishedSegments(all, DARK)
  expect(seg!.key).toBe('seg:pe:enhance')
  expect(seg!.parts.map(p => p.text).join('')).toBe('Enhance Prompt · Hindsight 6 · CodeGraph 3')
  expect(seg!.actions).toEqual([{ key: 'seg:pe:enhance:0', label: 'Undo', command: 'enhance-prompt undo' }])
})

// ---------------------------------------------------------------- in the bar

const draw = (...args: any[]) => (globalThis as any).h(...args)
const mountBar = ($: any, viewport?: { columns: number; rows: number }) =>
  $.ui.mount({ plugin: 'bottom-bar', surface: 'terminal', component: 'SessionMode', props: { modes: [] }, ...(viewport ? { viewport } : {}) })
const startSession = ($: any) => $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

// What sits beneath the bar: store, clock, commands, toasts and a recorder of the commands it runs.
function world(on: any) {
  const seen = { runs: [] as { command: string; args: string }[], toasts: [] as string[] }
  mock.store(on, {})
  mock.clock(on)
  on('command.list', () => ({ value: [] }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('ui.toast', (_$: any, e: any) => (seen.toasts.push(e.text), { value: undefined }))
  on('command.run', (_$: any, e: any) => (seen.runs.push({ command: e.command, args: e.args }), { text: `ran ${e.command}` }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  return seen
}

// A stand-in publisher: a segment at session start; `/pub` republishes it as done, `/pub undo` clears it.
const PUB_MOD = {
  name: 'pub-mod',
  register: ((on: any) => {
    const idle = { main: { label: 'Enhance Prompt', command: 'pub', state: 'idle' } }
    const done = { main: { label: 'Enhance Prompt', detail: 'Hindsight 6 · CodeGraph 3', command: 'pub', state: 'done', actions: [{ label: 'Undo', command: 'pub undo' }] } }
    on('session.start', async ($: any, e: any, next: any) => {
      const ran = await next(e)
      await $.state.set({ plugin: 'pub-mod', key: 'segments' }, idle)
      return ran
    })
    on('command.run', { command: 'pub' }, async ($: any, e: any) => {
      await $.state.set({ plugin: 'pub-mod', key: 'segments' }, e.args === 'undo' ? idle : done)
      return {}
    })
  }) as any,
}

test('with no publishers the bar draws as before, with its marker and no extra segment', async ($, on) => {
  world(on)
  await startSession($)
  const bar = await mountBar($, { columns: 160, rows: 40 })
  expect(await bar.find({ type: 'Text', text: '0 agents' })).toBeDefined()
  expect(await bar.find({ key: 'pill' })).toBeDefined()
  expect(await bar.find({ key: 'bottom-bar-segments' })).toBeDefined()
  expect(await bar.find({ key: 'seg:pub-mod:main' })).toBeUndefined()
})

test('a published segment shows after agents, and pressing it and its action runs the commands', { plugins: [PUB_MOD] }, async ($, on) => {
  world(on)
  await startSession($)
  const bar = await mountBar($, { columns: 200, rows: 40 })
  const seg = await bar.find({ key: 'seg:pub-mod:main' })
  expect(seg?.text).toBe('Enhance Prompt')

  // The publisher's own command republishes under the bar's call; the bar picks it up when the call returns.
  await bar.press({ key: 'seg:pub-mod:main' })
  expect((await bar.find({ key: 'seg:pub-mod:main' }))?.text).toBe('Enhance Prompt · Hindsight 6 · CodeGraph 3')
  expect((await bar.find({ key: 'seg:pub-mod:main:0' }))?.text).toBe('Undo')

  await bar.press({ key: 'seg:pub-mod:main:0' })
  expect((await bar.find({ key: 'seg:pub-mod:main' }))?.text).toBe('Enhance Prompt')
  expect(await bar.find({ key: 'seg:pub-mod:main:0' })).toBeUndefined()
})

// A publisher whose command is served by nobody in the test but the engine stand-in.
const OTHER_MOD = {
  name: 'other-mod',
  register: ((on: any) => {
    on('session.start', async ($: any, e: any, next: any) => {
      const ran = await next(e)
      await $.state.set({ plugin: 'other-mod', key: 'segments' }, { go: { label: 'Go', command: '/other go fast' } })
      return ran
    })
  }) as any,
}

test('a published segment runs a command with arguments through the engine', { plugins: [OTHER_MOD] }, async ($, on) => {
  const seen = world(on)
  await startSession($)
  const bar = await mountBar($, { columns: 200, rows: 40 })
  await bar.press({ key: 'seg:other-mod:go' })
  expect(seen.runs.at(-1)).toEqual({ command: 'other', args: 'go fast' })
})

test("published segments sit in their own box, which gives way before the bar's segments and the pills", { plugins: [PUB_MOD] }, async ($, on) => {
  world(on)
  await startSession($)
  const bar = await mountBar($, { columns: 70, rows: 30 })
  const shared = await bar.find({ key: 'bottom-bar-published' })
  const own = await bar.find({ key: 'bottom-bar-segments' })
  expect((shared as any)?.props?.flexShrink).toBe(100)
  expect((shared as any)?.props?.overflow).toBe('hidden')
  expect((own as any)?.props?.flexShrink).toBe(1)
  expect(await bar.find({ key: 'pill' })).toBeDefined()
})

test('in the app the bar hosts a published segment as the first Button, before the figures, and pressing it runs it', { plugins: [PUB_MOD] }, async ($, on) => {
  world(on)
  await startSession($)
  const bar = await $.ui.mount({ plugin: 'bottom-bar', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10 } as any })
  expect(await bar.find({ key: 'bottom-bar-segments' })).toBeDefined()
  expect((await bar.find({ key: 'seg:pub-mod:main' }))?.text).toBe('Enhance Prompt')
  const keys = JSON.stringify(await bar.drawn())
  expect(keys.indexOf('seg:pub-mod:main')).toBeLessThan(keys.indexOf('"ctx"'))
  expect(keys.indexOf('"ctx"')).toBeLessThan(keys.indexOf('"pill"'))

  await bar.press({ key: 'seg:pub-mod:main' })
  expect(await bar.find({ type: 'Text', text: 'Hindsight 6 · CodeGraph 3' })).toBeDefined()
  expect((await bar.find({ key: 'seg:pub-mod:main:0' }))?.text).toBe('Undo')
})

import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'idea-shelf'
const PANE = {
  plugin: PLUGIN,
  component: 'Pane',
  requestId: 'ideas',
  props: {
    title: 'Idea shelf',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

let backing = new Map<string, unknown>()

type Sent = { text: string; asUser: boolean; plugin: string | null }

/** Beneath-the-plugin fixtures: the session folder, a record of submitted prompts and of registered commands. */
function setup(on: On, folder = '/work/proj') {
  const world = {
    folder,
    sent: [] as Sent[],
    drop: null as string | null,
    registered: [] as { name: string; immediate?: boolean }[],
    opened: [] as string[],
    isPlaced: true,
  }
  backing = new Map()
  mock.clock(on, { now: 1_000_000 })
  on('store.get', (_$, e) => ({ value: backing.get(e.key) }))
  on('store.set', (_$, e) => {
    backing.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: world.folder }))
  on('session.cwd', () => ({ value: world.folder }))
  on('prompt.submit', (_$, e) => {
    if (world.drop !== null) return { drop: world.drop }
    world.sent.push({
      text: e.text,
      asUser: (e.origin as { asUser?: boolean }).asUser === true,
      plugin: e.origin.kind === 'plugin' ? e.origin.name : null,
    })
    return { text: e.text }
  })
  on('ui.open', (_$, e) => {
    world.opened.push(e.id)
    return { value: world.isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'too narrow' } }
  })
  on('command.register', (_$, e) => {
    world.registered.push({ name: e.name, immediate: e.immediate })
    return { value: { command: e.name } }
  })
  return world
}

function run($: Engine, command: string, args: string) {
  return $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
}

async function storedTexts($: Engine, key: string): Promise<string[]> {
  const shelf = (await readStore($, key)) as { text: string }[] | undefined
  return (shelf ?? []).map(i => i.text)
}

async function readStore(_$: Engine, key: string): Promise<unknown> {
  return backing.get(key)
}

describe('commands', () => {
  test('session start registers /idea as immediate and /ideas', async ($, on) => {
    const world = setup(on)
    await $.session.start({ cwd: world.folder, surface: 'desktop', isInteractive: true })
    const idea = world.registered.find(c => c.name === 'idea')
    expect(idea?.immediate).toBe(true)
    expect(world.registered.some(c => c.name === 'ideas')).toBe(true)
  })

  test('/idea parks an idea, answers by itself and never submits a prompt', async ($, on) => {
    const world = setup(on)
    const first = await run($, 'idea', 'try a dark theme')
    expect(first.text).toContain('Idea 1 parked')
    expect(first.text).not.toContain('dark theme')
    expect(first.context).toBeUndefined()
    const second = await run($, 'idea', 'cache the lookups')
    expect(second.text).toContain('Idea 2 parked')
    expect(world.sent).toHaveLength(0)
    expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['try a dark theme', 'cache the lookups'])
  })

  test('/idea with nothing shows usage and the count', async ($, on) => {
    setup(on)
    const out = await run($, 'idea', '')
    expect(out.text).toContain('Usage')
    expect(out.text).toContain('0 ideas')
  })

  test('/idea edit replaces idea n and keeps its place', async ($, on) => {
    setup(on)
    await run($, 'idea', 'one')
    await run($, 'idea', 'two')
    await run($, 'idea', 'three')
    const before = (await readStore($, 'shelf:/work/proj')) as { id: string }[]
    const out = await run($, 'idea', 'edit 2 two, rewritten')
    expect(out.text).toBe('Idea 2 updated.')
    expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['one', 'two, rewritten', 'three'])
    const after = (await readStore($, 'shelf:/work/proj')) as { id: string }[]
    expect(after.map(i => i.id)).toEqual(before.map(i => i.id))
  })

  test('/idea edit with a number outside the shelf changes nothing', async ($, on) => {
    setup(on)
    await run($, 'idea', 'only')
    const out = await run($, 'idea', 'edit 5 nope')
    expect(out.text).toContain('There is no idea 5')
    expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['only'])
  })

  test('an idea over 2000 characters is refused with a plain message and not saved', async ($, on) => {
    setup(on)
    const out = await run($, 'idea', 'x'.repeat(2001))
    expect(out.text).toContain('limit is 2000')
    expect(await storedTexts($, 'shelf:/work/proj')).toEqual([])
    await run($, 'idea', 'short')
    const edit = await run($, 'idea', `edit 1 ${'y'.repeat(2001)}`)
    expect(edit.text).toContain('limit is 2000')
    expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['short'])
    const exact = await run($, 'idea', 'z'.repeat(2000))
    expect(exact.text).toContain('Idea 2 parked')
  })

  test('shelves are per folder, case-insensitive, and a subfolder is its own shelf', async ($, on) => {
    const world = setup(on, 'C:\\Work\\Proj')
    await run($, 'idea', 'in the project')
    world.folder = 'c:/work/proj/'
    await run($, 'idea', 'same shelf, other spelling')
    world.folder = 'C:\\Work\\Proj\\sub'
    await run($, 'idea', 'in the subfolder')
    world.folder = '/elsewhere'
    const empty = await run($, 'idea', '')
    expect(empty.text).toContain('0 ideas')
    expect(await storedTexts($, 'shelf:c:/work/proj')).toEqual(['in the project', 'same shelf, other spelling'])
    expect(await storedTexts($, 'shelf:c:/work/proj/sub')).toEqual(['in the subfolder'])
  })

  test('/ideas opens the pane', async ($, on) => {
    const world = setup(on)
    await run($, 'idea', 'one')
    const out = await run($, 'ideas', '')
    expect(world.opened).toEqual(['ideas'])
    expect(out.text).toContain('1 idea')
  })

  test('/ideas lists the ideas as text when the pane cannot be placed', async ($, on) => {
    const world = setup(on)
    world.isPlaced = false
    await run($, 'idea', 'one')
    await run($, 'idea', 'two')
    const out = await run($, 'ideas', '')
    expect(out.text).toContain('1. one')
    expect(out.text).toContain('2. two')
  })
})

describe('pane', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: lists ideas with Send, Edit and Delete`, async ($, on) => {
      setup(on)
      await run($, 'idea', 'alpha')
      await run($, 'idea', 'beta')
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: '1. alpha' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '2. beta' })).toBeDefined()
      expect(await ui.findAll({ type: 'Button', text: 'Send' })).toHaveLength(2)
      expect(await ui.findAll({ type: 'Button', text: 'Edit' })).toHaveLength(2)
      expect(await ui.findAll({ type: 'Button', text: 'Delete' })).toHaveLength(2)
      await ui.unmount()
    })

    test(`${surface}: an empty shelf says so`, async ($, on) => {
      setup(on)
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /No ideas parked yet/ })).toBeDefined()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      await ui.unmount()
    })

    test(`${surface}: Send submits the idea as the user's prompt and removes it`, async ($, on) => {
      const world = setup(on)
      await run($, 'idea', 'alpha')
      await run($, 'idea', 'beta')
      const ids = ((await readStore($, 'shelf:/work/proj')) as { id: string }[]).map(i => i.id)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: `send:${ids[0]}` })
      expect(world.sent).toEqual([{ text: 'alpha', asUser: true, plugin: PLUGIN }])
      expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['beta'])
      expect(await ui.find({ type: 'Text', text: '1. beta' })).toBeDefined()
      expect(await ui.find({ key: `send:${ids[0]}` })).toBeUndefined()
      await ui.unmount()
    })

    test(`${surface}: a refused prompt keeps the idea on the shelf`, async ($, on) => {
      const world = setup(on)
      world.drop = 'blocked by another plugin'
      await run($, 'idea', 'alpha')
      const ids = ((await readStore($, 'shelf:/work/proj')) as { id: string }[]).map(i => i.id)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: `send:${ids[0]}` })
      expect(world.sent).toHaveLength(0)
      expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['alpha'])
      expect(await ui.find({ key: `send:${ids[0]}` })).toBeDefined()
      await ui.unmount()
    })

    test(`${surface}: Delete removes the idea`, async ($, on) => {
      const world = setup(on)
      await run($, 'idea', 'alpha')
      await run($, 'idea', 'beta')
      const ids = ((await readStore($, 'shelf:/work/proj')) as { id: string }[]).map(i => i.id)
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: `delete:${ids[0]}` })
      expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['beta'])
      expect(world.sent).toHaveLength(0)
      await ui.unmount()
    })

    test(`${surface}: Edit opens a field; Enter saves in place`, async ($, on) => {
      setup(on)
      await run($, 'idea', 'alpha')
      await run($, 'idea', 'beta')
      const before = (await readStore($, 'shelf:/work/proj')) as { id: string }[]
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: `edit:${before[0]?.id}` })
      const field = await ui.find({ type: 'Input', key: 'edit-input' })
      expect(field?.props.value).toBe('alpha')
      expect(await ui.find({ key: 'save' })).toBeDefined()
      expect(await ui.find({ key: 'cancel' })).toBeDefined()
      await ui.input({ key: 'edit-input', text: 'alpha, improved' })
      expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['alpha, improved', 'beta'])
      const after = (await readStore($, 'shelf:/work/proj')) as { id: string }[]
      expect(after[0]?.id).toBe(before[0]?.id)
      expect(await ui.find({ key: 'edit-input' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: '1. alpha, improved' })).toBeDefined()
      await ui.unmount()
    })

    test(`${surface}: Save button saves what was typed`, async ($, on) => {
      setup(on)
      await run($, 'idea', 'alpha')
      const id = ((await readStore($, 'shelf:/work/proj')) as { id: string }[])[0]?.id
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: `edit:${id}` })
      await ui.input({ key: 'edit-input', text: 'typed but not entered', kind: 'change' })
      await ui.press({ key: 'save' })
      expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['typed but not entered'])
      await ui.unmount()
    })

    test(`${surface}: an empty edit is refused and the field stays open`, async ($, on) => {
      setup(on)
      await run($, 'idea', 'alpha')
      const id = ((await readStore($, 'shelf:/work/proj')) as { id: string }[])[0]?.id
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: `edit:${id}` })
      await ui.input({ key: 'edit-input', text: '   ' })
      expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['alpha'])
      expect(await ui.find({ type: 'Text', text: 'An idea cannot be empty.' })).toBeDefined()
      expect(await ui.find({ key: 'edit-input' })).toBeDefined()
      await ui.unmount()
    })

    test(`${surface}: an edit over 2000 characters is refused`, async ($, on) => {
      setup(on)
      await run($, 'idea', 'alpha')
      const id = ((await readStore($, 'shelf:/work/proj')) as { id: string }[])[0]?.id
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: `edit:${id}` })
      await ui.input({ key: 'edit-input', text: 'q'.repeat(2001) })
      expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['alpha'])
      expect(await ui.find({ type: 'Text', text: /limit is 2000/ })).toBeDefined()
      await ui.unmount()
    })

    test(`${surface}: Cancel leaves the idea as it was`, async ($, on) => {
      setup(on)
      await run($, 'idea', 'alpha')
      const id = ((await readStore($, 'shelf:/work/proj')) as { id: string }[])[0]?.id
      const ui = await $.ui.mount({ ...PANE, surface })
      await ui.press({ key: `edit:${id}` })
      await ui.input({ key: 'edit-input', text: 'half typed', kind: 'change' })
      await ui.press({ key: 'cancel' })
      expect(await storedTexts($, 'shelf:/work/proj')).toEqual(['alpha'])
      expect(await ui.find({ key: 'edit-input' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: '1. alpha' })).toBeDefined()
      await ui.unmount()
    })
  }

  test('mobile: Edit is replaced by a note; Send and Delete stay', async ($, on) => {
    const world = setup(on)
    await run($, 'idea', 'alpha')
    const id = ((await readStore($, 'shelf:/work/proj')) as { id: string }[])[0]?.id
    const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
    expect(await ui.findAll({ type: 'Button', text: 'Edit' })).toHaveLength(0)
    expect(await ui.find({ type: 'Text', text: /To edit, type \/idea edit 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Input' })).toBeUndefined()
    await ui.press({ key: `send:${id}` })
    expect(world.sent.map(s => s.text)).toEqual(['alpha'])
    expect(await storedTexts($, 'shelf:/work/proj')).toEqual([])
    await ui.unmount()
  })
})

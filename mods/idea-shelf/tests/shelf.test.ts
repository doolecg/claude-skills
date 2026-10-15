import { expect, mock, test } from 'claude-code/testing'

import { ageOf, cleanIdea, folderOf, ideaKey, isIdea, newId, parseEdit, shelfPrefix } from '../hooks/shelf'

test('a shelf is keyed by the project folder, and folders do not share a prefix with subfolders', () => {
  const backslash = String.fromCharCode(92)
  expect(folderOf(`F:${backslash}PROGRAMMING${backslash}Repo${backslash}`)).toBe('f:/programming/repo')
  expect(ideaKey('F:/Repo', 'abc').startsWith(shelfPrefix('f:/repo'))).toBe(true)
  expect(ideaKey('F:/Repo/sub', 'abc').startsWith(shelfPrefix('F:/Repo'))).toBe(false)
})

test('an empty idea is refused and a long one is cut', () => {
  expect(cleanIdea('   ')).toBe(null)
  expect(cleanIdea('  add dark mode  ')).toBe('add dark mode')
  expect(cleanIdea('x'.repeat(5000))?.length).toBe(2000)
})

test('stored values are checked before they are listed', () => {
  expect(isIdea({ text: 'a', at: 1 })).toBe(true)
  expect(isIdea({ text: 'a' })).toBe(false)
  expect(isIdea(null)).toBe(false)
})

test('ids are distinct for distinct random draws', () => {
  expect(newId(1000, 0.1) === newId(1000, 0.2)).toBe(false)
})

test('/idea edit <n> <text> is read as an edit, anything else as a new idea', () => {
  expect(parseEdit('edit 2 add dark mode')).toEqual({ n: 2, text: 'add dark mode' })
  expect(parseEdit('edit 1')).toEqual({ n: 1, text: '' })
  expect(parseEdit('add dark mode')).toBe(null)
  expect(parseEdit('edit x text')).toBe(null)
})

test('an idea shows its age as minutes, hours or days', () => {
  expect(ageOf(1000, 1000)).toBe('now')
  expect(ageOf(5 * 60000, 0)).toBe('5m')
  expect(ageOf(3 * 3600000, 0)).toBe('3h')
  expect(ageOf(2 * 86400000, 0)).toBe('2d')
})

// A stand-in for the Sidebar: `/sb-strip <json>` writes its `strip` state.
const SIDEBAR = {
  name: 'sidebar',
  register: ((on: any) => {
    on('command.run', { command: 'sb-strip' }, async ($: any, e: any) => {
      await $.state.set({ plugin: 'sidebar', key: 'strip' }, JSON.parse(e.args))
      return {}
    })
  }) as any,
}
const setStrip = ($: any, isOn: boolean, active: string) =>
  $.command.run({
    command: 'sb-strip',
    args: JSON.stringify({ isOn, active, tabs: [], theme: 'dark', colour: 'Coral' }),
    origin: { kind: 'composer' as const },
  })

test('the pane follows the sidebar’s strip: opened for its tab, closed when it moves on, no command run', { plugins: [SIDEBAR] }, async ($, on) => {
  const opened: any[] = []
  const closed: string[] = []
  const ran: string[] = []
  let panes: string[] = []
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'F:/repo' }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('command.run', (_$: any, e: any) => {
    ran.push(`${e.command} ${e.args}`.trim())
    return { text: '' }
  })
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
  on('ui.panes', () => ({ value: panes.map(id => ({ id, title: 'Idea Shelf', isShown: true, isFocused: false, isPlaced: true })) }))
  await $.session.start({ cwd: 'F:/repo', surface: 'terminal', isInteractive: true } as any)
  await setStrip($, true, 'idea-shelf')
  expect(opened.at(-1)).toMatchObject({ id: 'ideas', title: 'Idea Shelf', columns: 56 })
  await setStrip($, true, 'clean-view')
  expect(closed).toEqual(['ideas'])
  expect(ran).toEqual([])
})

test('/doole_idea-shelf opens the shelf like /ideas', async ($, on) => {
  const opened: any[] = []
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'F:/repo' }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('ui.open', (_$: any, e: any) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  await $.session.start({ cwd: 'F:/repo', surface: 'terminal', isInteractive: true } as any)
  await $.command.run({ command: 'ideas', args: '', origin: { kind: 'composer' as const } } as any)
  await $.command.run({ command: 'doole_idea-shelf', args: '', origin: { kind: 'composer' as const } } as any)
  expect(opened).toHaveLength(2)
  expect(opened[1]).toEqual(opened[0])
  expect(opened[1]).toMatchObject({ id: 'ideas', title: 'Idea Shelf' })
})

test('on the desktop the shelf is native Buttons and an Input with no Raster or box drawing; mobile has no Input', { plugins: [SIDEBAR] }, async ($, on) => {
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'F:/repo' }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ cwd: 'F:/repo', surface: 'terminal', isInteractive: true } as any)
  await $.command.run({ command: 'idea', args: 'add dark mode', origin: { kind: 'composer' as const } } as any)
  const props = { title: 'Idea Shelf', isFocused: false, bodyColumns: 56, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
  const box = new RegExp('[' + String.fromCharCode(0x2500) + '-' + String.fromCharCode(0x259f) + String.fromCharCode(0x2800) + '-' + String.fromCharCode(0x28ff) + ']')
  for (const strip of [false, true]) {
    if (strip)
      await $.command.run({
        command: 'sb-strip',
        args: JSON.stringify({ isOn: true, active: 'idea-shelf', tabs: [{ id: 'idea-shelf', icon: 'I', name: 'Idea Shelf', badge: 1 }], theme: 'dark', colour: 'Coral' }),
        origin: { kind: 'composer' as const },
      } as any)
    const ui = await $.ui.mount({ plugin: 'idea-shelf', surface: 'desktop', component: 'Pane', requestId: 'ideas', props } as any)
    const all = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join(String.fromCharCode(10))
    expect(all).toContain('add dark mode')
    expect((await ui.findAll({ type: 'Button' })).length, `buttons strip=${strip}`).toBeGreaterThan(0)
    expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
    if (strip) expect((await ui.findAll({ type: 'Input' })).length, 'input').toBeGreaterThan(0)
    expect(all).not.toMatch(box)
    await ui.unmount()
    const mobile = await $.ui.mount({ plugin: 'idea-shelf', surface: 'mobile', component: 'Pane', requestId: 'ideas', props } as any)
    expect(await mobile.findAll({ type: 'Input' })).toHaveLength(0)
    await mobile.unmount()
  }
})

test('a long idea with no spaces is cut to the narrow pane on the desktop', { plugins: [SIDEBAR] }, async ($, on) => {
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'F:/repo' }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ cwd: 'F:/repo', surface: 'terminal', isInteractive: true } as any)
  await $.command.run({ command: 'idea', args: 'C:/' + 'x'.repeat(200), origin: { kind: 'composer' as const } } as any)
  await $.command.run({
    command: 'sb-strip',
    args: JSON.stringify({ isOn: true, active: 'idea-shelf', tabs: [{ id: 'idea-shelf', icon: 'I', name: 'Idea Shelf', badge: 1 }], theme: 'dark', colour: 'Coral' }),
    origin: { kind: 'composer' as const },
  } as any)
  const props = { title: 'Idea Shelf', isFocused: false, bodyColumns: 44, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'idea-shelf', surface: 'desktop', component: 'Pane', requestId: 'ideas', props } as any)
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text))
  expect(texts.some(t => t.includes('xxxx') && t.endsWith('…'))).toBe(true)
  for (const t of texts) expect(t.length, t).toBeLessThanOrEqual(44 - 10)
  await ui.unmount()
})

function basics(on: any) {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'F:/repo' }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  return clock
}
const run = ($: any, command: string, args = '') => $.command.run({ command, args, origin: { kind: 'composer' as const } } as any)
const PANE = { title: 'Idea Shelf', isFocused: false, bodyColumns: 56, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
const mountPane = ($: any) => $.ui.mount({ plugin: 'idea-shelf', surface: 'desktop', component: 'Pane', requestId: 'ideas', props: PANE } as any)
const textsOf = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join(String.fromCharCode(10))

test('enabled off: the commands say it is off, nothing is saved and the pane is left alone', { options: { enabled: false } }, async ($, on) => {
  const opened: any[] = []
  basics(on)
  on('ui.open', (_$: any, e: any) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.render', { component: 'Pane', requestId: 'ideas' }, (($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return (globalThis as any).h(Text, {}, 'vanilla pane')
  }) as any)
  await $.session.start({ cwd: 'F:/repo', surface: 'terminal', isInteractive: true } as any)
  const off = 'Idea Shelf is off. Turn it on in Mod Settings (/doole_settings) or /config.'
  expect(((await run($, 'idea', 'add dark mode')) as any).text).toBe(off)
  expect(((await run($, 'ideas')) as any).text).toBe(off)
  expect(((await run($, 'doole_idea-shelf')) as any).text).toBe(off)
  expect(opened).toHaveLength(0)
  const ui = await mountPane($)
  expect(await textsOf(ui)).toBe('vanilla pane')
  await ui.unmount()
})

test('order, age, the length limit and keeping a sent idea come from the settings', { options: { order: 'Newest first', showAge: false, maxLength: 30, removeOnSend: false }, plugins: [SIDEBAR] }, async ($, on) => {
  const sent: string[] = []
  const clock = basics(on)
  on('prompt.submit', (_$: any, e: any) => {
    sent.push(e.text)
    return { drop: 'test' } as any
  })
  await $.session.start({ cwd: 'F:/repo', surface: 'terminal', isInteractive: true } as any)
  await run($, 'idea', 'first idea')
  await clock.advance(5 * 60_000)
  await run($, 'idea', 'second idea')
  await run($, 'idea', 'z'.repeat(80))
  await run($, 'sb-strip', JSON.stringify({ isOn: true, active: 'idea-shelf', tabs: [], theme: 'dark', colour: 'Coral' }))
  const ui = await mountPane($)
  const all = await textsOf(ui)
  expect(all.indexOf('second idea')).toBeLessThan(all.indexOf('first idea'))
  expect(all).not.toMatch(/[0-9]+[mhd]$|^now$/m)
  expect(all).toContain('z'.repeat(30))
  expect(all).not.toContain('z'.repeat(31))
  const key = (await ui.findAll({ type: 'Button' })).map((b: any) => String(b.key)).find((k: string) => k.startsWith('send:'))
  await ui.press({ key })
  expect(sent).toHaveLength(1)
  await ui.unmount()
  const again = await mountPane($)
  expect(await textsOf(again)).toContain('first idea')
  await again.unmount()
})

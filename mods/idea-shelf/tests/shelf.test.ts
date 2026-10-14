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

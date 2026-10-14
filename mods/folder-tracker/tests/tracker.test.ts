import { expect, mock, test } from 'claude-code/testing'

import { FILE_LIMIT, LIVE_MS, addFile, describeOther, folderOf, isLive, relativeTo, sameFile, trackerKey, trackerPrefix } from '../hooks/tracker'
import type { Tracker } from '../types'

const base: Tracker = { id: 'b', cwd: 'F:/repo', phase: 'working', at: 1_000, files: [] }

test('sessions of one folder share a prefix; a subfolder does not', () => {
  expect(trackerKey('F:\\Repo', 'a').startsWith(trackerPrefix('f:/repo'))).toBe(true)
  expect(trackerKey('F:/repo/sub', 'a').startsWith(trackerPrefix('F:/repo'))).toBe(false)
  expect(folderOf('F:\\Repo\\')).toBe('f:/repo')
})

test('the same file is matched whatever its slashes and case', () => {
  expect(sameFile('F:\\repo\\App.tsx', 'f:/repo/app.tsx')).toBe(true)
  expect(sameFile('F:/repo/a.ts', 'F:/repo/b.ts')).toBe(false)
})

test('a file list keeps the newest first, without repeats, up to its limit', () => {
  let files = addFile([], 'F:/repo/a.ts', 1)
  files = addFile(files, 'F:/repo/b.ts', 2)
  files = addFile(files, 'F:/REPO/A.ts', 3)
  expect(files.map(f => f.path)).toEqual(['F:/REPO/A.ts', 'F:/repo/b.ts'])
  for (let i = 0; i < FILE_LIMIT + 5; i++) files = addFile(files, `F:/repo/f${i}.ts`, i)
  expect(files.length).toBe(FILE_LIMIT)
})

test('a finished session is never live, and a silent one stops being live', () => {
  expect(isLive(base, 1_000 + LIVE_MS - 1)).toBe(true)
  expect(isLive(base, 1_000 + LIVE_MS)).toBe(false)
  expect(isLive({ ...base, phase: 'done' }, 1_000)).toBe(false)
})

test('the band line names the other session, its file and the file count', () => {
  expect(describeOther(base, 'F:/repo')).toBe('Other session: working — no file edits yet')
  const edited: Tracker = { ...base, phase: 'idle', files: [{ path: 'F:/repo/src/app.ts', at: 2 }, { path: 'F:/repo/a.ts', at: 1 }] }
  expect(describeOther(edited, 'F:/repo')).toBe('Other session: idle — editing src/app.ts (2 files)')
  expect(relativeTo('F:/repo', 'G:/elsewhere/x.ts')).toBe('G:/elsewhere/x.ts')
})

const T0 = 1_800_000_000_000
const SESSION = { cwd: 'F:/repo', surface: 'terminal', isInteractive: true } as any
const STRIP = {
  isOn: true,
  active: 'folder-tracker',
  tabs: [{ id: 'folder-tracker', icon: '⇄', name: 'Folder Tracker', badge: 0 }],
  theme: 'dark',
  colour: 'Coral',
}
const pane = () =>
  ({
    plugin: 'folder-tracker',
    component: 'Pane' as const,
    requestId: 'folders',
    surface: 'terminal',
    props: { title: 'Folder Tracker', isFocused: false, bodyColumns: 56, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as any
const command = (args = '') => ({ command: 'folders', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }) as any

function world(on: any, strip: unknown = STRIP, entries: Record<string, unknown> = {}) {
  const w = { opened: [] as any[], closed: [] as string[], panes: [] as string[], ran: [] as any[], badges: [] as unknown[] }
  mock.clock(on, { now: T0 })
  mock.store(on, entries)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'F:/repo' }))
  on('session.id', () => ({ value: 'me' }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('ui.open', (_$: any, e: any) => {
    w.opened.push(e)
    w.panes.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$: any, e: any) => {
    w.closed.push(e.id)
    w.panes = w.panes.filter(p => p !== e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: w.panes.map(id => ({ id, title: 'Folder Tracker', isShown: true, isFocused: false, isPlaced: true })) }))
  on('state.get', { plugin: 'sidebar', key: 'strip' }, () => ({ value: { value: strip, version: 1 } }) as any)
  on('state.set', { key: 'sidebarBadge' }, async (_$: any, e: any, next: any) => {
    w.badges.push(e.value)
    return next(e)
  })
  on('command.run', { command: 'sidebar' }, (_$: any, e: any) => {
    w.ran.push(e.args)
    return { text: '' }
  })
  return w
}

const entry = (id: string, phase: string, files: string[], at = T0 - 120_000): [string, Tracker] => [
  trackerKey('F:/repo', id),
  { id, cwd: 'F:/repo', phase: phase as Tracker['phase'], at, files: files.map(path => ({ path, at })) },
]

async function texts($: any) {
  const ui = await $.ui.mount(pane())
  return { ui, all: (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join('\n') }
}

test('/folders opens and closes the pane', async ($, on) => {
  const w = world(on)
  await $.session.start(SESSION)
  expect((await $.command.run(command())).text).toBe('Folder Tracker opened.')
  expect(w.opened[0]).toMatchObject({ id: 'folders', title: 'Folder Tracker', columns: 56 })
  expect((await $.command.run(command())).text).toBe('Folder Tracker closed.')
  expect(w.closed).toEqual(['folders'])
})

test('the pane lists other sessions, their files and the files both touched', async ($, on) => {
  const w = world(
    on,
    STRIP,
    Object.fromEntries([
      entry('me', 'working', ['F:/repo/src/a.ts'], T0),
      entry('other-one', 'working', ['F:/repo/src/a.ts', 'F:/repo/b.ts', 'F:/repo/c.ts', 'F:/repo/d.ts', 'F:/repo/e.ts', 'F:/repo/f.ts']),
    ]),
  )
  await $.session.start(SESSION)
  const { ui, all } = await texts($)
  expect(all).toContain('FOLDER TRACKER')
  expect(all).toContain('1 other session here')
  expect(all).toContain('other-o…')
  expect(all).toContain('working')
  expect(all).toContain('2m ago')
  expect(all).toContain('src/a.ts')
  expect(all).toContain('+2 more')
  expect(all).toContain('⚠ Both sessions touched 1 file')
  expect(all).toContain('DOOLE')
  await ui.unmount()
  expect(w.badges.at(-1)).toBe(1)
})

test('with no other sessions the pane says so, and outside the sidebar it has no strip', async ($, on) => {
  world(on, { ...STRIP, isOn: false })
  await $.session.start(SESSION)
  const { ui, all } = await texts($)
  expect(all).toContain('No other sessions in this folder')
  expect(all).toContain('no other sessions here')
  expect(all).not.toContain('DOOLE')
  await ui.unmount()
})

test('the badge counts other live sessions when this one records', async ($, on) => {
  const w = world(on, STRIP, Object.fromEntries([entry('x', 'idle', []), entry('y', 'done', [])]))
  await $.session.start(SESSION)
  expect(w.badges.at(-1)).toBe(1)
})

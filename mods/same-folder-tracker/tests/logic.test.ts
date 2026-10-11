import { describe, expect, test } from 'claude-code/testing'

import {
  DROP_MS,
  addPath,
  bandLines,
  baseName,
  claimToast,
  clashFor,
  editedPath,
  entryKey,
  folderKey,
  isLive,
  liveOthers,
  parseEntry,
  resolvePath,
  sessionLine,
  toView,
  toastText,
} from '../hooks/logic'
import type { Entry } from '../hooks/logic'

const NOW = 1_800_000_000_000

const entry = (sid: string, over: Partial<Entry> = {}): Entry => ({
  sid,
  folder: 'f:/proj',
  phase: 'working',
  updatedAt: NOW,
  files: [],
  ...over,
})

describe('folder keying', () => {
  test('case and slash style do not matter, a trailing slash is ignored', () => {
    expect(folderKey('F:\\PROGRAMMING\\Repos\\App')).toBe('f:/programming/repos/app')
    expect(folderKey('f:/programming/repos/app/')).toBe('f:/programming/repos/app')
    expect(folderKey('/Users/Me/Proj')).toBe('/users/me/proj')
  })

  test('a subfolder is a different folder, and roots are kept', () => {
    expect(folderKey('/work/app')).not.toBe(folderKey('/work/app/sub'))
    expect(folderKey('C:\\')).toBe('c:/')
    expect(folderKey('/')).toBe('/')
  })

  test('the store key holds the folder, so one folder never matches a prefix of another', () => {
    expect(entryKey('f:/a', 's1')).toBe('s|f:/a|s1')
    expect(entryKey('f:/a/b', 's1').startsWith('s|f:/a|')).toBe(false)
  })
})

describe('paths', () => {
  test('relative paths are made absolute against the folder, absolute ones are only slash-normalised', () => {
    expect(resolvePath('src\\a.ts', 'F:\\Proj')).toBe('F:/Proj/src/a.ts')
    expect(resolvePath('./a.ts', '/work/')).toBe('/work/a.ts')
    expect(resolvePath('C:\\x\\y.ts', '/work')).toBe('C:/x/y.ts')
    expect(resolvePath('/etc/y', '/work')).toBe('/etc/y')
  })

  test('the file name is the last part of the path', () => {
    expect(baseName('F:/Proj/src/a.ts')).toBe('a.ts')
    expect(baseName('a.ts')).toBe('a.ts')
  })

  test('the tool call input gives the path for Edit, Write and NotebookEdit only', () => {
    expect(editedPath('Edit', { file_path: '/a' })).toBe('/a')
    expect(editedPath('Write', { file_path: '/b' })).toBe('/b')
    expect(editedPath('NotebookEdit', { notebook_path: '/c.ipynb' })).toBe('/c.ipynb')
    expect(editedPath('Read', { file_path: '/a' })).toBeNull()
    expect(editedPath('Bash', {})).toBeNull()
    expect(editedPath('Edit', {})).toBeNull()
  })
})

describe('path cap', () => {
  test('only the 50 most recent paths are kept', () => {
    let files: string[] = []
    for (let i = 0; i < 60; i++) files = addPath(files, `/p/f${i}.ts`)
    expect(files).toHaveLength(50)
    expect(files[0]).toBe('/p/f10.ts')
    expect(files[49]).toBe('/p/f59.ts')
  })

  test('editing a file again moves it to the end instead of adding it twice, ignoring case', () => {
    let files = addPath([], '/p/a.ts')
    files = addPath(files, '/p/b.ts')
    files = addPath(files, '/P/A.ts')
    expect(files).toEqual(['/p/b.ts', '/P/A.ts'])
  })
})

describe('entries', () => {
  test('a stored entry reads back, with the path list capped', () => {
    const files = Array.from({ length: 70 }, (_, i) => `/p/${i}`)
    const parsed = parseEntry({ sid: 's', folder: 'f:/proj', phase: 'idle', updatedAt: NOW, files })
    expect(parsed?.files).toHaveLength(50)
    expect(parsed?.files[49]).toBe('/p/69')
  })

  test('anything malformed is refused', () => {
    expect(parseEntry(null)).toBeNull()
    expect(parseEntry('x')).toBeNull()
    expect(parseEntry({ sid: 's', folder: 'f', phase: 'busy', updatedAt: 1, files: [] })).toBeNull()
    expect(parseEntry({ sid: 's', folder: 'f', phase: 'idle', updatedAt: 'now', files: [] })).toBeNull()
    expect(parseEntry({ folder: 'f', phase: 'idle', updatedAt: 1 })).toBeNull()
  })

  test('non-string paths are dropped', () => {
    expect(parseEntry({ sid: 's', folder: 'f', phase: 'idle', updatedAt: 1, files: ['/a', 3, null] })?.files).toEqual(['/a'])
  })
})

describe('liveness and drop-out', () => {
  test('a session is live for 30 minutes after its last update, then drops out', () => {
    expect(isLive(entry('a', { updatedAt: NOW - DROP_MS }), NOW)).toBe(true)
    expect(isLive(entry('a', { updatedAt: NOW - DROP_MS - 1 }), NOW)).toBe(false)
  })

  test('a session that said it is done is not live, whatever its age', () => {
    expect(isLive(entry('a', { phase: 'done' }), NOW)).toBe(false)
  })

  test('only other live sessions of the same folder are kept, newest first', () => {
    const list = liveOthers(
      [
        entry('me'),
        entry('old', { updatedAt: NOW - 5 * 60_000 }),
        entry('new', { updatedAt: NOW - 1000 }),
        entry('elsewhere', { folder: 'f:/proj/sub' }),
        entry('gone', { updatedAt: NOW - 31 * 60_000 }),
        entry('ended', { phase: 'done' }),
      ],
      'me',
      'f:/proj',
      NOW,
    )
    expect(list.map(e => e.sid)).toEqual(['new', 'old'])
  })
})

describe('the toast rule', () => {
  const others = [entry('a', { files: ['/p/One.ts', '/p/two.ts'] })]

  test('a file another session edited warns once, matching without regard to case', () => {
    const warned = new Set<string>()
    expect(claimToast(warned, others, '/p/one.ts')).toBe(true)
    expect(claimToast(warned, others, '/P/ONE.ts')).toBe(false)
    expect(claimToast(warned, others, '/p/two.ts')).toBe(true)
  })

  test('a file nobody else edited never warns, and is not remembered', () => {
    const warned = new Set<string>()
    expect(claimToast(warned, others, '/p/mine.ts')).toBe(false)
    expect(warned.size).toBe(0)
    expect(clashFor(others, '/p/mine.ts')).toBeNull()
  })

  test('the toast names the file', () => {
    expect(toastText('/p/src/one.ts')).toBe('Another session in this folder already edited one.ts.')
  })
})

describe('band text', () => {
  const views = (n: number) => Array.from({ length: n }, (_, i) => toView(entry(`s${i}`, { files: ['/p/a.ts', `/p/f${i}.ts`] })))

  test('no sessions, no lines', () => {
    expect(bandLines([])).toEqual([])
  })

  test('one session reads as the spec words it', () => {
    expect(bandLines(views(1))).toEqual(['Other session: working \u2014 editing f0.ts (2 files)'])
  })

  test('three sessions give three lines', () => {
    expect(bandLines(views(3))).toHaveLength(3)
  })

  test('a fourth session is not listed, only counted', () => {
    const lines = bandLines(views(4))
    expect(lines).toHaveLength(4)
    expect(lines.slice(0, 3).every(l => l.startsWith('Other session:'))).toBe(true)
    expect(lines[3]).toBe('+1 more session in this folder')
  })

  test('phases and file counts are worded plainly', () => {
    expect(sessionLine(toView(entry('a', { phase: 'waiting', files: ['/p/x.ts'] })))).toBe(
      'Other session: waiting on permission \u2014 editing x.ts (1 file)',
    )
    expect(sessionLine(toView(entry('a', { phase: 'idle' })))).toBe('Other session: idle')
  })
})

import { describe, expect, test } from 'claude-code/testing'

import { basename, dirname, folderKey, homeDir, isSameOrInside, joinPath, normPath, resolvePath, tempDir } from '../lib/paths'
import { fakeIo } from './fakeio'

describe('path helpers', () => {
  test('normalise slashes and trailing slash', () => {
    expect(normPath('C:\\Users\\Dayle Frost\\')).toBe('C:/Users/Dayle Frost')
    expect(normPath('C:\\')).toBe('C:/')
    expect(normPath('C:')).toBe('C:/')
    expect(normPath('/a//b/')).toBe('/a/b')
    expect(normPath('/')).toBe('/')
    expect(normPath('\\\\server\\share\\x')).toBe('//server/share/x')
  })

  test('join, basename, dirname', () => {
    expect(joinPath('C:\\Users\\me', '.claude/skills', 'x')).toBe('C:/Users/me/.claude/skills/x')
    expect(joinPath('/home/me/', '/.hindsight')).toBe('/home/me/.hindsight')
    expect(joinPath(null, '', 'a')).toBe('a')
    expect(basename('F:\\PROGRAMMING\\REPOS\\ClaudeMods\\')).toBe('ClaudeMods')
    expect(dirname('F:/PROGRAMMING/REPOS')).toBe('F:/PROGRAMMING')
    expect(dirname('F:/PROGRAMMING')).toBe('F:/')
    expect(dirname('/a')).toBe('/')
    expect(dirname('a')).toBe('.')
  })

  test('folder key ignores case, slashes and a trailing slash', () => {
    expect(folderKey('C:\\Code\\App\\')).toBe(folderKey('c:/code/app'))
    expect(folderKey('C:/Code/App/sub')).not.toBe(folderKey('C:/Code/App'))
    expect(isSameOrInside('C:/Code/App/sub', 'c:\\code\\app')).toBe(true)
    expect(isSameOrInside('C:/Code/Application', 'C:/Code/App')).toBe(false)
  })

  test('resolve folds dots and keeps absolute paths', () => {
    expect(resolvePath('C:/r/.git/worktrees/wt', '../..')).toBe('C:/r/.git')
    expect(resolvePath('/r/.git/worktrees/wt', '../../x')).toBe('/r/.git/x')
    expect(resolvePath('/r', 'C:\\other')).toBe('C:/other')
    expect(resolvePath('/r', '/abs')).toBe('/abs')
  })

  test('home and temp folders come from the environment', async () => {
    expect(await homeDir(fakeIo({ env: { USERPROFILE: 'C:\\Users\\Dayle Frost', HOME: '/c/Users/x' } }).io)).toBe('C:/Users/Dayle Frost')
    expect(await homeDir(fakeIo({ env: { HOME: '/home/me/' } }).io)).toBe('/home/me')
    expect(await homeDir(fakeIo({ env: { HOMEDRIVE: 'C:', HOMEPATH: '\\Users\\x' } }).io)).toBe('C:/Users/x')
    expect(await homeDir(fakeIo().io)).toBeNull()
    expect(await tempDir(fakeIo({ env: { TEMP: 'C:\\Temp' } }).io)).toBe('C:/Temp')
    expect(await tempDir(fakeIo({ env: { TMPDIR: '/var/tmp/' } }).io)).toBe('/var/tmp')
    expect(await tempDir(fakeIo().io)).toBe('/tmp')
    expect(await tempDir(fakeIo({ env: { OS: 'Windows_NT' } }).io)).toBeNull()
  })
})

import { expect, test } from 'claude-code/testing'

import { chooseTempDir, detectPlatform, openArgv, pagePath } from '../hooks/platform'

test('Windows is found from the OS variable or a drive-letter temp folder', () => {
  expect(detectPlatform({ os: 'Windows_NT' })).toBe('windows')
  expect(detectPlatform({ temp: 'C:\\Users\\me\\AppData\\Local\\Temp' })).toBe('windows')
  expect(detectPlatform({ temp: 'D:/tmp' })).toBe('windows')
})

test('macOS and Linux are told apart by the macOS system folder', () => {
  expect(detectPlatform({ temp: '/var/folders/ab/T/', hasMacRoot: true })).toBe('macos')
  expect(detectPlatform({ temp: '/tmp', hasMacRoot: false })).toBe('linux')
  expect(detectPlatform({})).toBe('linux')
})

test('the temp folder comes from TEMP then TMP on Windows', () => {
  expect(chooseTempDir('windows', { TEMP: 'C:\\T', TMP: 'C:\\U' }, false)).toBe('C:\\T')
  expect(chooseTempDir('windows', { TEMP: '', TMP: 'C:\\U' }, false)).toBe('C:\\U')
  expect(chooseTempDir('windows', { TMPDIR: '/x' }, true)).toBe(undefined)
  expect(chooseTempDir('windows', {}, false)).toBe(undefined)
})

test('the temp folder comes from TMPDIR then /tmp elsewhere', () => {
  expect(chooseTempDir('macos', { TMPDIR: '/var/folders/T/' }, true)).toBe('/var/folders/T/')
  expect(chooseTempDir('linux', {}, true)).toBe('/tmp')
  expect(chooseTempDir('linux', {}, false)).toBe(undefined)
})

test('the page path uses the platform separator and no doubled separators', () => {
  expect(pagePath('windows', 'C:\\Temp\\')).toBe('C:\\Temp\\claude-design-picker.html')
  expect(pagePath('macos', '/var/T/')).toBe('/var/T/claude-design-picker.html')
  expect(pagePath('linux', '/tmp')).toBe('/tmp/claude-design-picker.html')
})

test('each platform opens the page with its own command', () => {
  expect(openArgv('windows', 'C:\\T\\p.html')).toEqual(['cmd', '/c', 'start', '', 'C:\\T\\p.html'])
  expect(openArgv('macos', '/t/p.html')).toEqual(['open', '/t/p.html'])
  expect(openArgv('linux', '/t/p.html')).toEqual(['xdg-open', '/t/p.html'])
})

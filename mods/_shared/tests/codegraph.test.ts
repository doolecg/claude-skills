import { describe, expect, test } from 'claude-code/testing'

import { NOT_INDEXED, cleanQuery, explore, exploreArgv, findIndex } from '../lib/codegraph'
import { fakeIo } from './fakeio'

const done = (stdout: string, exitCode = 0, stderr = '') => ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

describe('argv', () => {
  test('Windows goes through cmd /c, elsewhere the plain binary', () => {
    expect(exploreArgv('SessionManager login', { windows: true })).toEqual(['cmd', '/c', 'codegraph', 'explore', 'SessionManager login'])
    expect(exploreArgv('SessionManager login', { windows: false })).toEqual(['codegraph', 'explore', 'SessionManager login'])
    expect(exploreArgv('a', { windows: false, maxFiles: 3 })).toEqual(['codegraph', 'explore', '--max-files', '3', 'a'])
  })

  test('the query is one clean line and cannot carry cmd syntax on Windows', () => {
    expect(cleanQuery('  foo\n bar\t baz ', false)).toBe('foo bar baz')
    expect(cleanQuery('foo & del x | calc > y ^ %PATH% "q" !', true)).toBe('foo del x calc y PATH q')
    expect(cleanQuery('a & b', false)).toBe('a & b')
    expect(cleanQuery('x'.repeat(2000), false).length).toBe(600)
  })
})

describe('findIndex', () => {
  const files = { 'F:/R/App/.codegraph/codegraph.db': 'db', 'F:/R/App/src/deep/a.ts': 'a', 'F:/R/Other/.codegraph': 'a file, not a folder' }

  test('finds the nearest .codegraph folder at or above the folder', async () => {
    const { io } = fakeIo({ files })
    expect(await findIndex(io, 'F:/R/App')).toBe('F:/R/App')
    expect(await findIndex(io, 'F:\\R\\App\\src\\deep')).toBe('F:/R/App')
  })

  test('null when there is none, or only a file of that name', async () => {
    const { io } = fakeIo({ files })
    expect(await findIndex(io, 'F:/R/Other/sub')).toBeNull()
    expect(await findIndex(io, 'F:/nowhere')).toBeNull()
    expect(await findIndex(io, '/')).toBeNull()
  })
})

describe('explore', () => {
  test('runs the CLI in the repo root with the timeout and returns its text (Windows)', async () => {
    const f = fakeIo({ env: { OS: 'Windows_NT' }, run: async () => done('**Exploration: tile**\n\nFound 54 symbols\n') })
    const r = await explore(f.io, 'F:/R/App', 'tile & x', { timeoutMs: 9000 })
    expect(r).toEqual({ ok: true, text: '**Exploration: tile**\n\nFound 54 symbols' })
    expect(f.calls.run[0]).toEqual({ argv: ['cmd', '/c', 'codegraph', 'explore', 'tile x'], init: { cwd: 'F:/R/App', timeoutMs: 9000 } })
  })

  test('the plain binary on macOS and Linux, 20 s by default', async () => {
    const f = fakeIo({ env: { HOME: '/home/me' }, run: async () => done('text') })
    await explore(f.io, '/home/me/app', 'login flow')
    expect(f.calls.run[0]).toEqual({ argv: ['codegraph', 'explore', 'login flow'], init: { cwd: '/home/me/app', timeoutMs: 20000 } })
  })

  test('a repo with no index is "CodeGraph: not indexed"', async () => {
    const msg = "✗ CodeGraph isn't available here — no .codegraph/ index exists in C:\\Users\\x. If you are an AI agent: continue."
    const f = fakeIo({ run: async () => done(msg) })
    expect(await explore(f.io, '/x', 'q')).toEqual({ ok: false, reason: NOT_INDEXED })
    expect(NOT_INDEXED).toBe('CodeGraph: not indexed')
  })

  test('failures are reasons, not throws', async () => {
    const bad = fakeIo({ run: async () => done('', 2, 'unknown option\nmore') })
    expect(await explore(bad.io, '/x', 'q')).toEqual({ ok: false, reason: 'exit 2: unknown option' })
    const empty = fakeIo({ run: async () => done('  ') })
    expect(await explore(empty.io, '/x', 'q')).toEqual({ ok: false, reason: 'no output' })
    const slow = fakeIo({
      run: async () => {
        throw new Error('command timed out after 100ms')
      },
    })
    expect(await explore(slow.io, '/x', 'q')).toEqual({ ok: false, reason: 'timeout' })
    const missing = fakeIo()
    const r = await explore(missing.io, '/x', 'q')
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).toContain('codegraph not available')
    const win = fakeIo({ env: { OS: 'Windows_NT' } })
    expect(await explore(win.io, 'F:/x', ' & | ')).toEqual({ ok: false, reason: 'empty query' })
    expect(win.calls.run.length).toBe(0)
  })
})

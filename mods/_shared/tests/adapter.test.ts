import { expect, mock, test } from 'claude-code/testing'

// The libraries reach the engine through makeIo (hooks/register.ts). The plugin's session.start
// hook runs them against the engine's own fs, http, process and env calls, which this test answers.

test('makeIo reaches the engine: home folder, skills, Hindsight and CodeGraph', async ($, on) => {
  mock.env(on, { USERPROFILE: 'C:\\Users\\T', OS: 'Windows_NT' })
  const seen: string[] = []
  const files: Record<string, string> = {
    'C:/Users/T/.hindsight/coding-agent.json': JSON.stringify({ serverMode: 'self-hosted', apiUrl: 'http://h:1', apiToken: 'tok' }),
    'C:/Users/T/.claude/skills/one/SKILL.md': '---\nname: one\ndescription: First\n---\n',
    'F:/work/app/.codegraph/codegraph.db': 'db',
    'F:/work/app/.git/HEAD': 'ref',
  }
  const norm = (p: string) => p.replace(/\\/g, '/')
  const isDir = (p: string) => Object.keys(files).some(k => k.startsWith(`${norm(p)}/`))

  on('fs.exists', (_$, e) => ({ value: norm(e.path) in files || isDir(e.path) }))
  on('fs.read', (_$, e) => ({ value: files[norm(e.path)] ?? '' }))
  on('fs.stat', (_$, e) => {
    const k = norm(e.path)
    if (k in files) return { value: { kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false } }
    if (isDir(k)) return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } }
    throw new Error('ENOENT')
  })
  on('fs.list', (_$, e) => {
    const dir = norm(e.path)
    const names = new Set(Object.keys(files).filter(k => k.startsWith(`${dir}/`)).map(k => k.slice(dir.length + 1).split('/')[0]!))
    return {
      value: [...names].map(name => ({
        name,
        kind: files[`${dir}/${name}`] === undefined ? ('dir' as const) : ('file' as const),
        size: 0,
        mtimeMs: 0,
        isLink: false,
      })),
    }
  })
  on('http.fetch', (_$, e) => {
    seen.push(`${e.init?.method} ${e.url} ${e.init?.headers?.Authorization ?? ''}`)
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ results: [{ id: '1', text: 'a lesson' }] }) } }
  })
  on('process.run', (_$, e) => {
    seen.push(`${e.argv.join(' ')} @ ${e.init?.cwd}`)
    return { value: { exitCode: 0, stdout: 'graph text', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  const started = await $.session.start({ cwd: 'selftest:F:/work/app/src', surface: null, isInteractive: false })
  const out = JSON.parse(started.cwd)

  expect(out.home).toBe('C:/Users/T')
  expect(out.skills.errors).toEqual([])
  expect(out.skills.skills.map((s: { name: string }) => s.name)).toEqual(['one'])
  expect(out.recalled.results[0].text).toBe('a lesson')
  expect(seen[0]).toBe('POST http://h:1/v1/default/banks/coding-agent%3A%3Aapp/memories/recall Bearer tok')
  expect(out.root).toBe('F:/work/app')
  expect(out.graph).toEqual({ ok: true, text: 'graph text' })
  expect(seen[1]).toBe('cmd /c codegraph explore x @ F:/work/app')
})

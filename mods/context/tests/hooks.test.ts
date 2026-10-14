import { expect, mock, test } from 'claude-code/testing'

const HOME = '/home/ann'
const ROOT = '/work/app'
const CFG = JSON.stringify({ serverMode: 'self-hosted', apiUrl: 'http://hs.local:8888', apiToken: 'tok' })

type World = { hindsight?: 'answers' | 'error500' | 'down'; cfg?: string; codegraph?: boolean; repo?: boolean; deny?: boolean }

// Stands in for the engine beneath the mod: files, git, the Hindsight server and the session.
function engine(on: any, w: World = {}) {
  const seen = { fetched: [] as { url: string; headers: any }[], ran: [] as string[], footer: undefined as any }
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('state.set', { key: 'footer' }, async (_$: any, e: any, next: any) => {
    seen.footer = e.value
    return next(e)
  })
  mock.env(on, { HOME })
  const norm = (p: unknown) => String(p).replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('session.root', () => ({ value: ROOT }))
  on('fs.read', (_$: any, e: any) => (norm(e.path) === `${HOME}/.hindsight/coding-agent.json` && w.cfg !== '' ? { value: w.cfg ?? CFG } : { deny: 'no such file' }))
  on('fs.exists', (_$: any, e: any) => ({ value: w.codegraph === true && norm(e.path) === `${ROOT}/.codegraph` }))
  on('process.run', (_$: any, e: any) => {
    const argv = (e.argv as string[]).join(' ')
    seen.ran.push(argv)
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const fail = () => ({ value: { exitCode: 128, stdout: '', stderr: 'fatal', isStdoutTruncated: false, isStderrTruncated: false } })
    if (w.repo === false) return fail()
    if (argv.includes('--show-toplevel')) return ok(`${ROOT}\n`)
    if (argv.includes('--abbrev-ref')) return ok('dev-1.0\n')
    if (argv.includes('status')) return ok(' M a.ts\n?? b.ts\n')
    if (argv.includes('rev-list')) return ok('1\t2\n')
    return fail()
  })
  on('http.fetch', (_$: any, e: any) => {
    seen.fetched.push({ url: e.url, headers: e.init?.headers })
    if (w.hindsight === 'down') return { deny: 'unreachable' }
    const status = w.hindsight === 'error500' ? 500 : 200
    return { value: { status, ok: status < 400, headers: {}, text: 'ok' } }
  })
  on('tool.call', (_$: any, e: any) => (w.deny ? { deny: 'no' } : { result: {}, text: 'done', ref: 1, tool: e.tool }))
  return seen
}

const start = ($: any) => $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
const call = ($: any, tool: string, command?: string) => $.tool.call(command === undefined ? { tool, file_path: '/work/app/a.ts' } : { tool, command })

test('the footer is filled at session start', async ($, on) => {
  const seen = engine(on, { codegraph: true })
  await start($)
  const f = seen.footer
  expect('context' in f).toBe(false)
  expect(f.hindsight).toBe('up')
  expect(f.codegraph).toBe('indexed')
  expect(f.git).toEqual({ branch: 'dev-1.0', changed: 2, ahead: 2, behind: 1 })
  expect(f.passes).toEqual({ count: 0, limit: 3, editedSince: false, extra: [] })
  expect(seen.fetched[0]).toEqual({ url: 'http://hs.local:8888/health', headers: { Authorization: 'Bearer tok' } })
})

test('no Hindsight config reads off', async ($, on) => {
  const seen = engine(on, { cfg: '' })
  await start($)
  expect((seen.footer).hindsight).toBe('off')
})

test('a server error reads down', async ($, on) => {
  const seen = engine(on, { hindsight: 'error500' })
  await start($)
  expect((seen.footer).hindsight).toBe('down')
})

test('an unreachable server reads down', async ($, on) => {
  const seen = engine(on, { hindsight: 'down' })
  await start($)
  expect((seen.footer).hindsight).toBe('down')
})

test('outside a repo git is null and CodeGraph none', async ($, on) => {
  const seen = engine(on, { repo: false })
  await start($)
  const f = seen.footer
  expect(f.git).toBeNull()
  expect(f.codegraph).toBe('none')
})

test('a check command publishes pass 1; a second one with no edit stays 1; edit then check is 2', async ($, on) => {
  const seen = engine(on)
  await start($)
  await call($, 'Bash', 'npm test')
  expect((seen.footer).passes.count).toBe(1)
  await call($, 'Bash', 'npx tsc -p .')
  expect((seen.footer).passes.count).toBe(1)
  await call($, 'Edit')
  expect((seen.footer).passes.editedSince).toBe(true)
  await call($, 'Bash', 'npm test')
  const f = seen.footer
  expect(f.passes.count).toBe(2)
  expect(f.passes.editedSince).toBe(false)
})

test('a denied check is not counted', async ($, on) => {
  const seen = engine(on, { deny: true })
  await start($)
  await call($, 'Bash', 'npm test')
  expect((seen.footer).passes.count).toBe(0)
})

test('a person prompt resets the count; a mod prompt does not', async ($, on) => {
  const seen = engine(on)
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text, origin: e.origin }))
  await start($)
  await call($, 'Bash', 'npm test')
  await $.prompt.submit({ text: 'carry on', wait: false, origin: { kind: 'plugin', name: 'other' } })
  expect((seen.footer).passes.count).toBe(1)
  await $.prompt.submit({ text: 'new problem', wait: false, origin: { kind: 'composer' } })
  expect((seen.footer).passes.count).toBe(0)
})

test('the pass limit and extra check words come from the options', { options: { passLimit: 5, extraChecks: 'smoke' } }, async ($, on) => {
  const seen = engine(on)
  await start($)
  await call($, 'Bash', './smoke.sh')
  const f = seen.footer
  expect(f.passes).toEqual({ count: 1, limit: 5, editedSince: false, extra: ['smoke'] })
})

test('/passes reports and /passes reset resets', async ($, on) => {
  const seen = engine(on)
  await start($)
  await call($, 'Bash', 'npm test')
  await call($, 'Write')
  const said = await $.command.run({ command: 'passes', args: '' } as any)
  expect(said.text).toBe('Pass 1 of 3. An edit is waiting for the next check.')
  const reset = await $.command.run({ command: 'passes', args: 'reset' } as any)
  expect(reset.text).toBe('Passes reset.')
  expect((seen.footer).passes).toEqual({ count: 0, limit: 3, editedSince: false, extra: [] })
})

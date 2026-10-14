import { expect, mock, test, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOME = 'C:\\Users\\me'
const CONFIG = `${HOME}\\.claude`
const SOUL = `${CONFIG}\\soul.md`
const SOUL_TEXT = '# Soul\n\n## How to respond\n\n- Keep replies short and in plain words.\n\n## How I work\n\n- Max 3 test/fix passes, then stop and ask.\n'
const OK = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const FAIL = { exitCode: 1, stdout: '', stderr: 'no', isStdoutTruncated: false, isStderrTruncated: false }

// A small file system and host beneath the plugin. Hindsight is not set up and nothing else answers.
function host(on: On, seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed))
  const runs: (readonly string[])[] = []
  const runEnvs: (Record<string, string> | undefined)[] = []
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: HOME, HOME })
  mock.store(on)
  on('fs.read', ($, e) => {
    const t = files.get(e.path)
    if (t === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: t }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${e.path}\\`)) }))
  on('fs.list', ($, e) => {
    const base = `${e.path}\\`
    const names = new Set([...files.keys()].filter(k => k.startsWith(base)).map(k => k.slice(base.length).split('\\')[0]!))
    if (!names.size) throw new Error('ENOENT')
    return { value: [...names].map(name => ({ name, kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('process.run', ($, e) => {
    runs.push(e.argv)
    runEnvs.push(e.init?.env)
    return { value: e.argv[0] === 'powershell' ? OK : FAIL }
  })
  on('http.fetch', () => {
    throw new Error('offline')
  })
  const logs: string[] = []
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  mock.clock(on, { now: Date.UTC(2026, 9, 13) })
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.cwd', () => ({ value: 'F:\\code\\shop' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('classic.SessionStart', () => ({}))
  return { files, runs, runEnvs, logs }
}

const start = async ($: Engine) => {
  await $.session.start({ cwd: 'F:\\code\\shop', surface: 'terminal', isInteractive: true })
}

test('the session starts with soul.md and the lessons brief as SessionStart context; nothing is written to CLAUDE.md', async ($, on) => {
  const h = host(on, { [SOUL]: SOUL_TEXT })
  await start($)
  const r = await $.classic.SessionStart({ source: 'startup' })
  const context = (r.additionalContext ?? []).join('\n')
  expect(context, `result ${JSON.stringify(r)}; files ${[...h.files.keys()].join(', ')}; logs ${h.logs.join(' | ')}`).toContain('About the user (from soul.md):')
  expect(context.indexOf('How to respond:')).toBeLessThan(context.indexOf('How I work:'))
  expect([...h.files.keys()].some(k => /CLAUDE\.md$/i.test(k))).toBe(false)
})

test('closing a session with edits writes a job and starts the hidden learner, marked as a worker', async ($, on) => {
  const h = host(on, { [SOUL]: SOUL_TEXT })
  on('tool.call', { tool: 'Edit' }, () => ({ result: { filePath: 'a.ts' } as never }))
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: 'F:\\code\\shop\\a.ts', old_string: 'a', new_string: 'b' } as never)
  const id = 'sess-1'
  await $.session.end({ reason: 'prompt_input_exit', sessionId: id, resume: { id } })
  expect([...h.files.keys()].some(k => k.startsWith(`${CONFIG}\\self-improve\\jobs\\`))).toBe(true)
  const worker = h.runs.findIndex(a => a[0] === 'powershell')
  expect(worker >= 0).toBe(true)
  expect(h.runs[worker]!.join(' ')).toContain('/self-improve-run')
  expect(h.runEnvs[worker]).toEqual({ SELF_IMPROVE_WORKER: '1' })
})

test('a session that did nothing, a /clear, or /learn-off learns nothing when it ends', async ($, on) => {
  const h = host(on)
  on('tool.call', { tool: 'Edit' }, () => ({ result: { filePath: 'a.ts' } as never }))
  await start($)
  const id = 'sess-1'
  await $.session.end({ reason: 'prompt_input_exit', sessionId: id, resume: { id } })
  await $.tool.call({ tool: 'Edit', file_path: 'F:\\code\\shop\\a.ts', old_string: 'a', new_string: 'b' } as never)
  await $.session.end({ reason: 'clear', sessionId: id, resume: { id } })
  await $.command.run({ command: 'learn-off', args: '' } as never)
  await $.session.end({ reason: 'other', sessionId: id, resume: { id } })
  expect(h.runs.some(a => a[0] === 'powershell')).toBe(false)
  expect([...h.files.keys()].some(k => k.includes('\\jobs\\'))).toBe(false)
})

test('/learn status says nothing was learned yet', async ($, on) => {
  host(on)
  await start($)
  const { text } = (await $.command.run({ command: 'learn', args: 'status' } as never)) as { text: string }
  expect(text).toMatch(/Memory: nothing learned yet/)
})

const BOX = new RegExp('[' + String.fromCharCode(0x2500) + '-' + String.fromCharCode(0x259f) + String.fromCharCode(0x2800) + '-' + String.fromCharCode(0x28ff) + ']')
const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join(String.fromCharCode(10))

test('on the desktop the pane is native, with no Raster or box drawing', async ($, on) => {
  host(on)
  await start($)
  await $.command.run({ command: 'learn', args: 'status' } as never)
  const pane = await $.ui.mount({ plugin: 'self-improve', surface: 'desktop', component: 'Pane', requestId: 'self-improve', props: { title: 'Self Improve', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as never)
  expect(await pane.find({ type: 'Button', key: 'tab-lessons' })).toBeDefined()
  expect(await pane.find({ type: 'Button', key: 'test' })).toBeDefined()
  expect(await pane.findAll({ type: 'Raster' })).toHaveLength(0)
  expect(await texts(pane)).not.toMatch(BOX)
  await pane.unmount()
  const mobile = await $.ui.mount({ plugin: 'self-improve', surface: 'mobile', component: 'Pane', requestId: 'self-improve', props: { title: 'Self Improve', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as never)
  expect(await mobile.findAll({ type: 'Input' })).toHaveLength(0)
  await mobile.unmount()
})

test('the recall tool answers from soul.md when Hindsight is not set up', async ($, on) => {
  host(on, { [SOUL]: SOUL_TEXT })
  await start($)
  const r = await $.tool.call({ tool: 'mcp__self-improve__recall', query: 'how should replies be worded' } as never)
  expect(String((r as { result?: unknown }).result)).toContain('Keep replies short and in plain words.')
})

import { describe, expect, mock, test } from 'claude-code/testing'

import { projectSlug } from '../hooks/run'
import { API_DIFF, SESSION } from './host'
import { sampleSession } from './fixtures'

const PLUGIN = 'session-learner'
const HOME = 'C:/Users/me'
const CWD = 'C:/work/proj'
const TRANSCRIPT = `${HOME}/.claude/projects/${projectSlug(CWD)}/${SESSION}.jsonl`
const SURFACES = ['terminal', 'desktop'] as const
const MEMORY = `${HOME}/.claude/projects/${projectSlug(CWD)}/memory/session-learner.md`
const START = { cwd: CWD, surface: 'terminal', isInteractive: true } as any
const USAGE = { input_tokens: 3000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const LESSON = { kind: 'convention', text: 'Use the withRetry helper for network calls in src/api.ts.', scope: 'project', files: ['src/api.ts'], symbols: ['withRetry'] }

const SHOWN = { options: { showBand: true } }
const CONTROLLED = { options: { showBand: true, reviewMode: 'controlled' } }

const BAND = (surface: (typeof SURFACES)[number], hasSurvey = false) =>
  ({
    plugin: PLUGIN,
    surface,
    component: 'AbovePrompt' as const,
    requestId: 'band',
    props: { hasSurvey, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  }) as any
const PANE = (surface: (typeof SURFACES)[number]) =>
  ({
    plugin: PLUGIN,
    surface,
    component: 'Pane' as const,
    requestId: 'learn',
    props: { title: 'Session Learner', isFocused: false, bodyColumns: 100, bodyRows: 40, placement: 'inline', scroll: { offset: 0, bodyRows: 40 } },
  }) as any
const cmd = (command: string, args = '') => ({ command, args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 100 } }) as any

type World = {
  files: Map<string, string>
  store: Map<string, unknown>
  registered: string[]
  opened: unknown[]
  toasts: string[]
  config: Array<{ key: string; value: unknown }>
  runs: Array<{ argv: readonly string[]; env?: Record<string, string> }>
  models: Array<{ model: string; prompt: string }>
  tools: any[]
  clock: ReturnType<typeof mock.clock>
}

function world(on: any, env: Record<string, string> = {}, answer = JSON.stringify([LESSON])): World {
  const w: World = { files: new Map(), store: new Map(), registered: [], opened: [], toasts: [], config: [], runs: [], models: [], tools: [], clock: mock.clock(on, { now: Date.UTC(2026, 9, 11, 12) }) }
  w.files.set(TRANSCRIPT, sampleSession())
  w.files.set(`${CWD}/src/api.ts`, 'export {}')
  mock.env(on, { USERPROFILE: 'C:/Users/me', OS: 'Windows_NT', ...env })
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const isDir = (p: string) => [...w.files.keys()].some(k => k.startsWith(`${norm(p)}/`))
  on('fs.exists', (_$: any, e: any) => ({ value: w.files.has(norm(e.path)) || isDir(e.path) }))
  on('fs.read', (_$: any, e: any) => {
    const v = w.files.get(norm(e.path))
    if (v === undefined) throw new Error('ENOENT')
    return { value: v }
  })
  on('fs.write', (_$: any, e: any) => {
    w.files.set(norm(e.path), e.text ?? e.content ?? '')
    return { value: undefined }
  })
  on('fs.stat', (_$: any, e: any) => {
    const k = norm(e.path)
    if (w.files.has(k)) return { value: { kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false } }
    if (isDir(k)) return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } }
    throw new Error('ENOENT')
  })
  on('fs.list', (_$: any, e: any) => {
    const dir = norm(e.path)
    const names = new Set([...w.files.keys()].filter(k => k.startsWith(`${dir}/`)).map(k => k.slice(dir.length + 1).split('/')[0]!))
    return { value: [...names].map(name => ({ name, kind: w.files.has(`${dir}/${name}`) ? ('file' as const) : ('dir' as const), size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('process.run', (_$: any, e: any) => {
    w.runs.push({ argv: e.argv, env: e.init?.env })
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (e.argv[0] === 'git' && e.argv[1] === 'diff') return ok(API_DIFF)
    if (e.argv[0] === 'git' && e.argv[1] === 'rev-parse') return ok('abc123\n')
    if (e.argv[0] === 'git') return ok('')
    if (e.argv[0] === 'cmd') {
      w.files.delete(norm(e.argv[4]))
      return ok('')
    }
    return ok('')
  })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.id', () => ({ value: SESSION }))
  on('session.cwd', () => ({ value: CWD }))
  on('command.register', (_$: any, e: any) => {
    w.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('store.get', (_$: any, e: any) => ({ value: w.store.get(e.key) }))
  on('store.set', (_$: any, e: any) => {
    w.store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_$: any, e: any) => {
    w.store.delete(e.key)
    return { value: undefined }
  })
  on('config.set', (_$: any, e: any) => {
    w.config.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  on('ui.open', (_$: any, e: any) => {
    w.opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.toast', (_$: any, e: any) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('model.complete', (_$: any, e: any) => {
    w.models.push(e)
    return { value: { isAnswered: true as const, text: answer, usage: USAGE } }
  })
  on('tool.list', () => ({ value: [{ name: 'mcp__ccd_sidebar__mark_completed' }] }) as never)
  on('tool.call', (_$: any, e: any) => {
    w.tools.push(e)
    return { result: 'ok', text: 'ok' } as never
  })
  on('prompt.context', () => ({ blocks: [] }) as never)
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['below me'] }))
  return w
}

describe('commands and triggers', () => {
  test('session start registers the four commands and opens no pane', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    expect(w.registered).toEqual(['done', 'learn', 'learn-now', 'learn-off'])
    expect(w.opened).toEqual([])
  })

  test('/done marks the session completed, learns in the background and records the run', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const out = await $.command.run(cmd('done', 'added retry'))
    expect(out.text).toContain('Marked done')
    expect(w.tools.some(t => t.tool === 'mcp__ccd_sidebar__mark_completed')).toBe(true)
    await w.clock.settle()
    expect(w.models).toHaveLength(1)
    expect(w.models[0]!.model).toBe('claude-haiku-5-5')
    expect([...w.files.keys()].some(k => k.endsWith('last-run.json'))).toBe(true)
    expect(w.toasts.length).toBeGreaterThan(0)
  })

  test('/learn-now learns once; a second call while running says so', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const a = await $.command.run(cmd('learn-now'))
    const b = await $.command.run(cmd('learn-now'))
    expect(a.text).toContain('Learning from this session')
    await w.clock.settle()
    expect(b.text).toContain('Already learning')
    await w.clock.settle()
    expect(w.models).toHaveLength(1)
  })

  test('/learn-off stops every trigger for the session', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await $.command.run(cmd('learn-off'))
    expect((await $.command.run(cmd('done'))).text).toContain('off for this session')
    expect((await $.command.run(cmd('learn-now'))).text).toContain('off for this session')
    await $.tool.call({ tool: 'Edit', file_path: `${CWD}/src/api.ts`, old_string: 'a', new_string: 'b' } as any)
    await $.session.end({ reason: 'other', sessionId: SESSION } as any)
    expect(w.runs.filter(r => r.env?.SESSION_LEARNER_WORKER)).toHaveLength(0)
    await w.clock.settle()
    expect(w.models).toHaveLength(0)
  })

  test('the mark-completed tool call is passed on unchanged and starts a run after it succeeds', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const r = await $.tool.call({ tool: 'mcp__ccd_sidebar__mark_completed', session_id: 'self' } as any)
    expect(r).toMatchObject({ result: 'ok', text: 'ok' })
    await w.clock.settle()
    expect(w.models).toHaveLength(1)
  })

  test('other tool calls pass on unchanged and a Skill load is counted', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const r = await $.tool.call({ tool: 'Skill', skill: 'api-helpers' } as any)
    expect(r).toMatchObject({ result: 'ok', text: 'ok' })
    expect((w.store.get('scorecards') as any)['api-helpers'].loads).toBe(1)
    await w.clock.settle()
    expect(w.models).toHaveLength(0)
  })

  test('session.end after an edit writes a job file and starts the detached worker', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await $.tool.call({ tool: 'Edit', file_path: `${CWD}/src/api.ts`, old_string: 'a', new_string: 'b' } as any)
    await $.session.end({ reason: 'other', sessionId: SESSION } as any)
    const jobs = [...w.files.keys()].filter(k => k.includes('/jobs/'))
    expect(jobs.length).toBe(1)
    const launch = w.runs.find(r => r.env?.SESSION_LEARNER_WORKER === '1')!
    expect(launch.env!.SESSION_LEARNER_JOB).toContain('/jobs/')
    expect(launch.argv.join(' ')).toContain('claude')
  })

  test('session.end with clear, or with no edits and no note, learns nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await $.session.end({ reason: 'other', sessionId: SESSION } as any)
    await $.tool.call({ tool: 'Edit', file_path: `${CWD}/src/api.ts`, old_string: 'a', new_string: 'b' } as any)
    await $.session.end({ reason: 'clear', sessionId: SESSION } as any)
    expect([...w.files.keys()].filter(k => k.includes('/jobs/'))).toHaveLength(0)
    expect(w.runs.filter(r => r.env?.SESSION_LEARNER_WORKER)).toHaveLength(0)
  })

  test('review mode off: no job at session end', { options: { reviewMode: 'off' } }, async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await $.tool.call({ tool: 'Edit', file_path: `${CWD}/src/api.ts`, old_string: 'a', new_string: 'b' } as any)
    await $.session.end({ reason: 'other', sessionId: SESSION } as any)
    expect([...w.files.keys()].filter(k => k.includes('/jobs/'))).toHaveLength(0)
  })

  test('a job left behind is picked up at the next session start and run once', { options: {} }, async ($, on) => {
    const w = world(on)
    const old = Date.UTC(2026, 9, 11, 11)
    w.files.set(`${HOME}/.claude/mods-data/session-learner/jobs/job9.json`, JSON.stringify({ id: 'job9', sessionId: SESSION, cwd: CWD, transcriptPath: TRANSCRIPT, startHead: 'abc123', note: '', reason: 'left behind', createdAt: old, state: 'pending' }))
    await $.session.start(START)
    await w.clock.advance(2000)
    await w.clock.settle()
    expect(w.models).toHaveLength(1)
    await $.session.start(START)
    await w.clock.advance(2000)
    await w.clock.settle()
    expect(w.models).toHaveLength(1)
  })

  test('inside the worker: no commands, no job at the end, prompts dropped', async ($, on) => {
    const w = world(on, { SESSION_LEARNER_WORKER: '1' })
    await $.session.start(START)
    expect(w.registered).toEqual([])
    await $.tool.call({ tool: 'Edit', file_path: `${CWD}/src/api.ts`, old_string: 'a', new_string: 'b' } as any)
    await $.session.end({ reason: 'other', sessionId: SESSION } as any)
    expect(w.runs.filter(r => r.env?.SESSION_LEARNER_WORKER)).toHaveLength(0)
  })
})

describe('the band', () => {
  for (const surface of SURFACES) {
    test(`hidden by default on ${surface}`, async ($, on) => {
      world(on)
      await $.session.start(START)
      const ui = await $.ui.mount(BAND(surface))
      expect(await ui.find({ text: /Memory:|Learned/ })).toBe(undefined)
      expect(await ui.find({ text: 'below me' })).toBeDefined()
      await ui.unmount()
    })

    test(`shown with showBand, with an Off button, and it yields to a survey on ${surface}`, SHOWN, async ($, on) => {
      const w = world(on)
      await $.session.start(START)
      const ui = await $.ui.mount(BAND(surface))
      expect(await ui.find({ text: 'Memory: nothing learned yet' })).toBeDefined()
      expect(await ui.find({ text: 'below me' })).toBeDefined()
      await ui.press({ key: 'band-off' })
      expect(w.config).toEqual([{ key: 'session-learner.showBand', value: false }])
      await ui.unmount()
      const survey = await $.ui.mount(BAND(surface, true))
      expect(await survey.find({ text: /Memory:|Learned/ })).toBe(undefined)
      await survey.unmount()
    })
  }

  test('after a run it reads Learned N lessons: M saved, K to review', SHOWN, async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await $.command.run(cmd('learn-now'))
    await w.clock.settle()
    const ui = await $.ui.mount(BAND('desktop'))
    expect(await ui.find({ text: 'Learned 1 lesson: 0 saved, 1 to review' })).toBeDefined()
    await ui.unmount()
  })

  test('/learn band on and off write the config row', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await $.command.run(cmd('learn', 'band on'))
    await $.command.run(cmd('learn', 'band off'))
    expect(w.config).toEqual([
      { key: 'session-learner.showBand', value: true },
      { key: 'session-learner.showBand', value: false },
    ])
    expect(w.opened).toEqual([])
  })
})

describe('the /learn pane', () => {
  test('/learn opens the pane', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const out = await $.command.run(cmd('learn'))
    expect(out.text).toBe('Session Learner opened.')
    expect(w.opened).toEqual([{ id: 'learn', title: 'Session Learner', focus: true }])
  })

  for (const surface of SURFACES) {
    test(`tabs, the empty state, a pending lesson, approve, and the Test button on ${surface}`, async ($, on) => {
      const w = world(on)
      await $.session.start(START)
      const ui = await $.ui.mount(PANE(surface))
      for (const tab of ['Lessons', 'Drafts', 'Skills', 'Changes', 'Runs']) expect(await ui.find({ key: `tab:${tab.toLowerCase()}` })).toBeDefined()
      expect(await ui.find({ key: 'band-toggle' })).toBeDefined()
      expect(await ui.find({ text: /No lessons here yet/ })).toBeDefined()
      await ui.unmount()

      await $.command.run(cmd('learn-now'))
      await w.clock.settle()
      const withLesson = await $.ui.mount(PANE(surface))
      expect(await withLesson.find({ text: /withRetry helper/ })).toBeDefined()
      expect(await withLesson.find({ text: /waiting for review/ })).toBeDefined()
      await withLesson.press({ key: 'test' })
      await w.clock.settle()
      expect(w.models).toHaveLength(2)
      expect(w.models[1]!.prompt).toContain('OK')
      const id = (await withLesson.findAll({ type: 'Button' })).map((b: any) => String(b.key)).find((k: string) => k.startsWith('approve:'))!
      await withLesson.press({ key: id })
      await w.clock.settle()
      expect(w.files.get(MEMORY)).toContain('withRetry helper')
      await withLesson.unmount()

      const runs = await $.ui.mount(PANE(surface))
      await runs.press({ key: 'tab:runs' })
      expect(await runs.find({ text: /found 1, saved 0/ })).toBeDefined()
      await runs.press({ key: 'tab:changes' })
      expect(await runs.find({ text: /Approved lesson/ })).toBeDefined()
      await runs.unmount()
    })

    test(`the band toggle shows the state and writes the config row on ${surface}`, async ($, on) => {
      const w = world(on)
      await $.session.start(START)
      const ui = await $.ui.mount(PANE(surface))
      expect(await ui.find({ text: 'Band: off' })).toBeDefined()
      await ui.press({ key: 'band-toggle' })
      expect(w.config).toEqual([{ key: 'session-learner.showBand', value: true }])
      await ui.unmount()
    })
  }

  test('controlled mode saves a low-risk lesson by itself and the Changes tab can roll it back', CONTROLLED, async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await $.command.run(cmd('learn-now'))
    await w.clock.settle()
    expect(w.files.get(MEMORY)).toContain('withRetry helper')
    const ui = await $.ui.mount(PANE('desktop'))
    await ui.press({ key: 'tab:changes' })
    const key = (await ui.findAll({ type: 'Button' })).map((b: any) => String(b.key)).find((k: string) => k.startsWith('rollback:'))!
    await ui.press({ key })
    expect(w.files.get(MEMORY) ?? '').not.toContain('withRetry helper')
    await ui.unmount()
  })
})

describe('the next-session brief', () => {
  test('prompt.context adds a block of under 1500 characters with the active lessons', CONTROLLED, async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await $.command.run(cmd('learn-now'))
    await w.clock.settle()
    const out: any = await $.prompt.context({ blocks: [] } as any)
    const block = out.blocks.find((b: any) => b.name === 'sessionLearner')
    expect(block.text).toContain('withRetry')
    expect(block.text.length).toBeLessThan(1500)
  })
})

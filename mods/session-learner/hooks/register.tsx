import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Draft, LearnerData, LearnerSession, LearnerStatus, LearnerTab, LearnerView, Lesson, LessonKind, ReviewMode, Run } from '../types'
import type { Io } from './lib/io'
import { folderKey, homeDir, isWindows, joinPath, normPath } from './lib/paths'
import { listSkills } from './lib/skills'
import { filterLessons } from './lessons'
import {
  approveLesson,
  computeBrief,
  dataDir,
  deleteLessons,
  editDraft,
  editLesson,
  installDraft,
  loadData,
  mergeLesson,
  mergeTarget,
  moveLesson,
  newJob,
  pendingCount,
  pickUpJobs,
  rejectDraft,
  rejectLesson,
  rollBack,
  runJobFile,
  saveData,
  writeJob,
  LEARN_MODEL,
} from './pipeline'
import type { ActionResult, Data, Host } from './pipeline'
import { bandLine, endCounts, isInstalledRoot, projectSlug, readSettings, summaryText, warningOf, workerArgv } from './run'
import type { Settings } from './run'
import { compareBeforeAfter, correctionRate, trendOf, unifiedDiff } from './skillopt'
import { clip, newId } from './text'

const PLUGIN = 'session-learner'
const PANE = 'learn'
const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']
const MARK_COMPLETED = 'mcp__ccd_sidebar__mark_completed'

const sessionRef = { plugin: 'session-learner', key: 'session' } as const
const statusRef = { plugin: 'session-learner', key: 'status' } as const
const viewRef = { plugin: 'session-learner', key: 'view' } as const
const dataRef = { plugin: 'session-learner', key: 'data' } as const
const bandPickRef = { plugin: 'session-learner', key: 'bandPick' } as const

const NO_SESSION: LearnerSession = { id: '', cwd: '', startHead: '', transcriptPath: '', edits: 0, isOff: false, isQueued: false, note: '' }
const NO_STATUS: LearnerStatus = { isRunning: false, lastRun: null, warning: null, pending: 0 }
const NO_VIEW: LearnerView = { tab: 'lessons', kind: 'all', store: 'all', search: '', editing: null, editText: '', confirm: null, notice: null, test: null }
const NO_DATA: LearnerData = { lessons: [], drafts: [], changes: [], runs: [], cards: [] }
const KINDS: Array<'all' | LessonKind> = ['all', 'convention', 'pitfall', 'correction', 'procedure']
const STORES: LearnerView['store'][] = ['all', 'pending', 'project', 'user', 'stale']
const MODES: ReviewMode[] = ['off', 'suggest', 'controlled', 'advanced']
const TABS: Array<{ id: LearnerTab; label: string }> = [
  { id: 'lessons', label: 'Lessons' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'skills', label: 'Skills' },
  { id: 'changes', label: 'Changes' },
  { id: 'runs', label: 'Runs' },
  { id: 'settings', label: 'Settings' },
]

// Copied from mods/_shared/hooks/register.ts: `$` can only be followed into a function of the same file.
const makeIo = ($: EngineInterface): Io => ({
  fs: {
    read: path => $.fs.read(path),
    exists: path => $.fs.exists(path),
    list: path => $.fs.list(path),
    stat: path => $.fs.stat(path),
  },
  http: { fetch: (url, init) => $.http.fetch(url, init) },
  process: { run: (argv, init) => $.process.run(argv, init) },
  clock: { sleep: (ms, options) => $.clock.sleep(ms, options) },
  env: {
    OS: () => $.env.get('OS'),
    USERPROFILE: () => $.env.get('USERPROFILE'),
    HOME: () => $.env.get('HOME'),
    HOMEDRIVE: () => $.env.get('HOMEDRIVE'),
    HOMEPATH: () => $.env.get('HOMEPATH'),
    TMPDIR: () => $.env.get('TMPDIR'),
    TEMP: () => $.env.get('TEMP'),
    TMP: () => $.env.get('TMP'),
    HINDSIGHT_CHANNEL_ID: () => $.env.get('HINDSIGHT_CHANNEL_ID'),
    HINDSIGHT_USER_ID: () => $.env.get('HINDSIGHT_USER_ID'),
  },
})

async function hostOf($: EngineInterface): Promise<Host> {
  const io = makeIo($)
  const home = await homeDir(io)
  const configured = await $.env.get('CLAUDE_CONFIG_DIR')
  const configDir = configured ? normPath(configured) : joinPath(home ?? '.', '.claude')
  const windows = await isWindows(io)
  return {
    io,
    home,
    configDir,
    write: (path, text) => $.fs.write(path, text),
    remove: async path => {
      const argv = windows ? ['cmd', '/c', 'del', '/f', '/q', path.replace(/\//g, '\\')] : ['rm', '-f', path]
      try {
        await $.process.run(argv, { timeoutMs: 10000 })
      } catch {
        // checked below
      }
      return !(await $.fs.exists(path).catch(() => true))
    },
    now: () => $.clock.now(),
    complete: async req => {
      const r = await $.model.complete({ model: req.model, prompt: req.prompt, maxTokens: req.maxTokens, ...(req.system ? { system: req.system } : {}), ...(req.effort ? { effort: req.effort } : {}), ...(req.timeoutMs ? { timeoutMs: req.timeoutMs } : {}) })
      return r.isAnswered ? { isAnswered: true, text: r.text, usage: r.usage } : { isAnswered: false, reason: r.reason, usage: r.usage }
    },
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
  }
}

async function isWorker($: EngineInterface): Promise<boolean> {
  return !!(await $.env.get('SESSION_LEARNER_WORKER'))
}

async function getSession($: EngineInterface): Promise<LearnerSession> {
  return (await $.state.get(sessionRef)).value ?? NO_SESSION
}

async function patchSession($: EngineInterface, patch: Partial<LearnerSession>): Promise<LearnerSession> {
  const next = { ...(await getSession($)), ...patch }
  await $.state.set(sessionRef, next)
  return next
}

async function getStatus($: EngineInterface): Promise<LearnerStatus> {
  return (await $.state.get(statusRef)).value ?? NO_STATUS
}

async function patchStatus($: EngineInterface, patch: Partial<LearnerStatus>): Promise<void> {
  await $.state.set(statusRef, { ...(await getStatus($)), ...patch })
}

async function getView($: EngineInterface): Promise<LearnerView> {
  return (await $.state.get(viewRef)).value ?? NO_VIEW
}

async function patchView($: EngineInterface, patch: Partial<LearnerView>): Promise<void> {
  await $.state.set(viewRef, { ...(await getView($)), ...patch })
}

async function folderOf($: EngineInterface): Promise<string> {
  const s = await getSession($)
  if (s.cwd) return s.cwd
  try {
    return normPath(await $.session.cwd())
  } catch {
    return ''
  }
}

/** Mirrors the store into the state the pane and band draw from. */
async function refresh($: EngineInterface, d?: Data): Promise<Data> {
  const h = await hostOf($)
  const data = d ?? (await loadData(h))
  await $.state.set(dataRef, { lessons: data.lessons, drafts: data.drafts, changes: data.changes, runs: data.runs, cards: Object.values(data.cards) })
  const lastRun = (await $.store.get('lastRun').catch(() => undefined)) as LearnerStatus['lastRun'] | undefined
  const last = data.runs[data.runs.length - 1] ?? null
  await patchStatus($, { pending: pendingCount(data, folderKey(await folderOf($))), lastRun: lastRun ?? null, warning: warningOf(last) })
  return data
}

async function bandIsOn($: EngineInterface, showBand: boolean): Promise<boolean> {
  const pick = (await $.state.get(bandPickRef)).value
  return pick && pick.from === showBand ? pick.value : showBand
}

// Writes the plugin's own config row; if that is refused, keeps the choice in the store instead.
async function setBand($: EngineInterface, showBand: boolean, value: boolean): Promise<void> {
  await $.state.set(bandPickRef, { value, from: showBand })
  let isSaved = false
  try {
    const res = await $.config.set({ key: 'session-learner.showBand', value })
    isSaved = res?.deny === undefined
  } catch {
    isSaved = false
  }
  try {
    if (isSaved) await $.store.delete('bandPick')
    else await $.store.set('bandPick', { value, from: showBand })
  } catch {
    // the state still holds it for this session
  }
}

async function setOption($: EngineInterface, field: string, value: string | number): Promise<string> {
  try {
    const res = await $.config.set({ key: `session-learner.${field}`, value })
    return res?.deny === undefined ? `Saved ${field}.` : `Not saved: ${res.deny}`
  } catch (e) {
    return `Not saved: ${e instanceof Error ? e.message : String(e)}`
  }
}

/** Starts a learning run on this session in the background: a job file first, so a crash is picked up later. */
async function learnHere($: EngineInterface, settings: Settings, reason: string): Promise<string> {
  const s = await getSession($)
  if (s.isOff) return 'Learning is off for this session (/learn-off).'
  if (settings.reviewMode === 'off') return 'Review mode is off, so nothing is learned. Change it in /learn or /config.'
  if ((await getStatus($)).isRunning) return 'Already learning from this session.'
  const h = await hostOf($)
  const now = await $.clock.now()
  const job = newJob({ sessionId: s.id || (await $.session.id()), cwd: s.cwd || (await folderOf($)), transcriptPath: s.transcriptPath, startHead: s.startHead, note: s.note, reason }, now)
  const path = await writeJob(h, job)
  await patchSession($, { isQueued: true })
  await patchStatus($, { isRunning: true })
  $.clock.after(0, () => {
    void (async () => {
      let run: Run | null = null
      try {
        run = await runJobFile(h, path, { settings, trigger: reason })
      } catch (e) {
        $.ui.toast(`Session Learner failed: ${e instanceof Error ? e.message : String(e)}`)
      }
      await patchStatus($, { isRunning: false })
      await refresh($)
      if (run) $.ui.toast(summaryText(run), { timeoutMs: 8000 })
    })()
  })
  return 'Learning from this session in the background. /learn shows what it found.'
}

async function act($: EngineInterface, fn: (h: Host, d: Data, now: number) => Promise<ActionResult> | ActionResult): Promise<void> {
  const h = await hostOf($)
  const d = await loadData(h)
  const now = await $.clock.now()
  let r: ActionResult
  try {
    r = await fn(h, d, now)
  } catch (e) {
    r = { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  if (r.ok) await saveData(h, d)
  await refresh($, r.ok ? d : undefined)
  await patchView($, { notice: r.message, confirm: null, ...(r.ok ? { editing: null, editText: '' } : {}) })
}

async function testModel($: EngineInterface): Promise<void> {
  await patchView($, { test: 'Testing the learn model...' })
  const t0 = await $.clock.now()
  const r = await $.model.complete({ model: LEARN_MODEL, prompt: 'Answer with the single word OK.', maxTokens: 200, effort: 'low', timeoutMs: 30000 })
  const ms = (await $.clock.now()) - t0
  await patchView($, {
    test: r.isAnswered ? `Test: ${LEARN_MODEL} answered "${clip(r.text.trim(), 40)}" in ${(ms / 1000).toFixed(1)} s. Nothing was stored.` : `Test: ${LEARN_MODEL} did not answer (${r.reason}).`,
  })
}

async function openDraftForEditing($: EngineInterface, d: Draft): Promise<void> {
  const h = await hostOf($)
  const path = joinPath(dataDir(h), 'drafts', `${d.id}.md`)
  await $.fs.write(path, d.after)
  await patchView($, { editing: d.id, editText: path, notice: `Edit the draft in ${path}, save it, then press Reload.` })
}

function plainList(d: LearnerData, project: string): string {
  const pending = d.lessons.filter(l => l.status === 'pending' && (l.project === project || l.scope === 'user'))
  const active = d.lessons.filter(l => l.status === 'active' && (l.project === project || l.scope === 'user'))
  const lines = [`Session Learner: ${active.length} active lessons, ${pending.length} waiting for review, ${d.drafts.filter(x => x.status === 'pending').length} skill drafts.`]
  for (const l of pending.slice(0, 10)) lines.push(`- (${l.kind}, waiting) ${l.text}`)
  for (const l of active.slice(-10)) lines.push(`- (${l.kind}) ${l.text}`)
  return lines.join('\n')
}

export const register: Register = (on, options) => {
  const showBand = options.showBand === true
  const settings = readSettings(options)

  on('session.start', async ($, e, next) => {
    if (await isWorker($)) {
      const jobPath = await $.env.get('SESSION_LEARNER_JOB')
      if (jobPath) {
        try {
          await runJobFile(await hostOf($), jobPath, { settings })
        } catch {
          // the job file stays; a later session start picks it up
        }
      }
      return next(e)
    }

    await $.command.register({ name: 'done', description: 'Mark this session done and learn from it', argumentHint: '[what was achieved]', immediate: true })
    await $.command.register({ name: 'learn', description: 'Open Session Learner: lessons, skill drafts, scorecards, changes and runs', argumentHint: '[band on|off]', immediate: true })
    await $.command.register({ name: 'learn-now', description: 'Learn from this session now', immediate: true })
    await $.command.register({ name: 'learn-off', description: 'Turn Session Learner off for this session', immediate: true })

    try {
      const saved = (await $.store.get('bandPick')) as { value?: unknown; from?: unknown } | undefined
      if (saved && typeof saved.value === 'boolean') await $.state.set(bandPickRef, { value: saved.value, from: saved.from === true })
    } catch {
      // keep the config value
    }

    const cwd = normPath(e.cwd)
    let id = ''
    try {
      id = await $.session.id()
    } catch {
      id = ''
    }
    let startHead = ''
    try {
      const r = await $.process.run(['git', 'rev-parse', 'HEAD'], { cwd, timeoutMs: 5000 })
      if (r.exitCode === 0) startHead = r.stdout.trim()
    } catch {
      startHead = ''
    }
    const h = await hostOf($)
    const transcriptPath = id ? joinPath(h.configDir, 'projects', projectSlug(e.cwd), `${id}.jsonl`) : ''
    await $.state.set(sessionRef, { ...NO_SESSION, id, cwd, startHead, transcriptPath })
    await refresh($).catch(() => undefined)

    if (settings.reviewMode !== 'off') {
      $.clock.after(1500, () => {
        void (async () => {
          try {
            const runs = await pickUpJobs(await hostOf($), { settings })
            if (runs.length) {
              await refresh($)
              $.ui.toast(summaryText(runs[runs.length - 1]!), { timeoutMs: 8000 })
            }
          } catch {
            // tried again at the next session start
          }
        })()
      })
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (await $.env.get('SESSION_LEARNER_JOB')) return { drop: 'Session Learner worker: no turn is needed.' }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.context', async ($, e, next) => {
    const below = await next(e)
    if (settings.reviewMode === 'off' || (await isWorker($))) return below
    try {
      const h = await hostOf($)
      const since = Number((await $.store.get('briefAt')) ?? 0) || 0
      const text = await computeBrief(h, await folderOf($), since)
      await $.store.set('briefAt', await $.clock.now())
      if (!text) return below
      return { ...below, blocks: [...below.blocks.filter(b => b.name !== 'sessionLearner'), { name: 'sessionLearner', text }] }
    } catch {
      return below
    }
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    try {
      const tool = String(e.tool)
      const ok = r.deny === undefined && r.isError === undefined
      if (!ok) return r
      if (EDIT_TOOLS.includes(tool)) {
        const s = await getSession($)
        await $.state.set(sessionRef, { ...s, edits: s.edits + 1 })
      } else if (tool === 'Skill') {
        const skill = (e as { skill?: unknown }).skill
        if (typeof skill === 'string' && skill) {
          const cards = ((await $.store.get('scorecards')) ?? {}) as Record<string, { name: string; loads: number; history: unknown[] }>
          const card = cards[skill] ?? { name: skill, loads: 0, history: [] }
          cards[skill] = { ...card, loads: card.loads + 1 }
          await $.store.set('scorecards', cards)
        }
      } else if (tool === MARK_COMPLETED) {
        const target = (e as { session_id?: unknown }).session_id
        const s = await getSession($)
        if ((target === 'self' || target === s.id) && !s.isQueued && !(await isWorker($))) await learnHere($, settings, 'marked completed')
      }
    } catch {
      // observing only; the call's result goes back unchanged
    }
    return r
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    try {
      if (!(await isWorker($)) && endCounts(e.reason) && settings.reviewMode !== 'off') {
        const s = await getSession($)
        if (!s.isOff && !s.isQueued && (s.edits > 0 || s.note) && s.id) {
          const h = await hostOf($)
          const job = newJob({ sessionId: s.id, cwd: s.cwd, transcriptPath: s.transcriptPath, startHead: s.startHead, note: s.note, reason: `session ended (${e.reason})` }, await $.clock.now())
          const path = await writeJob(h, job)
          const argv = workerArgv({ windows: await isWindows(h.io, s.cwd), pluginDir: isInstalledRoot($.plugin.root, h.home) ? null : $.plugin.root })
          await $.process.run(argv, { cwd: s.cwd, env: { SESSION_LEARNER_WORKER: '1', SESSION_LEARNER_JOB: path }, timeoutMs: 5000 }).catch(() => undefined)
        }
      }
    } catch {
      // a job not started here is picked up at the next session start
    }
    return next(e)
  })

  on('command.run', { command: 'done' }, async ($, e) => {
    const note = e.args.trim()
    const s = await getSession($)
    if (s.isOff) return { text: 'Learning is off for this session (/learn-off).' }
    if (s.isQueued) return { text: 'This session is already marked done; Session Learner has it.' }
    await patchSession($, { note, isQueued: true })
    try {
      const tools = await $.tool.list()
      if (tools.some(t => t.name === MARK_COMPLETED)) await $.tool.call({ tool: MARK_COMPLETED, session_id: 'self' } as never)
    } catch {
      // the sidebar flag is a courtesy; learning goes on
    }
    await patchSession($, { isQueued: false })
    const text = await learnHere($, settings, note ? `/done: ${note}` : '/done')
    return { text: `Marked done. ${text}` }
  })

  on('command.run', { command: 'learn-now' }, async $ => ({ text: await learnHere($, settings, '/learn-now') }))

  on('command.run', { command: 'learn-off' }, async $ => {
    await patchSession($, { isOff: true })
    return { text: 'Session Learner is off for this session: /done, the completed flag and closing the session will not learn from it.' }
  })

  on('command.run', { command: 'learn' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words[0] === 'band') {
      if (words[1] === 'on' || words[1] === 'off') {
        await setBand($, showBand, words[1] === 'on')
        return { text: `Session Learner band ${words[1]}.` }
      }
      return { text: `Session Learner band: ${(await bandIsOn($, showBand)) ? 'on' : 'off'}. Use /learn band on or /learn band off.` }
    }
    const d = await refresh($)
    await patchView($, { notice: null, confirm: null })
    const opened = await $.ui.open({ id: PANE, title: 'Session Learner', focus: true })
    if (opened.isPlaced) return { text: 'Session Learner opened.' }
    return { text: plainList({ ...d, cards: Object.values(d.cards) }, folderKey(await folderOf($))) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || !(await bandIsOn($, showBand))) return below
    const { Box, Text, Button } = $.ui.resolve(e)
    const line = bandLine(await getStatus($))
    const mine = (
      <Box key="session-learner-band" gap={1}>
        <Text dimColor wrap="truncate-end">
          {line}
        </Text>
        <Button key="band-off" plain label="Off" onPress={() => setBand($, showBand, false)} />
      </Box>
    )
    return <Box flexDirection="column">{below ? [mine, below] : [mine]}</Box>
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Code } = els
    const Input = e.surface !== 'mobile' && 'Input' in els ? els.Input : undefined
    const view = await getView($)
    const data = (await $.state.get(dataRef)).value ?? NO_DATA
    const status = await getStatus($)
    const project = folderKey(await folderOf($))
    const isBandOn = await bandIsOn($, showBand)


    const header = (
      <Box key="head" flexDirection="column">
        <Text bold>{`Session Learner  ${bandLine(status)}`}</Text>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {TABS.map(t => (
            <Button key={`tab:${t.id}`} label={t.label} variant={view.tab === t.id ? 'primary' : 'secondary'} onPress={() => patchView($, { tab: t.id, editing: null, confirm: null, notice: null })} />
          ))}
          <Button key="band-toggle" label={`Band: ${isBandOn ? 'on' : 'off'}`} onPress={() => setBand($, showBand, !isBandOn)} />
          <Button key="test" label="Test" onPress={() => testModel($)} />
        </Box>
        {view.test !== null && <Text dimColor>{view.test}</Text>}
        {view.notice !== null && <Text color="warning">{view.notice}</Text>}
        {view.confirm !== null && (
          <Box key="confirm" gap={1}>
            <Text color="warning">{view.confirm.text}</Text>
            <Button
              key="confirm-yes"
              label="Delete"
              variant="primary"
              onPress={async () => {
                const c = (await getView($)).confirm
                if (c) await act($, (h, d, now) => deleteLessons(h, d, c.ids, now))
              }}
            />
            <Button key="confirm-no" label="Cancel" onPress={() => patchView($, { confirm: null })} />
          </Box>
        )}
      </Box>
    )

    const body: RenderChildren[] = []
    if (view.tab === 'lessons') {
      const shown = filterLessons(data.lessons as Lesson[], { kind: view.kind, store: view.store, search: view.search, project })
      body.push(
        <Box key="filters" gap={1} flexWrap="wrap">
          <Button key="filter-kind" label={`Kind: ${view.kind}`} onPress={() => patchView($, { kind: KINDS[(KINDS.indexOf(view.kind) + 1) % KINDS.length]! })} />
          <Button key="filter-store" label={`Store: ${view.store}`} onPress={() => patchView($, { store: STORES[(STORES.indexOf(view.store) + 1) % STORES.length]! })} />
          {Input && <Input key="search" label="Search" placeholder="words in a lesson" value={view.search} submitLabel="search" onInput={v => void patchView($, { search: v })} onSubmit={v => void patchView($, { search: v })} />}
          {shown.length > 1 && (
            <Button key="delete-shown" label={`Delete all shown (${shown.length})`} onPress={() => patchView($, { confirm: { action: 'delete', ids: shown.map(l => l.id), text: `Delete ${shown.length} lessons? ${shown.filter(l => l.stores.includes('memory')).length} are in project memory.` } })} />
          )}
        </Box>,
      )
      if (shown.length === 0) body.push(<Text key="none" dimColor>No lessons here yet. /done or /learn-now learns from this session.</Text>)
      for (const l of shown) {
        const target = l.status === 'active' ? mergeTarget(data.lessons as Lesson[], l) : null
        const isEditing = view.editing === l.id && Input
        body.push(
          <Box key={`lesson:${l.id}`} flexDirection="column">
            <Text wrap="wrap">{`(${l.kind}) ${l.text}`}</Text>
            <Text dimColor wrap="wrap">
              {[`${l.scope}`, l.status === 'pending' ? 'waiting for review' : l.status, l.stores.length ? `in ${l.stores.join(', ')}` : '', l.files.length ? `files: ${l.files.join(', ')}` : '', l.symbols.length ? `symbols: ${l.symbols.join(', ')}` : '', l.skill ? `skill: ${l.skill}` : '', l.hold ? `held: ${l.hold}` : '']
                .filter(Boolean)
                .join(' | ')}
            </Text>
            {isEditing && Input ? (
              <Box gap={1}>
                <Input key="edit-lesson" label="Lesson" value={view.editText} autoFocus submitLabel="save" onInput={v => void patchView($, { editText: v })} onSubmit={v => act($, (h, d, now) => editLesson(h, d, l.id, v, now))} />
                <Button key="edit-cancel" label="Cancel" onPress={() => patchView($, { editing: null, editText: '' })} />
              </Box>
            ) : (
              <Box gap={1} flexWrap="wrap">
                {l.status === 'pending' && <Button key={`approve:${l.id}`} label="Approve" variant="primary" onPress={() => act($, (h, d, now) => approveLesson(h, d, l.id, now))} />}
                {Input && l.status !== 'stale' && <Button key={`edit:${l.id}`} label="Edit" onPress={() => patchView($, { editing: l.id, editText: l.text, notice: null })} />}
                {l.status === 'pending' && <Button key={`reject:${l.id}`} label="Reject" onPress={() => act($, (_h, d, now) => rejectLesson(d, l.id, now))} />}
                {l.status !== 'stale' && <Button key={`move:${l.id}`} label={`Move to ${l.scope === 'project' ? 'user' : 'project'}`} onPress={() => act($, (h, d, now) => moveLesson(h, d, l.id, now))} />}
                {target && <Button key={`merge:${l.id}`} label="Merge" onPress={() => act($, (h, d, now) => mergeLesson(h, d, l.id, now))} />}
                <Button key={`delete:${l.id}`} label="Delete" onPress={() => patchView($, { confirm: { action: 'delete', ids: [l.id], text: `Delete 1 lesson? ${l.stores.length ? `It is in ${l.stores.length} store${l.stores.length === 1 ? '' : 's'}.` : 'It is not saved anywhere yet.'}` } })} />
              </Box>
            )}
          </Box>,
        )
      }
    } else if (view.tab === 'drafts') {
      const drafts = (data.drafts as Draft[]).filter(x => x.status === 'pending')
      const worse = data.cards.filter(c => c.isWorse)
      for (const c of worse) {
        const change = data.changes.find(x => x.id === c.changeId)
        body.push(
          <Box key={`worse:${c.name}`} gap={1}>
            <Text color="warning">{`Skill ${c.name} got worse after the change — roll back?`}</Text>
            {change && <Button key={`worse-rollback:${c.name}`} label="Roll back" onPress={() => act($, (h, d, now) => rollBack(h, d, change.id, now))} />}
          </Box>,
        )
      }
      if (drafts.length === 0) body.push(<Text key="none" dimColor>No skill drafts waiting.</Text>)
      for (const x of drafts) {
        body.push(
          <Box key={`draft:${x.id}`} flexDirection="column">
            <Text bold>{`${x.type === 'new' ? 'New skill' : x.type === 'fix' ? 'Fix' : x.type === 'rewrite' ? 'Rewrite' : 'Local override'}: ${x.skill}`}</Text>
            <Text dimColor wrap="wrap">{`${x.reason} Writes ${x.path}.`}</Text>
            {x.problems.map((p, i) => (
              <Text key={`problem:${x.id}:${i}`} color="error">{`Does not pass: ${p}`}</Text>
            ))}
            <Code key={`diff:${x.id}`} source={unifiedDiff(x.before, x.after)} format="diff" language="markdown" wrap="wrap" />
            <Box gap={1}>
              {x.problems.length === 0 && <Button key={`approve-draft:${x.id}`} label="Approve" variant="primary" onPress={() => act($, (h, d, now) => installDraft(h, d, x.id, false, now))} />}
              {view.editing === x.id ? (
                <Button
                  key={`reload-draft:${x.id}`}
                  label="Reload"
                  onPress={async () => {
                    const path = (await getView($)).editText
                    const text = await $.fs.read(path).catch(() => null)
                    if (text === null) return patchView($, { notice: `Could not read ${path}.` })
                    const h = await hostOf($)
                    const installed = (await listSkills(h.io, await folderOf($))).skills.map(s => s.name)
                    await act($, (_h, d) => editDraft(d, x.id, text, installed))
                  }}
                />
              ) : (
                <Button key={`edit-draft:${x.id}`} label="Edit" onPress={() => openDraftForEditing($, x)} />
              )}
              <Button key={`reject-draft:${x.id}`} label="Reject" onPress={() => act($, (_h, d) => rejectDraft(d, x.id))} />
            </Box>
          </Box>,
        )
      }
    } else if (view.tab === 'skills') {
      if (data.cards.length === 0) body.push(<Text key="none" dimColor>No skill loads seen yet.</Text>)
      for (const c of [...data.cards].sort((a, b) => b.loads - a.loads)) {
        const last = trendOf(c.history.slice(-5))
        const prev = trendOf(c.history.slice(-10, -5))
        const arrow = (a: number, b: number) => (prev.sessions === 0 ? '' : a > b ? ' (up)' : a < b ? ' (down)' : ' (same)')
        const cmp = compareBeforeAfter(c)
        body.push(
          <Box key={`card:${c.name}`} flexDirection="column">
            <Text bold>{c.name}</Text>
            <Text wrap="wrap">
              {`Loaded ${c.loads} times. Last ${last.sessions} sessions: ${last.corrections} with a correction${arrow(last.corrections, prev.corrections)}, ${last.interrupts} interrupts${arrow(last.interrupts, prev.interrupts)}, ${last.failures} tool failures in the loading turn${arrow(last.failures, prev.failures)}, ${last.avgTurns ?? '-'} turns from loading to done. Correction rate ${Math.round(correctionRate(c) * 100)}%.`}
            </Text>
            {cmp && <Text dimColor>{cmp.isReady ? `After the change: ${cmp.after.corrections} corrections and ${cmp.after.interrupts} interrupts in 5 sessions, against ${cmp.before.corrections} and ${cmp.before.interrupts} in the ${cmp.before.sessions} before.` : `Changed; ${cmp.after.sessions} of 5 sessions seen since.`}</Text>}
            {c.isWorse && <Text color="warning">{`Skill ${c.name} got worse after the change — roll back? (Drafts or Changes tab)`}</Text>}
          </Box>,
        )
      }
    } else if (view.tab === 'changes') {
      const list = [...data.changes].reverse().slice(0, 40)
      if (list.length === 0) body.push(<Text key="none" dimColor>No changes yet.</Text>)
      for (const c of list) {
        body.push(
          <Box key={`change:${c.id}`} flexDirection="column">
            <Text wrap="wrap">{`${new Date(c.at).toISOString().slice(0, 16).replace('T', ' ')}  ${c.title}${c.isAuto ? ' (automatic)' : ''}${c.isRolledBack ? ' (rolled back)' : ''}`}</Text>
            {c.before !== null && c.kind !== 'skill' && <Text dimColor wrap="wrap">{`Before: ${clip(c.before, 200)}`}</Text>}
            {c.after !== null && c.kind !== 'skill' && <Text dimColor wrap="wrap">{`After: ${clip(c.after, 200)}`}</Text>}
            {(c.notes ?? []).map((n, i) => (
              <Text key={`note:${c.id}:${i}`} dimColor>
                {n}
              </Text>
            ))}
            {!c.isRolledBack && !c.title.startsWith('Rolled back') && !c.title.startsWith('Deleted') && <Button key={`rollback:${c.id}`} label="Roll back" onPress={() => act($, (h, d, now) => rollBack(h, d, c.id, now))} />}
          </Box>,
        )
      }
    } else if (view.tab === 'runs') {
      const list = [...data.runs].reverse().slice(0, 20)
      if (list.length === 0) body.push(<Text key="none" dimColor>No runs yet.</Text>)
      for (const r of list) {
        body.push(
          <Box key={`run:${r.id}`} flexDirection="column">
            <Text wrap="wrap">{`${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')}  ${r.trigger}  ${r.state === 'skipped' ? `skipped: ${r.skip}` : r.state === 'error' ? 'error' : `found ${r.found}, saved ${r.saved}, to review ${r.review}, merged ${r.merged}, stale ${r.stale}, drafts ${r.drafts}`}`}</Text>
            <Text dimColor wrap="wrap">{`${r.cwd} | ${r.modelCalls} model calls, ${r.tokens} tokens, $${r.spendUsd.toFixed(4)}${r.budgetStop ? ` | stopped: ${r.budgetStop}` : ''}`}</Text>
            {[...r.errors.map(x => `Error: ${x}`), ...r.skippedStores.map(x => `Skipped store: ${x}`), ...r.notes.slice(0, 6)].map((n, i) => (
              <Text key={`runnote:${r.id}:${i}`} dimColor wrap="wrap">
                {n}
              </Text>
            ))}
          </Box>,
        )
      }
    } else {
      const fields: Array<{ key: keyof Settings; label: string }> = [
        { key: 'maxModelCalls', label: 'Max model calls per run' },
        { key: 'maxTokens', label: 'Max tokens per run' },
        { key: 'maxChanges', label: 'Max changes per run' },
        { key: 'dailySpendUsd', label: 'Daily spend cap in USD (0 = no cap)' },
      ]
      body.push(
        <Button key="mode" label={`Review mode: ${settings.reviewMode}`} onPress={async () => patchView($, { notice: await setOption($, 'reviewMode', MODES[(MODES.indexOf(settings.reviewMode) + 1) % MODES.length]!) })} />,
      )
      body.push(<Text key="mode-help" dimColor wrap="wrap">off: nothing runs. suggest: everything waits here. controlled: low-risk lessons apply themselves. advanced: passing skill drafts apply too.</Text>)
      for (const f of fields) {
        if (Input) {
          body.push(
            <Input
              key={`set:${f.key}`}
              label={`${f.label}:`}
              value={String(settings[f.key])}
              submitLabel="save"
              onSubmit={async v => {
                const n = Number(v)
                await patchView($, { notice: Number.isFinite(n) && n >= 0 ? await setOption($, f.key, n) : 'Enter a number of 0 or more.' })
              }}
            />,
          )
        } else body.push(<Text key={`set:${f.key}`}>{`${f.label}: ${settings[f.key]} (change it in /config)`}</Text>)
      }
    }


    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {body}
      </Box>
    )
  })
}



/** The learning run and the review actions, over a Host the register file builds from `$`. */
import type { Change, Draft, Job, LastRun, Lesson, Run, SkillCard } from '../types'
import { parseDiff, parseTranscript, parseUntracked, renderDiff, renderTail } from './evidence'
import type { Diff, Transcript } from './evidence'
import { NOT_INDEXED, cleanQuery, explore, findIndex } from './lib/codegraph'
import { loadHindsight, recall, resolveProjectBank, retain, userBank } from './lib/hindsight'
import type { HindsightConfig } from './lib/hindsight'
import type { Io } from './lib/io'
import { folderKey, isWindows, joinPath, normPath } from './lib/paths'
import { listSkills, parseFrontmatter } from './lib/skills'
import type { SkillInfo } from './lib/skills'
import { appliesItself, checkAgainstEvidence, findContradiction, findDuplicate, isStale, mergeInto, parseLessons, riskOf } from './lessons'
import type { Candidate } from './lessons'
import {
  addMemoryLine,
  briefLines,
  buildBrief,
  skillsChangedSince,
  changeBudgetStop,
  costOf,
  DEAD_AFTER_MS,
  ensurePointer,
  jobsToPickUp,
  parseJob,
  gateReason,
  lastRunOf,
  modelBudgetStop,
  projectSlug,
  removeMemoryLine,
  spendFor,
  tokensOf,
  MEMORY_FILE,
} from './run'
import type { Settings, Spent, Usage } from './run'
import {
  addSession,
  compareBeforeAfter,
  fixDraftText,
  groupProcedures,
  needsRewrite,
  newSkillDraft,
  rewritePrompt,
  sessionOutcome,
  topicWords,
  unfence,
  validateDraft,
} from './skillopt'
import { clip, dayOf, newId, scrubSecrets, similarity } from './text'

export const LEARN_MODEL = 'claude-haiku-5-5'
export const REWRITE_MODEL = 'claude-sonnet-5-5'
export const LEARN_REPLY_TOKENS = 4000
export const REWRITE_REPLY_TOKENS = 8000
const CAP = { lessons: 600, drafts: 100, changes: 300, runs: 60 }

export type CompleteRequest = { model: string; prompt: string; system?: string; maxTokens: number; effort?: 'low' | 'medium' | 'high'; timeoutMs?: number }
export type CompleteResult = { isAnswered: boolean; text?: string; reason?: string; usage?: Usage }

export type Host = {
  io: Io
  write: (path: string, text: string) => Promise<void>
  /** Best effort; resolves false when the file could not be removed. */
  remove: (path: string) => Promise<boolean>
  now: () => Promise<number>
  complete: (req: CompleteRequest) => Promise<CompleteResult>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  /** ~/.claude, or CLAUDE_CONFIG_DIR. */
  configDir: string
  home: string | null
}

// ---------- the store ----------

export type Data = { lessons: Lesson[]; drafts: Draft[]; changes: Change[]; runs: Run[]; cards: Record<string, SkillCard> }

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export async function loadData(h: Host): Promise<Data> {
  const [lessons, drafts, changes, runs, cards] = await Promise.all(['lessons', 'drafts', 'changes', 'runs', 'scorecards'].map(k => h.storeGet(k).catch(() => undefined)))
  return {
    lessons: arr<Lesson>(lessons),
    drafts: arr<Draft>(drafts),
    changes: arr<Change>(changes),
    runs: arr<Run>(runs),
    cards: cards && typeof cards === 'object' && !Array.isArray(cards) ? (cards as Record<string, SkillCard>) : {},
  }
}

export async function saveData(h: Host, d: Data): Promise<void> {
  await h.storeSet('lessons', d.lessons.slice(-CAP.lessons))
  await h.storeSet('drafts', d.drafts.slice(-CAP.drafts))
  await h.storeSet('changes', d.changes.slice(-CAP.changes))
  await h.storeSet('runs', d.runs.slice(-CAP.runs))
  await h.storeSet('scorecards', d.cards)
}

export function dataDir(h: Host): string {
  return joinPath(h.configDir, 'mods-data/session-learner')
}

export function jobsDir(h: Host): string {
  return joinPath(dataDir(h), 'jobs')
}

export async function writeLastRun(h: Host, last: LastRun): Promise<void> {
  await h.storeSet('lastRun', last).catch(() => undefined)
  await h.write(joinPath(dataDir(h), 'last-run.json'), `${JSON.stringify(last, null, 2)}\n`).catch(() => undefined)
}

export function pendingCount(d: Data, project: string): number {
  return d.lessons.filter(l => l.status === 'pending' && (l.project === project || l.scope === 'user')).length + d.drafts.filter(x => x.status === 'pending').length
}

// ---------- evidence ----------

async function readTail(h: Host, path: string): Promise<string | null> {
  const windows = await isWindows(h.io, path)
  const argv = windows
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', 'Get-Content -LiteralPath $env:SL_FILE -Tail 4000 -Encoding UTF8']
    : ['tail', '-n', '4000', path]
  try {
    const r = await h.io.process.run(argv, { env: { SL_FILE: path }, timeoutMs: 30000 })
    return r.exitCode === 0 && r.stdout.trim() ? r.stdout : null
  } catch {
    return null
  }
}

/** The transcript: the recorded path, else the derived one, else a search of the projects folder; a tail when too big. */
export async function readTranscript(h: Host, job: Pick<Job, 'transcriptPath' | 'cwd' | 'sessionId'>): Promise<string | null> {
  const projects = joinPath(h.configDir, 'projects')
  const candidates = [job.transcriptPath, joinPath(projects, projectSlug(job.cwd), `${job.sessionId}.jsonl`)].filter(Boolean)
  for (const c of candidates) {
    if (!(await h.io.fs.exists(c).catch(() => false))) continue
    try {
      return await h.io.fs.read(c)
    } catch {
      const tail = await readTail(h, c)
      if (tail) return tail
    }
  }
  try {
    for (const e of await h.io.fs.list(projects)) {
      if (e.kind !== 'dir') continue
      const p = joinPath(projects, e.name, `${job.sessionId}.jsonl`)
      if (await h.io.fs.exists(p)) return await h.io.fs.read(p).catch(() => readTail(h, p))
    }
  } catch {
    // no projects folder
  }
  return null
}

export async function git(h: Host, cwd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const r = await h.io.process.run(['git', ...args], { cwd, timeoutMs: 20000 })
    return { ok: r.exitCode === 0, out: r.stdout }
  } catch {
    return { ok: false, out: '' }
  }
}

export async function gitDiffSince(h: Host, cwd: string, startHead: string): Promise<Diff> {
  if (!startHead) return parseDiff('')
  const diff = await git(h, cwd, ['diff', startHead, '--unified=0', '--no-color', '--no-ext-diff'])
  const status = await git(h, cwd, ['status', '--porcelain'])
  return parseDiff(diff.ok ? diff.out : '', status.ok ? parseUntracked(status.out) : [])
}

// ---------- the learn prompt ----------

export const LEARN_SYSTEM = 'You extract durable lessons from a Claude Code session for a memory system. Answer with JSON only.'

export function learnPrompt(p: { tail: string; diff: string; graph: string; known: string[]; skills: string[]; note: string }): string {
  return scrubSecrets(
    [
      'Find at most 8 lessons in this session worth remembering in later sessions. Kinds:',
      '- convention: how this project does something.',
      '- pitfall: something broke, and why.',
      '- correction: the user corrected Claude (look at the prompt after each reply).',
      '- procedure: steps that worked and will be repeated.',
      'Rules: one sentence each. No secrets, no file contents. Name only files and symbols that appear below.',
      'scope is "user" only for facts about the user that hold in every project; otherwise "project".',
      'For a correction about a skill Claude loaded (listed below), put the skill name in "skill".',
      'Skip anything already in the known lessons. If nothing is worth keeping, answer [].',
      'Answer with a JSON array of objects: {"kind", "text", "scope", "files": [], "symbols": [], "skill"?}.',
      '',
      `Skills Claude loaded: ${p.skills.length ? p.skills.join(', ') : 'none'}`,
      p.note ? `The user's note when finishing: ${p.note}` : '',
      `Known lessons:\n${p.known.length ? p.known.map(k => `- ${k}`).join('\n') : '- none'}`,
      `Changes since the session started:\n${p.diff}`,
      p.graph ? `CodeGraph on the touched symbols:\n${p.graph}` : '',
      `Transcript:\n${p.tail}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  )
}

// ---------- stores ----------

type HindsightCtx = { config: HindsightConfig; projectBank: string; userBank: string } | null

async function hindsightFor(h: Host, cwd: string): Promise<{ ctx: HindsightCtx; reason: string | null }> {
  const loaded = await loadHindsight(h.io)
  if (!loaded.ok) return { ctx: null, reason: loaded.reason }
  return { ctx: { config: loaded.config, projectBank: await resolveProjectBank(h.io, loaded.config, cwd), userBank: userBank(loaded.config) }, reason: null }
}

export function memoryDir(h: Host, cwd: string): string {
  return joinPath(h.configDir, 'projects', projectSlug(cwd), 'memory')
}

async function readOr(h: Host, path: string): Promise<string | null> {
  try {
    return (await h.io.fs.exists(path)) ? await h.io.fs.read(path) : null
  } catch {
    return null
  }
}

async function writeMemory(h: Host, l: Lesson): Promise<void> {
  const dir = memoryDir(h, l.cwd)
  const file = joinPath(dir, MEMORY_FILE)
  const next = addMemoryLine(await readOr(h, file), l.id, l.kind, l.text)
  await h.write(file, next)
  const index = joinPath(dir, 'MEMORY.md')
  const before = await readOr(h, index)
  const after = ensurePointer(before)
  if (after !== before) await h.write(index, after)
}

async function unwriteMemory(h: Host, l: Lesson): Promise<boolean> {
  const file = joinPath(memoryDir(h, l.cwd), MEMORY_FILE)
  const before = await readOr(h, file)
  const after = removeMemoryLine(before, l.id)
  if (after === null || after === before) return false
  await h.write(file, after)
  return true
}

/** Writes a lesson to its stores. Returns the stores written and the ones that failed. */
export async function applyLesson(h: Host, l: Lesson, hs: HindsightCtx, hsDown: string | null): Promise<{ stores: string[]; failed: string[] }> {
  const stores: string[] = []
  const failed: string[] = []
  if (hs && !hsDown) {
    const bank = l.scope === 'user' ? hs.userBank : hs.projectBank
    const r = await retain(h.io, hs.config, bank, [
      {
        content: `${l.text}${l.files.length ? ` (files: ${l.files.join(', ')})` : ''}`,
        context: `Session Learner ${l.kind} lesson`,
        documentId: `session-learner-${l.id}`,
        tags: ['session-learner', `kind:${l.kind}`],
        metadata: { kind: l.kind, scope: l.scope, session: l.sourceSession },
      },
    ])
    if (r.ok) stores.push(`hindsight:${bank}`)
    else failed.push(`Hindsight: ${r.reason}`)
  } else if (hsDown) {
    failed.push(`Hindsight: ${hsDown}`)
  }
  if (l.scope === 'project') {
    try {
      await writeMemory(h, l)
      stores.push('memory')
    } catch (e) {
      failed.push(`Project memory: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { stores, failed }
}

// ---------- the run ----------

export type RunOptions = { settings: Settings; trigger?: string; onPhase?: (phase: string) => void }

type Ctx = { h: Host; s: Settings; run: Run; spent: Spent; spend: { day: string; usd: number } }

async function callModel(c: Ctx, req: CompleteRequest): Promise<CompleteResult | { stop: string }> {
  const need = Math.ceil(req.prompt.length / 4) + req.maxTokens
  const stop = modelBudgetStop(c.s, c.spent, need)
  if (stop) return { stop }
  const r = await c.h.complete(req)
  const cost = costOf(req.model, r.usage)
  c.spent.modelCalls++
  c.spent.tokens += tokensOf(r.usage)
  c.spent.spendToday += cost
  c.spend.usd += cost
  c.run.modelCalls = c.spent.modelCalls
  c.run.tokens = c.spent.tokens
  c.run.spendUsd = Math.round((c.run.spendUsd + cost) * 1e6) / 1e6
  await c.h.storeSet('spend', c.spend).catch(() => undefined)
  return r
}

function recordChange(d: Data, c: Change): void {
  d.changes.push(c)
}

/** One learning run over one finished session. Never throws: failures land in the run's record. */
export async function runJob(h: Host, job: Job, opts: RunOptions): Promise<Run> {
  const now = await h.now()
  const project = folderKey(job.cwd)
  const run: Run = {
    id: newId(now, 'r'),
    at: now,
    sessionId: job.sessionId,
    cwd: normPath(job.cwd),
    trigger: opts.trigger ?? job.reason,
    state: 'done',
    found: 0,
    saved: 0,
    review: 0,
    merged: 0,
    stale: 0,
    drafts: 0,
    errors: [],
    skippedStores: [],
    modelCalls: 0,
    tokens: 0,
    spendUsd: 0,
    notes: [],
  }
  const d = await loadData(h)
  const finish = async (): Promise<Run> => {
    d.runs.push(run)
    try {
      await saveData(h, d)
    } catch (e) {
      run.errors.push(`could not save: ${e instanceof Error ? e.message : String(e)}`)
    }
    await writeLastRun(h, lastRunOf(run, pendingCount(d, project)))
    return run
  }
  try {
    if (opts.settings.reviewMode === 'off') {
      run.state = 'skipped'
      run.skip = 'review mode is off'
      return await finish()
    }
    await writeLastRun(h, { state: 'running', found: 0, saved: 0, review: pendingCount(d, project), at: now, cwd: run.cwd })
    const spend = spendFor(await h.storeGet('spend').catch(() => undefined), dayOf(now))
    const c: Ctx = { h, s: opts.settings, run, spent: { modelCalls: 0, tokens: 0, changes: 0, spendToday: spend.usd }, spend }

    opts.onPhase?.('reading the session')
    const raw = await readTranscript(h, job)
    if (raw === null) {
      run.state = 'error'
      run.errors.push('the session transcript was not found')
      return await finish()
    }
    const t = parseTranscript(raw)
    const diff = await gitDiffSince(h, job.cwd, job.startHead)
    const skip = gateReason({ userTurns: t.userTurns, approxTokens: t.approxTokens, corrections: t.corrections.length, changedFiles: diff.files.length })

    // The scorecard counts every session that loaded a skill, learned from or not.
    const installed = await listSkills(h.io, job.cwd).catch(() => ({ skills: [] as SkillInfo[], errors: [] }))
    updateCards(d, t, installed.skills, job.sessionId, now, [])

    if (skip) {
      run.state = 'skipped'
      run.skip = skip
      return await finish()
    }

    // CodeGraph, only where the repo is indexed
    const root = await findIndex(h.io, job.cwd)
    let graph = ''
    const touched = [...diff.declarations, ...diff.hunkFunctions].slice(0, 12)
    if (!root) run.notes.push(NOT_INDEXED)
    else if (touched.length) {
      const g = await explore(h.io, root, touched.join(' '), { maxFiles: 6, timeoutMs: 20000 })
      if (g.ok) graph = clip(g.text, 6000)
      else run.notes.push(`CodeGraph: ${g.reason}`)
    }

    // Hindsight: what is already known about these files and symbols
    const hsLoad = await hindsightFor(h, job.cwd)
    const hs = hsLoad.ctx
    let hsDown: string | null = hsLoad.reason
    let recalled: string[] = []
    if (hs) {
      const topic = [t.turns[0]?.prompt.slice(0, 200) ?? '', ...diff.files.slice(0, 10), ...touched].join(' ')
      const r = await recall(h.io, hs.config, hs.projectBank, scrubSecrets(topic), { types: ['observation', 'world'], maxTokens: 1500 })
      if (r.ok) recalled = r.results.map(x => x.text).slice(0, 15)
      else hsDown = r.reason
    }
    if (hsDown && hsDown !== 'not configured' && hsDown !== 'disabled') run.skippedStores.push(`Hindsight: ${hsDown}`)
    else if (hsDown) run.notes.push(`Hindsight: ${hsDown}`)

    // One learn call
    opts.onPhase?.('asking the learn model')
    const projectLessons = d.lessons.filter(l => (l.project === project || l.scope === 'user') && l.status !== 'rejected')
    const known = [...projectLessons.map(l => l.text).slice(-20), ...recalled]
    const tail = renderTail(t)
    const prompt = learnPrompt({
      tail,
      diff: renderDiff(diff),
      graph,
      known,
      skills: [...new Set(t.skillLoads.map(s => s.skill))],
      note: job.note,
    })
    const answer = await callModel(c, { model: LEARN_MODEL, system: LEARN_SYSTEM, prompt, maxTokens: LEARN_REPLY_TOKENS, effort: 'low', timeoutMs: 120000 })
    if ('stop' in answer) {
      run.budgetStop = answer.stop
      return await finish()
    }
    if (!answer.isAnswered) {
      run.state = 'error'
      run.errors.push(`the learn model did not answer (${answer.reason ?? 'unknown'})`)
      return await finish()
    }
    const parsed = parseLessons(answer.text ?? '')
    const checked = checkAgainstEvidence(parsed.lessons, {
      files: [...diff.files, ...t.files],
      symbols: [...diff.declarations, ...diff.hunkFunctions],
      text: `${tail}\n${graph}\n${renderDiff(diff)}`,
      skills: t.skillLoads.map(s => s.skill),
      cwd: job.cwd,
    })
    for (const why of [...parsed.dropped, ...checked.dropped]) run.notes.push(`Dropped a lesson: ${why}`)
    run.found = checked.kept.length

    // Merge, flag contradictions, apply per review mode
    const fresh: Lesson[] = []
    for (const cand of checked.kept) {
      const dup = findDuplicate(cand, projectLessons)
      if (dup) {
        const i = d.lessons.findIndex(l => l.id === dup.id)
        d.lessons[i] = mergeInto(dup, { ...cand, sourceSession: job.sessionId }, now)
        run.merged++
        continue
      }
      if (recalled.some(r => similarity(r, cand.text) >= 0.6)) {
        run.merged++
        run.notes.push(`Already in Hindsight: ${clip(cand.text, 80)}`)
        continue
      }
      const conflict = findContradiction(cand.text, [...projectLessons.filter(l => l.status === 'active'), ...recalled.map(text => ({ text }))])
      const lesson = newLesson(cand, job, project, now, conflict ? `contradicts: ${clip(conflict, 120)}` : undefined)
      fresh.push(lesson)
      d.lessons.push(lesson)
    }

    for (const lesson of fresh) {
      if (!appliesItself(opts.settings.reviewMode, lesson.text, lesson.hold)) {
        if (opts.settings.reviewMode !== 'suggest' && !lesson.hold) lesson.hold = riskOf(lesson.text) ?? undefined
        continue
      }
      const stop = changeBudgetStop(opts.settings, c.spent)
      if (stop) {
        run.budgetStop = stop
        lesson.hold = `budget: ${stop}`
        continue
      }
      const w = await applyLesson(h, lesson, hs, hsDown)
      for (const f of w.failed) if (!run.skippedStores.includes(f)) run.skippedStores.push(f)
      if (w.stores.length === 0) {
        lesson.hold = 'no store took it'
        continue
      }
      lesson.status = 'active'
      lesson.stores = w.stores
      c.spent.changes++
      recordChange(d, { id: newId(now, 'c'), at: now, kind: 'lesson', title: `Saved lesson: ${clip(lesson.text, 80)}`, before: null, after: lesson.text, isAuto: true, lessonId: lesson.id })
    }
    if (root) run.notes.push('CodeGraph: notes not supported; lessons are not tagged on symbols')

    // Staleness
    opts.onPhase?.('checking for stale lessons')
    await markStale(h, d, project, job.cwd, root, now)
    run.stale = d.changes.filter(x => x.kind === 'stale' && x.at === now).length

    // Skills: scorecards with this run's corrections, drafts, the before/after check
    if (!run.budgetStop) {
      const corrections = fresh.filter(l => l.kind === 'correction' && l.skill)
      updateCards(d, t, installed.skills, job.sessionId, now, corrections.map(l => l.skill!))
      await draftSkills(c, d, installed.skills, fresh, project)
    }

    run.saved = fresh.filter(l => l.status === 'active').length
    run.review = fresh.filter(l => l.status === 'pending').length + d.drafts.filter(x => x.status === 'pending' && x.createdAt === now).length
    run.drafts = d.drafts.filter(x => x.createdAt === now).length
    return await finish()
  } catch (e) {
    run.state = 'error'
    run.errors.push(e instanceof Error ? e.message : String(e))
    return await finish()
  }
}

function newLesson(c: Candidate, job: Job, project: string, now: number, hold?: string): Lesson {
  return {
    id: newId(now, 'l'),
    kind: c.kind,
    text: c.text,
    scope: c.scope,
    files: c.files,
    symbols: c.symbols,
    ...(c.skill ? { skill: c.skill } : {}),
    sourceSession: job.sessionId,
    sessions: [job.sessionId],
    project,
    cwd: normPath(job.cwd),
    status: 'pending',
    stores: [],
    ...(hold ? { hold } : {}),
    createdAt: now,
    updatedAt: now,
  }
}

function skillInfo(name: string, installed: SkillInfo[]): SkillInfo | undefined {
  return installed.find(s => s.name === name) ?? installed.find(s => s.name.endsWith(`:${name}`) || name.endsWith(`:${s.name}`))
}

function updateCards(d: Data, t: Transcript, installed: SkillInfo[], sessionId: string, now: number, correctedSkills: string[]): void {
  for (const name of new Set(t.skillLoads.map(s => s.skill))) {
    const info = skillInfo(name, installed)
    const outcome = sessionOutcome(t, name, topicWords(name, info?.description), sessionId, now, correctedSkills.includes(name))
    if (!outcome) continue
    const prior = d.cards[name]
    const merged = addSession(prior, name, outcome)
    if (prior?.history.some(x => x.sessionId === sessionId)) {
      const old = prior.history.find(x => x.sessionId === sessionId)!
      merged.history = merged.history.map(x => (x.sessionId === sessionId ? { ...outcome, at: old.at, corrected: outcome.corrected || old.corrected } : x))
    }
    const cmp = compareBeforeAfter(merged)
    d.cards[name] = { ...merged, isWorse: cmp?.isWorse ?? false }
  }
}

/** Marks active lessons stale when all their files are gone or their symbols no longer exist. */
async function markStale(h: Host, d: Data, project: string, cwd: string, root: string | null, now: number): Promise<void> {
  const windows = await isWindows(h.io, cwd)
  let queries = 0
  for (const l of d.lessons) {
    if (l.project !== project || l.status !== 'active') continue
    const fileExists: Record<string, boolean> = {}
    for (const f of l.files) fileExists[f] = await h.io.fs.exists(/^[A-Za-z]:|^\//.test(f) ? f : joinPath(cwd, f)).catch(() => true)
    let symbolExists: Record<string, boolean> | null = null
    if (root && l.symbols.length && queries < 20) {
      symbolExists = {}
      for (const s of l.symbols) {
        queries++
        symbolExists[s] = await symbolKnown(h, root, s, windows)
      }
    }
    if (!isStale(l, fileExists, symbolExists)) continue
    l.status = 'stale'
    l.updatedAt = now
    const removed = await unwriteMemory(h, l).catch(() => false)
    recordChange(d, {
      id: newId(now, 'c'),
      at: now,
      kind: 'stale',
      title: `Lesson went stale: ${clip(l.text, 80)}`,
      before: l.text,
      after: null,
      isAuto: true,
      lessonId: l.id,
      notes: [removed ? 'Removed from project memory.' : 'Not in project memory.', ...(l.stores.some(s => s.startsWith('hindsight')) ? ['Hindsight keeps it: the shared client has no delete.'] : [])],
    })
  }
}

async function symbolKnown(h: Host, root: string, symbol: string, windows: boolean): Promise<boolean> {
  const q = cleanQuery(symbol, windows)
  if (!q) return true
  const argv = windows ? ['cmd', '/c', 'codegraph', 'query', q, '--json', '--limit', '5'] : ['codegraph', 'query', q, '--json', '--limit', '5']
  try {
    const r = await h.io.process.run(argv, { cwd: root, timeoutMs: 15000 })
    if (r.exitCode !== 0) return true
    const parsed = JSON.parse(r.stdout) as unknown
    const list = Array.isArray(parsed) ? parsed : (parsed as { results?: unknown[] })?.results
    if (!Array.isArray(list)) return true
    return list.some(x => JSON.stringify(x).includes(`"${symbol}"`))
  } catch {
    return true
  }
}

function takenNames(installed: SkillInfo[], drafts: Draft[], except?: string): string[] {
  const names = [...installed.map(s => (s.name.includes(':') ? '' : s.name)), ...drafts.filter(x => x.status !== 'rejected').map(x => x.skill)]
  return names.filter(n => n && n !== except)
}

async function draftSkills(c: Ctx, d: Data, installed: SkillInfo[], fresh: Lesson[], project: string): Promise<void> {
  const { h, run } = c
  const now = run.at
  const userSkills = joinPath(h.configDir, 'skills')
  const pendingFor = (skill: string, type: string) => d.drafts.some(x => x.status === 'pending' && x.type === type && (x.baseSkill ?? x.skill) === skill)
  const addDraft = (x: Omit<Draft, 'id' | 'createdAt' | 'status' | 'project'>) => {
    const draft: Draft = { ...x, id: newId(now, 'd'), createdAt: now, status: 'pending', project }
    d.drafts.push(draft)
    return draft
  }
  const corrections = d.lessons.filter(l => l.kind === 'correction').map(l => l.text)

  // Fix drafts: a correction that names a skill Claude loaded
  for (const l of fresh.filter(x => x.kind === 'correction' && x.skill)) {
    const info = skillInfo(l.skill!, installed)
    if (!info) continue
    const before = await readOr(h, info.path)
    if (before === null) continue
    const base = info.name.includes(':') ? info.name.slice(info.name.indexOf(':') + 1) : info.name
    if (info.source.startsWith('plugin:')) {
      const taken = takenNames(installed, d.drafts)
      const name = taken.includes(base) ? `${base}-local` : base
      if (pendingFor(info.name, 'override')) continue
      const fm = parseFrontmatter(before)
      const text = fixDraftText(fm ? before.replace(/^(---[\s\S]*?\nname:\s*).*$/m, `$1${name}`) : before, l.text)
      addDraft({ type: 'override', skill: name, baseSkill: info.name, path: joinPath(userSkills, name, 'SKILL.md'), before: null, after: text, problems: validateDraft({ text, before, takenNames: taken, corrections }), reason: `A local copy of the plugin skill ${info.name} with a learned correction (plugin skills are never edited).` })
    } else {
      if (d.drafts.some(x => x.status === 'pending' && x.type === 'fix' && x.skill === base && x.after.includes(l.text))) continue
      const text = fixDraftText(before, l.text)
      addDraft({ type: 'fix', skill: base, baseSkill: info.name, path: info.path, before, after: text, problems: validateDraft({ text, before, takenNames: takenNames(installed, d.drafts, base), corrections }), reason: `A correction named this skill: ${l.text}` })
    }
  }

  // Rewrite drafts: correction rate of 30% or more over the last 5 loads
  for (const card of Object.values(d.cards)) {
    if (run.budgetStop || !needsRewrite(card) || pendingFor(card.name, 'rewrite')) continue
    if (card.changedAt !== undefined && card.history.filter(x => x.at >= card.changedAt!).length < 5) continue
    const info = skillInfo(card.name, installed)
    if (!info || info.source.startsWith('plugin:')) continue
    const before = await readOr(h, info.path)
    if (before === null) continue
    const learned = d.lessons.filter(l => l.kind === 'correction' && l.skill && (l.skill === card.name || info.name.endsWith(l.skill))).map(l => l.text)
    const maxLength = Math.floor(before.length * 1.2)
    const r = await callModel(c, { model: REWRITE_MODEL, prompt: scrubSecrets(rewritePrompt(info.name, before, learned, maxLength)), maxTokens: REWRITE_REPLY_TOKENS, effort: 'medium', timeoutMs: 180000 })
    if ('stop' in r) {
      run.budgetStop = r.stop
      break
    }
    if (!r.isAnswered || !r.text) {
      run.errors.push(`the rewrite model did not answer for ${info.name} (${r.reason ?? 'empty'})`)
      continue
    }
    const text = unfence(r.text)
    const base = info.name
    addDraft({ type: 'rewrite', skill: base, baseSkill: info.name, path: info.path, before, after: text, problems: validateDraft({ text, before, takenNames: takenNames(installed, d.drafts, base), corrections: learned, maxLength }), reason: `Corrected in ${Math.round((card.history.slice(-5).filter(x => x.corrected).length / Math.min(5, card.history.length)) * 100)}% of its last loads.` })
  }

  // New skill drafts: procedures seen in 2 or more sessions
  for (const group of groupProcedures(d.lessons.filter(l => l.project === project))) {
    const draft = newSkillDraft(group)
    const taken = takenNames(installed, d.drafts)
    if (taken.includes(draft.name)) continue
    if (installed.some(s => similarity(s.description, group[0]!.text) >= 0.5)) continue
    if (d.drafts.some(x => x.type === 'new' && similarity(x.after, draft.text) >= 0.6)) continue
    addDraft({ type: 'new', skill: draft.name, path: joinPath(userSkills, draft.name, 'SKILL.md'), before: null, after: draft.text, problems: validateDraft({ text: draft.text, before: null, takenNames: taken, corrections }), reason: `A procedure seen in ${new Set(group.flatMap(l => l.sessions)).size} sessions.` })
  }

  // Advanced mode: drafts that pass validation apply themselves
  if (c.s.reviewMode === 'advanced') {
    for (const x of d.drafts.filter(y => y.status === 'pending' && y.createdAt === now && y.problems.length === 0)) {
      const stop = changeBudgetStop(c.s, c.spent)
      if (stop) {
        run.budgetStop = stop
        break
      }
      const res = await installDraft(h, d, x.id, true, now)
      if (res.ok) c.spent.changes++
      else run.errors.push(res.message)
    }
  }
}

// ---------- the next-session brief ----------

/** Up to 6 active lessons for this folder: Hindsight's (tagged by this mod) ranked by recently touched files, else local ones. */
export async function computeBrief(h: Host, cwd: string, since: number): Promise<string> {
  const d = await loadData(h)
  const project = folderKey(cwd)
  const log = await git(h, cwd, ['log', '-n', '20', '--name-only', '--format='])
  const recent = [...new Set(log.out.split(/\r?\n/).map(s => s.trim()).filter(Boolean))].slice(0, 30)
  let fromHindsight: string[] | null = null
  const hs = await hindsightFor(h, cwd)
  if (hs.ctx) {
    const query = `Lessons for this project${recent.length ? `, files: ${recent.slice(0, 10).join(', ')}` : ''}`
    const r = await recall(h.io, hs.ctx.config, hs.ctx.projectBank, query, { types: ['observation', 'world'], tags: ['session-learner'], maxTokens: 800 })
    if (r.ok && r.results.length) fromHindsight = r.results.map(x => x.text)
  }
  return buildBrief(briefLines(fromHindsight, d.lessons, recent, project), skillsChangedSince(d.changes, since))
}

// ---------- job files ----------

export function newJob(p: Omit<Job, 'id' | 'state' | 'createdAt'>, now: number): Job {
  return { ...p, id: newId(now, 'j'), createdAt: now, state: 'pending' }
}

export async function writeJob(h: Host, job: Job): Promise<string> {
  const path = joinPath(jobsDir(h), `${job.id}.json`)
  await h.write(path, `${JSON.stringify(job, null, 2)}\n`)
  return path
}

/** Runs one job file at most once: pending, then running (with a time), then done and removed. */
export async function runJobFile(h: Host, path: string, opts: RunOptions): Promise<Run | null> {
  let job: Job | null
  try {
    job = parseJob(await h.io.fs.read(path))
  } catch {
    return null
  }
  if (!job || job.state === 'done') return null
  const now = await h.now()
  if (job.state === 'running' && now - (job.startedAt ?? job.createdAt) < DEAD_AFTER_MS) return null
  job.state = 'running'
  job.startedAt = now
  await h.write(path, `${JSON.stringify(job, null, 2)}\n`)
  const run = await runJob(h, job, opts)
  job.state = 'done'
  job.finishedAt = await h.now()
  await h.write(path, `${JSON.stringify(job, null, 2)}\n`).catch(() => undefined)
  await h.remove(path).catch(() => false)
  return run
}

/** Picks up job files a session left behind (the machine slept, the worker died) and runs each once. */
export async function pickUpJobs(h: Host, opts: RunOptions): Promise<Run[]> {
  const dir = jobsDir(h)
  let entries: Array<{ name: string; kind: string }> = []
  try {
    entries = await h.io.fs.list(dir)
  } catch {
    return []
  }
  const now = await h.now()
  const jobs: Array<{ job: Job; path: string }> = []
  for (const e of entries) {
    if (e.kind !== 'file' || !e.name.endsWith('.json')) continue
    const path = joinPath(dir, e.name)
    const job = parseJob(await h.io.fs.read(path).catch(() => ''))
    if (job) jobs.push({ job, path })
    if (job?.state === 'done') await h.remove(path).catch(() => false)
  }
  const due = new Set(jobsToPickUp(jobs.map(j => j.job), now).map(j => j.id))
  const runs: Run[] = []
  for (const { job, path } of jobs) {
    if (!due.has(job.id)) continue
    const run = await runJobFile(h, path, { ...opts, trigger: `picked up (${job.reason})` })
    if (run) runs.push(run)
  }
  return runs
}

// ---------- review actions (the /learn pane) ----------

export type ActionResult = { ok: boolean; message: string }

export async function installDraft(h: Host, d: Data, id: string, isAuto: boolean, now: number): Promise<ActionResult> {
  const x = d.drafts.find(y => y.id === id)
  if (!x || x.status !== 'pending') return { ok: false, message: 'That draft is no longer waiting.' }
  if (x.problems.length) return { ok: false, message: `The draft does not pass: ${x.problems[0]}` }
  const before = await readOr(h, x.path)
  try {
    await h.write(x.path, x.after)
  } catch (e) {
    return { ok: false, message: `Could not write ${x.path}: ${e instanceof Error ? e.message : String(e)}` }
  }
  x.status = 'applied'
  const change: Change = { id: newId(now, 'c'), at: now, kind: 'skill', title: `${x.type === 'new' ? 'New skill' : x.type === 'override' ? 'Local override' : x.type === 'fix' ? 'Fixed skill' : 'Rewrote skill'} ${x.skill}`, before, after: x.after, isAuto, draftId: x.id, path: x.path, skill: x.skill }
  d.changes.push(change)
  const cardName = x.baseSkill ?? x.skill
  const card = d.cards[cardName] ?? { name: cardName, loads: 0, history: [] }
  d.cards[cardName] = { ...card, changedAt: now, changeId: change.id, isWorse: false }
  return { ok: true, message: `Installed ${x.skill} at ${x.path}.` }
}

export async function rejectDraft(d: Data, id: string): Promise<ActionResult> {
  const x = d.drafts.find(y => y.id === id)
  if (!x || x.status !== 'pending') return { ok: false, message: 'That draft is no longer waiting.' }
  x.status = 'rejected'
  return { ok: true, message: `Rejected the draft for ${x.skill}.` }
}

export function editDraft(d: Data, id: string, text: string, installed: string[]): ActionResult {
  const x = d.drafts.find(y => y.id === id)
  if (!x || x.status !== 'pending') return { ok: false, message: 'That draft is no longer waiting.' }
  x.after = text.endsWith('\n') ? text : `${text}\n`
  const taken = [...installed, ...d.drafts.filter(y => y.id !== id && y.status !== 'rejected').map(y => y.skill)].filter(n => n !== (x.type === 'fix' || x.type === 'rewrite' ? x.skill : ''))
  x.problems = validateDraft({ text: x.after, before: x.before, takenNames: taken, corrections: d.lessons.filter(l => l.kind === 'correction').map(l => l.text), ...(x.type === 'rewrite' && x.before ? { maxLength: Math.floor(x.before.length * 1.2) } : {}) })
  return { ok: true, message: x.problems.length ? `Saved. It does not pass yet: ${x.problems[0]}` : 'Saved. The draft passes.' }
}

export async function approveLesson(h: Host, d: Data, id: string, now: number): Promise<ActionResult> {
  const l = d.lessons.find(x => x.id === id)
  if (!l || l.status !== 'pending') return { ok: false, message: 'That lesson is no longer waiting.' }
  const hs = await hindsightFor(h, l.cwd)
  const w = await applyLesson(h, l, hs.ctx, hs.reason === 'not configured' || hs.reason === 'disabled' ? null : hs.reason)
  if (w.stores.length === 0) return { ok: false, message: `No store took it: ${w.failed.join('; ') || 'none configured'}` }
  l.status = 'active'
  l.stores = w.stores
  delete l.hold
  l.updatedAt = now
  d.changes.push({ id: newId(now, 'c'), at: now, kind: 'lesson', title: `Approved lesson: ${clip(l.text, 80)}`, before: null, after: l.text, isAuto: false, lessonId: l.id, notes: w.failed })
  return { ok: true, message: `Saved to ${w.stores.join(', ')}${w.failed.length ? `; skipped ${w.failed.join('; ')}` : ''}.` }
}

export function rejectLesson(d: Data, id: string, now: number): ActionResult {
  const l = d.lessons.find(x => x.id === id)
  if (!l || l.status !== 'pending') return { ok: false, message: 'That lesson is no longer waiting.' }
  l.status = 'rejected'
  l.updatedAt = now
  return { ok: true, message: 'Rejected.' }
}

export async function editLesson(h: Host, d: Data, id: string, text: string, now: number): Promise<ActionResult> {
  const l = d.lessons.find(x => x.id === id)
  const t = text.replace(/\s+/g, ' ').trim()
  if (!l) return { ok: false, message: 'That lesson is gone.' }
  if (t.length < 8) return { ok: false, message: 'A lesson needs at least a short sentence.' }
  if (scrubSecrets(t) !== t) return { ok: false, message: 'That text looks like it holds a secret; it was not saved.' }
  const before = l.text
  l.text = t
  l.updatedAt = now
  if (l.status === 'active' && l.stores.includes('memory')) {
    await unwriteMemory(h, { ...l, text: before }).catch(() => false)
    await writeMemory(h, l).catch(() => undefined)
  }
  if (l.status === 'active') d.changes.push({ id: newId(now, 'c'), at: now, kind: 'lesson', title: `Edited lesson`, before, after: t, isAuto: false, lessonId: l.id, notes: l.stores.some(s => s.startsWith('hindsight')) ? ['Hindsight keeps the old text too: the shared client cannot edit a memory.'] : [] })
  return { ok: true, message: 'Saved.' }
}

/** Merges a lesson into the most similar other lesson of its project. */
export async function mergeLesson(h: Host, d: Data, id: string, now: number): Promise<ActionResult> {
  const l = d.lessons.find(x => x.id === id)
  if (!l) return { ok: false, message: 'That lesson is gone.' }
  const target = mergeTarget(d.lessons, l)
  if (!target) return { ok: false, message: 'No similar lesson to merge with.' }
  const i = d.lessons.findIndex(x => x.id === target.id)
  d.lessons[i] = mergeInto(target, l, now)
  if (l.status === 'active') await unwriteMemory(h, l).catch(() => false)
  l.status = 'rejected'
  l.updatedAt = now
  d.changes.push({ id: newId(now, 'c'), at: now, kind: 'lesson', title: `Merged a lesson into: ${clip(target.text, 70)}`, before: l.text, after: target.text, isAuto: false, lessonId: l.id })
  return { ok: true, message: 'Merged.' }
}

export function mergeTarget(lessons: Lesson[], l: Lesson): Lesson | null {
  let best: { x: Lesson; s: number } | null = null
  for (const x of lessons) {
    if (x.id === l.id || x.status === 'rejected' || x.project !== l.project) continue
    const s = similarity(x.text, l.text)
    if (s >= 0.35 && (!best || s > best.s)) best = { x, s }
  }
  return best?.x ?? null
}

/** Moves a lesson between the project and the user stores. */
export async function moveLesson(h: Host, d: Data, id: string, now: number): Promise<ActionResult> {
  const l = d.lessons.find(x => x.id === id)
  if (!l) return { ok: false, message: 'That lesson is gone.' }
  const from = l.scope
  l.scope = from === 'project' ? 'user' : 'project'
  l.updatedAt = now
  if (l.status !== 'active') return { ok: true, message: `It will be saved as a ${l.scope} lesson.` }
  if (from === 'project') await unwriteMemory(h, l).catch(() => false)
  const hs = await hindsightFor(h, l.cwd)
  const w = await applyLesson(h, l, hs.ctx, hs.reason === 'not configured' || hs.reason === 'disabled' ? null : hs.reason)
  l.stores = w.stores
  d.changes.push({ id: newId(now, 'c'), at: now, kind: 'lesson', title: `Moved lesson to the ${l.scope} store`, before: from, after: l.scope, isAuto: false, lessonId: l.id, notes: w.failed })
  return { ok: true, message: `Moved to the ${l.scope} store${w.failed.length ? `; skipped ${w.failed.join('; ')}` : ''}.` }
}

export async function deleteLessons(h: Host, d: Data, ids: string[], now: number): Promise<ActionResult> {
  let n = 0
  let memory = 0
  for (const id of ids) {
    const i = d.lessons.findIndex(x => x.id === id)
    if (i < 0) continue
    const l = d.lessons[i]!
    if (await unwriteMemory(h, l).catch(() => false)) memory++
    d.lessons.splice(i, 1)
    n++
    d.changes.push({ id: newId(now, 'c'), at: now, kind: 'lesson', title: `Deleted lesson: ${clip(l.text, 80)}`, before: l.text, after: null, isAuto: false, lessonId: l.id })
  }
  return { ok: true, message: `Deleted ${n} lesson${n === 1 ? '' : 's'} (${memory} removed from project memory).` }
}

/** Undoes a recorded change: a lesson leaves memory and waits again; a skill gets its old text back. */
export async function rollBack(h: Host, d: Data, changeId: string, now: number): Promise<ActionResult> {
  const c = d.changes.find(x => x.id === changeId)
  if (!c || c.isRolledBack) return { ok: false, message: 'That change cannot be rolled back.' }
  if (c.kind === 'skill' && c.path) {
    try {
      if (c.before === null) {
        if (!(await h.remove(c.path))) return { ok: false, message: `Could not remove ${c.path}.` }
      } else await h.write(c.path, c.before)
    } catch (e) {
      return { ok: false, message: `Could not restore ${c.path}: ${e instanceof Error ? e.message : String(e)}` }
    }
    for (const card of Object.values(d.cards)) {
      if (card.changeId === c.id) {
        delete card.changedAt
        delete card.changeId
        card.isWorse = false
      }
    }
    const draft = d.drafts.find(x => x.id === c.draftId)
    if (draft) draft.status = 'rejected'
  } else if (c.lessonId) {
    const l = d.lessons.find(x => x.id === c.lessonId)
    if (!l) return { ok: false, message: 'That lesson was deleted.' }
    if (c.kind === 'stale') {
      l.status = 'active'
      if (l.stores.includes('memory') || l.scope === 'project') await writeMemory(h, l).catch(() => undefined)
    } else if (c.before !== null && c.after !== null && l.text === c.after) {
      l.text = c.before
      if (l.status === 'active' && l.stores.includes('memory')) {
        await unwriteMemory(h, l).catch(() => false)
        await writeMemory(h, l).catch(() => undefined)
      }
    } else {
      await unwriteMemory(h, l).catch(() => false)
      l.status = 'pending'
      l.hold = 'rolled back'
      l.stores = l.stores.filter(s => s !== 'memory')
    }
    l.updatedAt = now
  } else return { ok: false, message: 'That change cannot be rolled back.' }
  c.isRolledBack = true
  d.changes.push({ id: newId(now, 'c'), at: now, kind: c.kind === 'stale' ? 'lesson' : c.kind, title: `Rolled back: ${c.title}`, before: c.after, after: c.before, isAuto: false, ...(c.lessonId ? { lessonId: c.lessonId } : {}) })
  return { ok: true, message: `Rolled back: ${c.title}.` }
}

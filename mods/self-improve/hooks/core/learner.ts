// The learn run: gate, evidence, one model call, lessons into their stores, staleness, skill drafts and the
// scorecard. Ported from Operant's LearnService.learnRun (core/learn.ts) and shaped by the spec's review modes.
// Nothing here throws into a session: a store that fails is skipped and named in the run's record.

import { connectHindsight, type HindsightState } from './hindsight'
import type { Io } from './io'
import { errText } from './io'
import { diffInfo, isUnparsed, learnPrompt, parseLessons, riskOf, type Extracted } from './lessons'
import { removeMemory, writeMemory } from './memory'
import { folderKey, folderName, joinPath, projectBank, soulPath, transcriptPathFor } from './paths'
import { Budget, BudgetStop, type Settings } from './settings'
import {
  afterChange,
  emptyCard,
  fixTarget,
  lessonNamesSkill,
  listSkills,
  newSkillDrafts,
  parseExtraDirs,
  rewriteDue,
  rewritePrompt,
  validateDraft,
  withCorrection,
  type SkillInfo,
} from './skills'
import { addFacts, parseSoul, removeFact, renderSoul, SECTION_TITLES, sectionFor, type SoulSection } from './soul'
import { readSoul, syncSoul, writeSoul } from './soulSync'
import { addChange, loadState, newId, saveState, writeBackups, type Draft, type Lesson, type Run, type Skip, type State } from './state'
import { clean, isDuplicate, stripLinks, textProblem, uniq } from './text'
import { corrections, gateReason, interrupts, parseJsonl, sinceTurn, skillLoads, tailText, userTurns, type Ev } from './transcript'

export type Job = {
  sessionId: string
  folder: string
  transcriptPath: string
  startHead: string
  note: string
  trigger: string
  createdAt: number
  // The settings of the session that wrote the job: the detached learner runs with these, not its own defaults.
  settings?: Settings
}

export type RunOptions = {
  // The session's own events (an in-session run reads $.session.messages()); else the transcript file is read.
  events?: Ev[]
  hindsight?: HindsightState
  // Whether the codegraph CLI answered; probed when left out.
  codegraph?: boolean
}

type Ctx = {
  io: Io
  s: Settings
  state: State
  hs: HindsightState
  run: Run
  budget: Budget
  now: number
}

const skip = (run: Run, store: string, reason: string): void => {
  if (!run.skipped.some(k => k.store === store && k.reason === reason)) run.skipped.push({ store, reason })
}

export const tailScript = (path: string): string =>
  [
    `$f = [IO.File]::Open('${path.replace(/'/g, "''")}', 'Open', 'Read', 'ReadWrite')`,
    '$len = $f.Length; $n = [int][Math]::Min($len, 3MB); [void]$f.Seek(-$n, \'End\')',
    '$b = New-Object byte[] $n; $r = 0',
    'while ($r -lt $n) { $k = $f.Read($b, $r, $n - $r); if ($k -le 0) { break }; $r += $k }',
    '$f.Close(); $s = 0',
    'if ($len -gt $n) { $s = [Array]::IndexOf($b, [byte]10) + 1 }',
    '$o = [Console]::OpenStandardOutput(); $o.Write($b, $s, $r - $s); $o.Flush()',
  ].join('; ')

async function readEvents(io: Io, job: Job): Promise<Ev[]> {
  const path = job.transcriptPath || transcriptPathFor(io.config, job.folder, job.sessionId, io.isWindows)
  const text = await io.read(path).catch(() => null)
  if (text !== null) return parseJsonl(text)
  // Over the 4 MiB read limit, or unreadable: the tail is enough. On Windows the last 3 MiB are read with a seek, from
  // the first whole line; Get-Content -Tail scans the whole file and took over 100 s on an 8 MiB transcript.
  const argv = io.isWindows
    ? ['powershell', '-NoProfile', '-Command', tailScript(path)]
    : ['tail', '-n', '600', path]
  const r = await io.run(argv, { timeoutMs: 20_000 })
  if (r.code !== 0) throw new Error(`could not read the transcript at ${path}`)
  return parseJsonl(r.stdout)
}

export async function hasCodegraph(io: Io, folder: string): Promise<boolean> {
  if (!folder || !(await io.exists(joinPath(io.isWindows, folder, '.codegraph')).catch(() => false))) return false
  try {
    const r = await io.run(io.isWindows ? ['cmd', '/c', 'codegraph', '--version'] : ['codegraph', '--version'], { timeoutMs: 10_000 })
    return r.code === 0
  } catch {
    return false
  }
}

async function codegraphContext(io: Io, folder: string, symbols: readonly string[]): Promise<string> {
  if (!symbols.length) return ''
  const q = symbols.slice(0, 8).join(' ')
  try {
    const r = await io.run(io.isWindows ? ['cmd', '/c', 'codegraph', 'explore', q] : ['codegraph', 'explore', q], { cwd: folder, timeoutMs: 30_000 })
    return r.code === 0 ? clean(r.stdout.replace(/```[\s\S]*?```/g, '')).slice(0, 2500) : ''
  } catch {
    return ''
  }
}

const hindsightText = (l: Lesson): string =>
  [`LESSON #${l.id} [${l.kind}] ${l.text}`, l.files.length ? `Files: ${l.files.join(', ')}` : '', l.symbols.length ? `Symbols: ${l.symbols.join(', ')}` : ''].filter(Boolean).join('\n')

const lessonTags = (l: Lesson): string[] => ['self-improve', 'lesson', `lesson:${l.id}`, `kind:${l.kind}`, ...l.sessions.slice(-3).map(x => `session:${x}`), ...l.files.map(f => `file:${f}`), ...l.symbols.map(s => `symbol:${s}`)]

// Writes an applied lesson to its stores. Project: the memory folder and the project bank. User: soul.md (the Soul
// Bank gets it with the next soul sync). A store that fails is skipped and named.
export async function writeStores(c: Pick<Ctx, 'io' | 'hs' | 'state'> & { soul?: { text: string | null; dirty: boolean } }, l: Lesson, skipped: Skip[]): Promise<boolean> {
  const add = (store: string, reason: string) => {
    if (!skipped.some(k => k.store === store && k.reason === reason)) skipped.push({ store, reason })
  }
  let wrote = false
  if (l.scope === 'user') {
    // Inside a run the file is written once at the end; on its own (an approval) at once.
    const soul = c.soul ?? { text: await readSoul(c.io), dirty: false }
    const r = addFacts(parseSoul(soul.text), [{ section: l.section || sectionFor(l.text, l.kind), text: l.text }])
    if (r.added.length) {
      soul.text = renderSoul(r.doc)
      soul.dirty = true
    }
    if (!c.soul && soul.dirty) await c.io.write(soulFile(c.io), soul.text ?? '')
    if (!l.stores.includes('soul')) l.stores.push('soul')
    return true
  }
  if (l.folder) {
    try {
      await writeMemory(c.io, l)
      if (!l.stores.includes('memory')) l.stores.push('memory')
      wrote = true
    } catch (e) {
      add('memory', errText(e))
    }
  }
  if (l.stores.includes('hindsight') && !l.hindsightPending) return true
  if (!c.hs.on) {
    l.hindsightPending = true
    add('hindsight', c.hs.reason)
    return wrote
  }
  const r = await c.hs.client.retain(projectBank(l.folder || l.project), hindsightText(l), lessonTags(l), 'Self Improve lesson')
  if (r.ok) {
    l.hindsightPending = false
    if (!l.stores.includes('hindsight')) l.stores.push('hindsight')
    wrote = true
  } else {
    l.hindsightPending = true
    add('hindsight', r.error)
  }
  return wrote
}

const soulFile = (io: Io): string => soulPath(io.config, io.isWindows)

// A stale, rejected or deleted lesson leaves memory so it stops steering sessions. Hindsight has no delete call:
// the bank keeps what it was given, and the brief skips lessons that are no longer active.
export async function retire(io: Io, l: Lesson, status: Lesson['status']): Promise<void> {
  if (l.scope === 'user' && l.stores.includes('soul')) {
    const text = await readSoul(io)
    if (text !== null) await writeSoul(io, removeFact(parseSoul(text), l.text))
  }
  if (l.stores.includes('memory')) await removeMemory(io, l).catch(() => undefined)
  l.stores = l.stores.filter(x => x !== 'memory' && x !== 'soul')
  l.status = status
}

// Lessons whose files are all gone, or that name symbols no longer found in any of their files.
async function staleCheck(c: Ctx, folder: string): Promise<number> {
  if (!folder || !(await c.io.exists(folder).catch(() => false))) return 0
  const texts = new Map<string, string>()
  const textOf = async (p: string): Promise<string> => {
    let t = texts.get(p)
    if (t === undefined) {
      t = ((await c.io.read(p).catch(() => null)) ?? '').slice(0, 2_000_000)
      texts.set(p, t)
    }
    return t
  }
  let n = 0
  for (const l of c.state.lessons) {
    if (l.status !== 'active' || l.scope !== 'project' || folderKey(l.folder) !== folderKey(folder) || !l.files.length) continue
    const present: string[] = []
    for (const f of l.files) {
      const p = /^([a-z]:)?[\\/]/i.test(f) ? f : joinPath(c.io.isWindows, folder, f)
      if (await c.io.exists(p).catch(() => false)) present.push(p)
    }
    let gone = present.length === 0
    if (!gone && l.symbols.length) {
      let found = false
      for (const p of present) {
        const t = await textOf(p)
        if (l.symbols.some(s => t.includes(s))) {
          found = true
          break
        }
      }
      gone = !found
    }
    if (gone) {
      const before = l.text
      await retire(c.io, l, 'stale')
      l.updatedAt = c.now
      addChange(c.state, { at: c.now, kind: 'lesson', targetId: l.id, title: 'Stale: its files or symbols are gone', before, after: '', auto: true })
      n++
    }
  }
  return n
}

const takenNames = (state: State, skills: readonly SkillInfo[]): string[] =>
  uniq([...skills.map(s => s.name), ...skills.map(s => s.name.split(':').pop()!), ...state.drafts.filter(d => d.status === 'pending' || d.status === 'approved').map(d => d.name)])

export function addDraft(state: State, d: Omit<Draft, 'id'>): Draft {
  const draft = { ...d, id: newId(state) }
  state.drafts.push(draft)
  return draft
}

async function draftFix(c: Ctx, l: Lesson, skills: readonly SkillInfo[]): Promise<Draft | null> {
  const skill = skills.find(s => lessonNamesSkill(l, s.name))
  if (!skill) return null
  const { targetPath, isOverride } = fixTarget(c.io, skill)
  if (c.state.drafts.some(d => d.targetPath === targetPath && d.status === 'pending')) return null
  const current = (isOverride && (await c.io.read(targetPath).catch(() => null))) || (await c.io.read(skill.path).catch(() => null))
  if (current === null) return null
  const body = withCorrection(current, l.text)
  const corrections = c.state.lessons.filter(x => x.kind === 'correction' && lessonNamesSkill(x, skill.name)).map(x => x.text)
  const validation = validateDraft({ kind: 'fix', name: skill.name, body }, { takenNames: [], previous: current, corrections })
  return addDraft(c.state, { kind: 'fix', name: skill.name, body, sourcePath: skill.path, targetPath, isOverride, status: 'pending', validation, lessonIds: [l.id], sessions: [...l.sessions], previousBody: null, installedAt: null, createdAt: c.now })
}

// Writes an approved (or, in advanced mode, auto-applied) draft. A new skill never overwrites one already there; a fix
// or rewrite keeps the text it replaced so rollback can put it back. Plugin skills are never edited: a local override.
export async function installDraft(io: Io, state: State, d: Draft, auto: boolean): Promise<void> {
  const now = await io.now()
  if (d.kind === 'new') {
    const path = joinPath(io.isWindows, io.config, 'skills', d.name, 'SKILL.md')
    if (await io.exists(path).catch(() => false)) throw new Error(`a skill named ${d.name} is already installed`)
    await io.write(path, d.body)
    d.targetPath = path
    d.previousBody = null
  } else {
    const previous = await io.read(d.targetPath).catch(() => null)
    if (previous === null && !d.isOverride) throw new Error(`${d.name} is no longer installed`)
    await io.write(d.targetPath, d.body)
    d.previousBody = previous
  }
  d.status = 'approved'
  d.installedAt = now
  const card = (state.skills[d.name] ??= emptyCard())
  card.changedAt = now
  card.flagged = false
  addChange(state, { at: now, kind: 'skill', targetId: d.id, title: `${d.kind === 'new' ? 'New skill' : d.kind === 'fix' ? 'Fix' : 'Rewrite'} ${d.name}${d.isOverride ? ' (local override)' : ''}`, before: d.previousBody ?? '', after: d.body, auto })
}

function recordScorecard(c: Ctx, evs: readonly Ev[], sessionId: string, lessons: readonly Lesson[]): void {
  const loads = skillLoads(evs)
  const prompts = corrections(evs)
  const bySkill = new Map<string, typeof loads>()
  for (const l of loads) bySkill.set(l.skill, [...(bySkill.get(l.skill) ?? []), l])
  for (const [skill, list] of bySkill) {
    const card = (c.state.skills[skill] ??= emptyCard())
    if (card.uses.some(u => u.sessionId === sessionId)) card.uses = card.uses.filter(u => u.sessionId !== sessionId)
    const short = skill.split(':').pop()!.toLowerCase()
    const corrected = lessons.some(l => l.kind === 'correction' && lessonNamesSkill(l, skill)) || prompts.some(p => p.toLowerCase().includes(short) || short.split('-').filter(w => w.length > 3).some(w => p.toLowerCase().includes(w)))
    card.uses.push({
      sessionId,
      at: c.now,
      corrected,
      interrupts: Math.max(...list.map(x => x.interrupts)),
      failures: list.reduce((n, x) => n + x.failures, 0),
      turnsToEnd: Math.min(...list.map(x => x.turnsToEnd)),
    })
    card.uses = card.uses.slice(-40)
  }
}

function lessonFrom(c: Ctx, e: Extracted, job: Job): Lesson {
  return {
    id: newId(c.state),
    folder: e.scope === 'user' ? '' : job.folder,
    project: e.scope === 'user' ? '' : folderName(job.folder),
    kind: e.kind,
    supersedes: e.supersedes,
    scope: e.scope,
    section: e.scope === 'user' ? SECTION_TITLES[(e.section || sectionFor(e.text, e.kind)) as SoulSection] ?? '' : '',
    text: e.text,
    files: e.files,
    symbols: e.symbols,
    skill: e.skill,
    sessions: [job.sessionId],
    status: 'pending',
    stores: [],
    hindsightPending: false,
    reviewReason: '',
    hits: 1,
    createdAt: c.now,
    updatedAt: c.now,
  }
}

// Applies a lesson now (it no longer waits): stores, superseded lessons retired, the change recorded.
export async function applyLesson(c: Pick<Ctx, 'io' | 'hs' | 'state' | 'now'> & { soul?: { text: string | null; dirty: boolean } }, l: Lesson, auto: boolean, skipped: Skip[]): Promise<boolean> {
  l.status = 'active'
  l.reviewReason = ''
  l.updatedAt = c.now
  const wrote = await writeStores(c, l, skipped)
  addChange(c.state, { at: c.now, kind: 'lesson', targetId: l.id, title: `${l.scope === 'user' ? 'Soul fact' : 'Lesson'}: ${l.text}`, before: '', after: l.text, auto })
  for (const id of l.supersedes) {
    const old = c.state.lessons.find(x => x.id === id)
    if (old && old.id !== l.id && old.status === 'active') {
      const before = old.text
      await retire(c.io, old, 'stale')
      old.updatedAt = c.now
      addChange(c.state, { at: c.now, kind: 'lesson', targetId: old.id, title: `Superseded by #${l.id}: ${l.text}`, before, after: '', auto })
    }
  }
  return wrote
}

// Lessons that waited for Hindsight (it was off or down) are sent now. A bank that fails is skipped for this run, so
// it does not hold up the others; a server that does not answer at all stops the retry.
async function retryHindsight(c: Ctx): Promise<number> {
  if (!c.hs.on) return 0
  let n = 0
  const failed = new Set<string>()
  for (const l of c.state.lessons) {
    if (l.status !== 'active' || l.scope !== 'project' || !l.hindsightPending) continue
    const bank = projectBank(l.folder || l.project)
    if (failed.has(bank)) continue
    const r = await c.hs.client.retain(bank, hindsightText(l), lessonTags(l), 'Self Improve lesson')
    if (!r.ok) {
      skip(c.run, 'hindsight', `${bank}: ${r.error}`)
      if (r.error.startsWith('no answer')) break
      failed.add(bank)
      continue
    }
    l.hindsightPending = false
    if (!l.stores.includes('hindsight')) l.stores.push('hindsight')
    n++
  }
  return n
}

export async function learn(io: Io, job: Job, s: Settings, o: RunOptions = {}): Promise<Run | null> {
  if (s.mode === 'off') return null
  const state = await loadState(io)
  const now = await io.now()
  const run: Run = {
    id: newId(state), at: now, sessionId: job.sessionId, folder: job.folder, trigger: job.trigger, extracted: 0, saved: 0, queued: 0, merged: 0, staled: 0, drafts: 0, skipped: [], error: '', calls: 0, tokens: 0, usd: 0, model: s.learnModel,
  }
  const hs = o.hindsight ?? (await connectHindsight(io, s.hindsightUrl))
  const c: Ctx = { io, s, state, hs, run, budget: new Budget(s, state, io), now }
  const cc = c
  const lessonsThisRun: Lesson[] = []
  try {
    let all: Ev[]
    try {
      all = o.events ?? (await readEvents(io, job))
    } catch (e) {
      run.error = `Could not read the session: ${clean(errText(e))}`
      return await finish()
    }
    const evs = sinceTurn(all, state.learned[job.sessionId] ?? 0)
    const diff = job.folder ? await diffInfo(io, job.folder, job.startHead) : { files: [], symbols: [], isRepo: false }
    if (!diff.isRepo) skip(run, 'git', 'not a git repository')
    const gate = gateReason(evs, diff.files.length, s)
    if (gate) {
      run.error = `Skipped: ${gate}`
      recordScorecard(c, evs, job.sessionId, [])
      state.learned[job.sessionId] = userTurns(all)
      return await finish()
    }
    const { skills, problems } = await listSkills(io, job.folder, parseExtraDirs(s.extraSkillDirs))
    for (const p of problems) skip(run, 'skills', p)
    let recalled: string[] = []
    if (hs.on) {
      const query = [...diff.files.slice(0, 10), ...diff.symbols.slice(0, 10), tailText(evs).slice(-1000)].join(' ').slice(0, 1500)
      const r = await hs.client.recall(projectBank(job.folder), query, 5)
      if (r.ok) recalled = r.value.map(t => clean(t).slice(0, 300))
      else skip(run, 'hindsight', `recall: ${r.error}`)
    } else skip(run, 'hindsight', hs.reason)
    const cg = o.codegraph ?? (await hasCodegraph(io, job.folder))
    const codegraph = cg ? await codegraphContext(io, job.folder, diff.symbols) : ''
    if (!cg) skip(run, 'codegraph', 'not indexed')
    else skip(run, 'codegraph', 'lesson notes are not supported by CodeGraph; context only')
    const known = state.lessons.filter(l => (l.status === 'active' || l.status === 'pending') && (l.scope === 'user' || folderKey(l.folder) === folderKey(job.folder))).slice(-40)
    const prompt = learnPrompt({
      tail: tailText(evs),
      files: diff.files,
      symbols: diff.symbols,
      corrections: corrections(evs),
      interrupts: interrupts(evs),
      failures: evs.filter(e => e.kind === 'result' && e.error).length,
      known,
      recalled,
      skills,
      loaded: uniq(skillLoads(evs).map(l => l.skill)),
      codegraph,
      note: job.note,
    })
    let reply = await c.budget.ask({ model: s.learnModel, prompt, maxTokens: 2000, effort: 'low' })
    if (!reply.ok) throw new Error(`the learn model failed: ${reply.error}`)
    let extracted = parseLessons(reply.text)
    if (!extracted.length && isUnparsed(reply.text)) {
      reply = await c.budget.ask({ model: s.learnModel, prompt: `Your last answer was not one JSON array of lessons. Answer again with ONLY the JSON array.\n\n${prompt}`, maxTokens: 2000, effort: 'low' })
      if (reply.ok) extracted = parseLessons(reply.text)
    }
    run.extracted = extracted.length
    state.learned[job.sessionId] = userTurns(all)

    for (const raw of extracted) {
      const unsafe = textProblem(raw.text)
      if (unsafe) {
        skip(run, 'lesson', `refused "${raw.text.slice(0, 60)}": ${unsafe}`)
        continue
      }
      const e = { ...raw, text: stripLinks(raw.text) }
      if (!e.text) continue
      const pool = state.lessons.filter(l => (l.status === 'active' || l.status === 'pending') && l.scope === e.scope && (e.scope === 'user' || folderKey(l.folder) === folderKey(job.folder)))
      const dup = pool.find(l => l.kind === e.kind && isDuplicate(l, e))
      if (dup) {
        dup.hits++
        dup.files = uniq([...dup.files, ...e.files])
        dup.symbols = uniq([...dup.symbols, ...e.symbols])
        dup.sessions = uniq([...dup.sessions, job.sessionId])
        dup.updatedAt = now
        run.merged++
        // A longer wording replaces an active lesson's text only where changes apply on their own.
        if (e.text.length > dup.text.length) {
          if (dup.status === 'pending') dup.text = e.text
          else if (s.mode !== 'suggest' && c.budget.canChange()) {
            const before = dup.text
            dup.text = e.text
            c.budget.changes++
            addChange(state, { at: now, kind: 'lesson', targetId: dup.id, title: `Merged a duplicate into #${dup.id}`, before, after: dup.text, auto: true })
            if (dup.scope === 'project') await writeStores(cc, dup, run.skipped)
          }
        }
        lessonsThisRun.push(dup)
        continue
      }
      const l = lessonFrom(c, e, job)
      state.lessons.push(l)
      lessonsThisRun.push(l)
      const risk = s.mode === 'suggest' ? 'suggest mode: every lesson waits for review' : riskOf(l.text)
      if (risk) {
        l.reviewReason = risk
        run.queued++
      } else if (!c.budget.canChange()) {
        l.reviewReason = `max changes per run (${s.maxChanges}) reached`
        run.queued++
        if (!run.error) run.error = `Stopped: max changes per run (${s.maxChanges}) reached; the rest wait for review`
      } else {
        c.budget.changes++
        if (await applyLesson(cc, l, true, run.skipped)) run.saved++
      }
      if (l.kind === 'correction' && l.skill) {
        const d = await draftFix(c, l, skills)
        if (d) run.drafts++
      }
    }

    recordScorecard(c, evs, job.sessionId, lessonsThisRun)
    run.staled += await staleCheck(c, job.folder)

    // New skills from procedures seen in two or more sessions.
    for (const d of newSkillDrafts(state, takenNames(state, skills), now)) {
      const draft = addDraft(state, d)
      draft.validation = validateDraft(draft, { takenNames: takenNames(state, skills).filter(n => n !== draft.name), previous: null, corrections: [] })
      run.drafts++
    }

    // Rewrites, for skills corrected in at least 30% of their last five sessions.
    for (const [name, card] of Object.entries(state.skills)) {
      if (!rewriteDue(card) || state.drafts.some(d => d.name === name && d.status === 'pending')) continue
      const skill = skills.find(x => x.name === name)
      if (!skill) continue
      const current = await io.read(skill.path).catch(() => null)
      if (current === null) continue
      const fixes = state.lessons.filter(l => l.kind === 'correction' && lessonNamesSkill(l, name)).map(l => l.text)
      const r = await c.budget.ask({ model: s.rewriteModel, prompt: rewritePrompt(name, current, fixes), maxTokens: 4000, effort: 'medium' })
      if (!r.ok) {
        skip(run, 'rewrite', `${name}: ${r.error}`)
        continue
      }
      const body = r.text.slice(Math.max(0, r.text.indexOf('---'))).trim() + '\n'
      const { targetPath, isOverride } = fixTarget(io, skill)
      const validation = validateDraft({ kind: 'rewrite', name, body }, { takenNames: [], previous: current, corrections: fixes, maxGrowth: 0.2 })
      addDraft(state, { kind: 'rewrite', name, body, sourcePath: skill.path, targetPath, isOverride, status: 'pending', validation, lessonIds: [], sessions: [job.sessionId], previousBody: null, installedAt: null, createdAt: now })
      run.drafts++
    }

    // Advanced mode: drafts that pass validation apply themselves.
    if (s.mode === 'advanced') {
      for (const d of state.drafts.filter(x => x.status === 'pending' && !x.validation)) {
        if (!c.budget.canChange()) {
          if (!run.error) run.error = `Stopped: max changes per run (${s.maxChanges}) reached; the rest wait for review`
          break
        }
        try {
          await installDraft(io, state, d, true)
          c.budget.changes++
        } catch (e) {
          d.validation = clean(errText(e))
        }
      }
    }
  } catch (e) {
    if (e instanceof BudgetStop) run.error = `Stopped: ${e.message}`
    else run.error = `Could not learn: ${clean(errText(e))}`
  }
  return await finish()

  async function finish(): Promise<Run> {
    try {
      // After a change, the next five sessions that load a skill are compared with the five before.
      for (const card of Object.values(state.skills)) if (afterChange(card) === 'worse') card.flagged = true
      await retryHindsight(c)
      const synced = await syncSoul(io, state, s, hs)
      if (synced.error && hs.on) skip(run, 'soul bank', synced.error)
    } catch (e) {
      skip(run, 'tidy', clean(errText(e)))
    }
    run.calls = c.budget.calls
    run.tokens = c.budget.tokens
    run.usd = Math.round(c.budget.usd * 1e6) / 1e6
    state.runs.push(run)
    await saveState(io, state)
    await writeBackups(io, state).catch(e => skip(run, 'backup', clean(errText(e))))
    return run
  }
}

// The band's words for the last run in a folder.
export function bandLine(state: State, folder: string, hs: { on: boolean; reason: string } | null): string {
  const runs = state.runs.filter(r => folderKey(r.folder) === folderKey(folder) || !r.folder)
  const last = runs[runs.length - 1]
  const review = state.lessons.filter(l => l.status === 'pending').length + state.drafts.filter(d => d.status === 'pending').length + state.soul.pending.length
  const flagged = Object.values(state.skills).filter(c => c.flagged).length
  const extra = [review && (!last || last.error) ? `${review} to review in /learn` : '', flagged ? `${flagged} skill${flagged === 1 ? '' : 's'} got worse` : '', hs && !hs.on ? `Hindsight: ${hs.reason.split(';')[0]}` : ''].filter(Boolean)
  let head: string
  if (!last) head = 'Memory: nothing learned yet'
  else if (last.error && !last.error.startsWith('Skipped:') && !last.error.startsWith('Stopped:')) head = `Memory: ${last.error}`
  else if (last.error.startsWith('Skipped:')) head = `Memory: last session skipped (${last.error.slice(9).trim()})`
  else head = `Learned ${last.extracted} lesson${last.extracted === 1 ? '' : 's'}: ${last.saved} saved, ${last.queued} to review${last.error ? ` (${last.error.slice(9).trim()})` : ''}`
  return [head, ...extra].join(' · ')
}

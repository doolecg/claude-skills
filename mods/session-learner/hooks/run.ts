/** Pure rules of a run: the gate, budgets, spend, the band line, the brief, memory files, jobs and the worker. */
import type { Change, Job, LastRun, LearnerStatus, Lesson, ReviewMode, Run } from '../types'
import { normalise, similarity } from './text'

// ---------- gate ----------

export const MIN_TURNS = 2
export const MIN_TOKENS = 2000

/** Why a session is not worth learning from, or null when it passes. */
export function gateReason(g: { userTurns: number; approxTokens: number; corrections: number; changedFiles: number }): string | null {
  if (g.userTurns < MIN_TURNS) return `only ${g.userTurns} user turn${g.userTurns === 1 ? '' : 's'} (needs ${MIN_TURNS})`
  if (g.approxTokens < MIN_TOKENS) return `transcript is about ${g.approxTokens} tokens (needs ${MIN_TOKENS})`
  if (g.changedFiles === 0 && g.corrections === 0) return 'no file changes and no corrections'
  return null
}

// ---------- settings and budgets ----------

export type Settings = {
  reviewMode: ReviewMode
  maxModelCalls: number
  maxTokens: number
  maxChanges: number
  dailySpendUsd: number
}

export const DEFAULTS: Settings = { reviewMode: 'suggest', maxModelCalls: 4, maxTokens: 60000, maxChanges: 5, dailySpendUsd: 0.5 }
const MODES: readonly ReviewMode[] = ['off', 'suggest', 'controlled', 'advanced']

export function readSettings(options: Readonly<Record<string, unknown>>): Settings {
  const num = (v: unknown, d: number, min: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : d)
  const mode = MODES.includes(options.reviewMode as ReviewMode) ? (options.reviewMode as ReviewMode) : DEFAULTS.reviewMode
  return {
    reviewMode: mode,
    maxModelCalls: Math.floor(num(options.maxModelCalls, DEFAULTS.maxModelCalls, 0)),
    maxTokens: Math.floor(num(options.maxTokens, DEFAULTS.maxTokens, 0)),
    maxChanges: Math.floor(num(options.maxChanges, DEFAULTS.maxChanges, 0)),
    dailySpendUsd: num(options.dailySpendUsd, DEFAULTS.dailySpendUsd, 0),
  }
}

export type Spent = { modelCalls: number; tokens: number; changes: number; spendToday: number }

/** The budget a model call would break, or null. `need` is the tokens the call may use. */
export function modelBudgetStop(s: Settings, spent: Spent, need: number): string | null {
  if (spent.modelCalls >= s.maxModelCalls) return `max model calls per run (${s.maxModelCalls})`
  if (spent.tokens + need > s.maxTokens) return `max tokens per run (${s.maxTokens})`
  if (s.dailySpendUsd > 0 && spent.spendToday >= s.dailySpendUsd) return `daily spend cap ($${s.dailySpendUsd.toFixed(2)})`
  return null
}

export function changeBudgetStop(s: Settings, spent: Spent): string | null {
  if (spent.changes >= s.maxChanges) return `max changes per run (${s.maxChanges})`
  return null
}

export type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }

/** Dollars per million tokens (input, output). */
const PRICES: Record<string, [number, number]> = {
  haiku: [0.1, 0.5],
  sonnet: [2, 10],
  opus: [5, 25],
}

export function priceOf(model: string): [number, number] {
  const m = model.toLowerCase()
  for (const [k, v] of Object.entries(PRICES)) if (m.includes(k)) return v
  return PRICES.sonnet!
}

export function costOf(model: string, u: Usage | undefined): number {
  if (!u) return 0
  const [inp, out] = priceOf(model)
  const dollars =
    ((u.input_tokens ?? 0) * inp + (u.cache_read_input_tokens ?? 0) * inp * 0.1 + (u.cache_creation_input_tokens ?? 0) * inp * 1.25 + (u.output_tokens ?? 0) * out) / 1e6
  return Math.round(dollars * 1e6) / 1e6
}

export function tokensOf(u: Usage | undefined): number {
  if (!u) return 0
  return (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
}

/** Today's spend record, reset when the day changed. */
export function spendFor(record: unknown, day: string): { day: string; usd: number } {
  const r = record as { day?: unknown; usd?: unknown } | undefined
  return r && r.day === day && typeof r.usd === 'number' ? { day, usd: r.usd } : { day, usd: 0 }
}

// ---------- the band ----------

export function bandLine(s: LearnerStatus): string {
  if (s.isRunning) return 'Learning from this session...'
  const last = s.lastRun
  let line: string
  if (!last) line = 'Memory: nothing learned yet'
  else if (last.state === 'error') line = `Memory: ${last.error ?? 'the last run failed'}`
  else if (last.found === 0 && s.pending === 0) line = 'Memory: nothing learned yet'
  else line = `Learned ${last.found} lesson${last.found === 1 ? '' : 's'}: ${last.saved} saved, ${s.pending} to review`
  return s.warning ? `${line}. ${s.warning}` : line
}

export function lastRunOf(run: Run, pendingNow: number): LastRun {
  return {
    state: run.state === 'error' ? 'error' : 'done',
    found: run.found,
    saved: run.saved,
    review: pendingNow,
    ...(run.state === 'error' ? { error: run.errors[0] ?? 'the run failed' } : {}),
    at: run.at,
    cwd: run.cwd,
  }
}

/** The band's warning for a store that failed last run (Hindsight down). */
export function warningOf(run: Run | null): string | null {
  const h = run?.skippedStores.find(s => s.startsWith('Hindsight'))
  return h ? `${h}; it will retry next run` : null
}

export function summaryText(run: Run): string {
  if (run.state === 'skipped') return `Session Learner skipped this session: ${run.skip}.`
  if (run.state === 'error') return `Session Learner could not finish: ${run.errors[0] ?? 'unknown error'}.`
  const parts = [`Session Learner found ${run.found} lesson${run.found === 1 ? '' : 's'}: ${run.saved} saved, ${run.review} to review in /learn.`]
  if (run.merged) parts.push(`${run.merged} merged with known lessons.`)
  if (run.drafts) parts.push(`${run.drafts} skill draft${run.drafts === 1 ? '' : 's'}.`)
  if (run.budgetStop) parts.push(`Stopped at the ${run.budgetStop}.`)
  if (run.skippedStores.length) parts.push(`Skipped: ${run.skippedStores.join('; ')}.`)
  return parts.join(' ')
}

// ---------- the next-session brief ----------

export const BRIEF_MAX = 1500
export const BRIEF_LESSONS = 6

/** Ranks lessons by how many of the recently touched files they name, newest first on a tie. */
export function rankLessons(lessons: Lesson[], recentFiles: string[]): Lesson[] {
  const recent = recentFiles.map(f => f.replace(/\\/g, '/').toLowerCase())
  const score = (l: Lesson) => l.files.filter(f => recent.some(r => r.endsWith(f.toLowerCase()) || f.toLowerCase().endsWith(r))).length
  return [...lessons].sort((a, b) => score(b) - score(a) || b.updatedAt - a.updatedAt)
}

/** Keeps Hindsight's ranked texts that are not stale or rejected locally; ranks by recently touched files. */
export function briefLines(hindsight: string[] | null, local: Lesson[], recentFiles: string[], project: string): string[] {
  const mine = local.filter(l => l.project === project || l.scope === 'user')
  const dead = mine.filter(l => l.status === 'stale' || l.status === 'rejected')
  const active = mine.filter(l => l.status === 'active')
  if (hindsight && hindsight.length) {
    const recent = recentFiles.map(f => f.toLowerCase())
    const scored = hindsight
      .filter(t => !dead.some(d => similarity(d.text, t) >= 0.6))
      .map((t, i) => ({ t, score: recent.filter(f => t.toLowerCase().includes(f.split('/').pop() ?? f)).length, i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
    const out: string[] = []
    for (const s of scored) if (!out.some(o => similarity(o, s.t) >= 0.6)) out.push(s.t)
    return out.slice(0, BRIEF_LESSONS)
  }
  return rankLessons(active, recentFiles)
    .slice(0, BRIEF_LESSONS)
    .map(l => l.text)
}

export function buildBrief(lines: string[], skillsChanged: string[], max = BRIEF_MAX): string {
  if (lines.length === 0 && skillsChanged.length === 0) return ''
  const head = 'Lessons from earlier sessions in this folder (from Session Learner; follow them unless the user says otherwise):'
  const tail = skillsChanged.length ? `Skills changed since last time: ${skillsChanged.join(', ')}.` : ''
  const out: string[] = lines.length ? [head] : []
  const room = () => max - (out.join('\n').length + (tail ? tail.length + 1 : 0)) - 1
  for (const l of lines.slice(0, BRIEF_LESSONS)) {
    const line = `- ${l.replace(/\s+/g, ' ').trim()}`
    if (line.length <= room()) out.push(line)
    else if (room() > 40) out.push(`${line.slice(0, room() - 3)}...`)
  }
  if (tail) out.push(tail.length < max ? tail : tail.slice(0, max - 4) + '...')
  const text = out.join('\n')
  return text.length < max ? text : text.slice(0, max - 1)
}

export function skillsChangedSince(changes: Change[], since: number): string[] {
  const names = changes.filter(c => c.kind === 'skill' && c.at > since && !c.isRolledBack && c.skill).map(c => c.skill!)
  return [...new Set(names)]
}

// ---------- project memory ----------

/** The folder name Claude Code uses under ~/.claude/projects for a working directory. */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-')
}

export const MEMORY_FILE = 'session-learner.md'
export const MEMORY_POINTER = `- [Session Learner lessons](${MEMORY_FILE}) — lessons learned from past sessions in this project`

const MEMORY_HEAD = `---
name: session-learner
description: "Lessons Session Learner saved from past sessions in this project"
metadata:
  type: project
---
`

const tagOf = (id: string) => `<!-- sl:${id} -->`

/** Adds one lesson line, unless the same lesson (by id or by text) is already there. */
export function addMemoryLine(existing: string | null, id: string, kind: string, text: string): string {
  const base = existing && existing.trim() ? existing.replace(/\s*$/, '\n') : `${MEMORY_HEAD}\n`
  const line = `- (${kind}) ${text.replace(/\s+/g, ' ').trim()} ${tagOf(id)}`
  const lines = base.split('\n')
  if (lines.some(l => l.includes(tagOf(id)))) return base
  const n = normalise(text)
  if (lines.some(l => l.startsWith('- ') && normalise(l.replace(/<!--.*?-->/g, '').replace(/^- \([a-z]+\)/, '')) === n)) return base
  return `${base}${line}\n`
}

export function removeMemoryLine(existing: string | null, id: string): string | null {
  if (!existing) return existing
  const lines = existing.split('\n')
  const kept = lines.filter(l => !l.includes(tagOf(id)))
  return kept.length === lines.length ? existing : kept.join('\n')
}

export function hasMemoryLine(existing: string | null, id: string): boolean {
  return !!existing && existing.includes(tagOf(id))
}

/** MEMORY.md with the pointer line to the lessons file, added once. */
export function ensurePointer(memoryMd: string | null): string {
  const base = memoryMd ?? ''
  if (base.includes(`](${MEMORY_FILE})`)) return base
  return `${base.replace(/\s*$/, base.trim() ? '\n' : '')}${MEMORY_POINTER}\n`
}

// ---------- jobs and the worker ----------

export const PICKUP_AFTER_MS = 2 * 60 * 1000
export const DEAD_AFTER_MS = 15 * 60 * 1000

/** Which job files a session start should pick up: pending ones left over 2 minutes, running ones dead over 15. */
export function jobsToPickUp(jobs: Job[], now: number): Job[] {
  return jobs.filter(j => {
    if (j.state === 'pending') return now - j.createdAt >= PICKUP_AFTER_MS
    if (j.state === 'running') return now - (j.startedAt ?? j.createdAt) >= DEAD_AFTER_MS
    return false
  })
}

export function parseJob(text: string): Job | null {
  try {
    const j = JSON.parse(text) as Job
    if (!j || typeof j.id !== 'string' || typeof j.sessionId !== 'string' || typeof j.cwd !== 'string') return null
    if (!['pending', 'running', 'done'].includes(j.state)) return null
    return j
  } catch {
    return null
  }
}

/** Whether a session.end reason counts as the app stopping or archiving the session. */
export function endCounts(reason: string): boolean {
  return reason !== 'clear' && reason !== 'resume'
}

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`

/** The command that starts the learner worker detached with a hidden window; job path and flag ride in the env. */
export function workerArgv(opts: { windows: boolean; pluginDir: string | null }): string[] {
  const args = ['-p', 'learn', '--no-session-persistence', '--strict-mcp-config']
  if (opts.pluginDir) args.push('--plugin-dir', opts.pluginDir)
  if (opts.windows) {
    // Start-Process joins -ArgumentList with spaces, so arguments holding spaces get their own double quotes.
    const list = args.map(a => psQuote(/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(',')
    const script = `Start-Process -WindowStyle Hidden -FilePath 'claude' -ArgumentList @(${list})`
    return ['powershell', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script]
  }
  return ['sh', '-c', 'nohup "$@" >/dev/null 2>&1 &', 'sh', 'claude', ...args]
}

/** A plugin root under ~/.claude/plugins is installed; anything else was loaded for development. */
export function isInstalledRoot(root: string, home: string | null): boolean {
  if (!home) return false
  const r = root.replace(/\\/g, '/').toLowerCase()
  const p = `${home.replace(/\\/g, '/').replace(/\/+$/, '')}/.claude/plugins/`.toLowerCase()
  return r.startsWith(p)
}

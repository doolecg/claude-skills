// The mod's records, kept as files in <config>/self-improve so the session and the detached learner share them:
// state.json (lessons, drafts, changes, runs, scorecard, soul sync), plus markdown copies people can read
// (runs.md and drafts/<name>.md). Project lessons also live in the project's memory folder (memory.ts).

import type { Io } from './io'
import { joinPath, modDir } from './paths'

export type LessonKind = 'convention' | 'pitfall' | 'correction' | 'procedure'
export const LESSON_KINDS: LessonKind[] = ['convention', 'pitfall', 'correction', 'procedure']

export type LessonStatus = 'pending' | 'active' | 'stale' | 'rejected' | 'deleted'
export type Store = 'hindsight' | 'memory' | 'soul'

export type Lesson = {
  id: number
  // The project folder (as the session had it); '' for a user-scope fact.
  folder: string
  // The project's folder name: the Hindsight bank is coding-agent::<project>. Set alone (folder '') for a lesson
  // imported from the old self-improve plugin, which kept only the name.
  project: string
  kind: LessonKind
  // Ids of known lessons this one proves wrong; retired when it is applied.
  supersedes: number[]
  scope: 'project' | 'user'
  section: string
  text: string
  files: string[]
  symbols: string[]
  skill: string | null
  sessions: string[]
  status: LessonStatus
  stores: Store[]
  // Waiting for Hindsight (it was down or off when the lesson was written); sent on a later run.
  hindsightPending: boolean
  // Why it waits for review, when it does.
  reviewReason: string
  hits: number
  createdAt: number
  updatedAt: number
}

export type DraftKind = 'new' | 'fix' | 'rewrite'
export type DraftStatus = 'pending' | 'approved' | 'rejected' | 'rolledBack'

export type Draft = {
  id: number
  kind: DraftKind
  name: string
  body: string
  // The installed skill a fix or rewrite is for, and where its text is read from.
  sourcePath: string
  // Where approval writes: the skill itself, or a local override in the skills folder for a plugin's skill.
  targetPath: string
  isOverride: boolean
  status: DraftStatus
  // '' when the draft passes validation; otherwise the first rule it fails.
  validation: string
  lessonIds: number[]
  sessions: string[]
  previousBody: string | null
  installedAt: number | null
  createdAt: number
}

export type ChangeKind = 'lesson' | 'skill' | 'soul'

export type Change = {
  id: number
  at: number
  kind: ChangeKind
  targetId: number
  title: string
  before: string
  after: string
  // Applied by the mod on its own (controlled or advanced mode, staleness) rather than by a person's approval.
  auto: boolean
  status: 'applied' | 'rolledBack'
}

export type Skip = { store: string; reason: string }

export type Run = {
  id: number
  at: number
  sessionId: string
  folder: string
  trigger: string
  extracted: number
  saved: number
  queued: number
  merged: number
  staled: number
  drafts: number
  skipped: Skip[]
  // 'Skipped: ...' for a gated session, 'Stopped: ...' for a budget, else the error; '' when the run went through.
  error: string
  calls: number
  tokens: number
  usd: number
  model: string
}

export type SkillUse = { sessionId: string; at: number; corrected: boolean; interrupts: number; failures: number; turnsToEnd: number }

export type SkillCard = { loads: number; uses: SkillUse[]; changedAt: number | null; flagged: boolean }

export type State = {
  version: 1
  nextId: number
  lessons: Lesson[]
  drafts: Draft[]
  changes: Change[]
  runs: Run[]
  skills: Record<string, SkillCard>
  soul: { pushed: string[]; seen: string[]; pending: { id: string; section: string; text: string }[]; lastSync: number; lastError: string }
  spend: { day: string; usd: number }
  // User turns already learned from, per session id, so a session is never sent twice.
  learned: Record<string, number>
  // Per folder, when its last session started: the brief's "Skills changed since last time".
  lastStart: Record<string, number>
  // One-time steps: the first soul.md seed, and the import from the old self-improve plugin (1.0.0).
  seededAt: number
  migratedAt: number
}

export const emptyState = (): State => ({
  version: 1,
  nextId: 1,
  lessons: [],
  drafts: [],
  changes: [],
  runs: [],
  skills: {},
  soul: { pushed: [], seen: [], pending: [], lastSync: 0, lastError: '' },
  spend: { day: '', usd: 0 },
  learned: {},
  lastStart: {},
  seededAt: 0,
  migratedAt: 0,
})

const RUNS_KEPT = 200
const CHANGES_KEPT = 400

export const statePath = (io: Pick<Io, 'config' | 'isWindows'>): string => joinPath(io.isWindows, modDir(io.config, io.isWindows), 'state.json')

export async function loadState(io: Io): Promise<State> {
  const text = await io.read(statePath(io)).catch(() => null)
  if (!text) return emptyState()
  try {
    const raw = JSON.parse(text) as Partial<State>
    const base = emptyState()
    return { ...base, ...raw, soul: { ...base.soul, ...(raw.soul ?? {}) }, spend: { ...base.spend, ...(raw.spend ?? {}) } }
  } catch {
    return emptyState()
  }
}

export async function saveState(io: Io, s: State): Promise<void> {
  s.runs = s.runs.slice(-RUNS_KEPT)
  s.changes = s.changes.slice(-CHANGES_KEPT)
  s.soul.seen = s.soul.seen.slice(-5000)
  await io.write(statePath(io), JSON.stringify(s, null, 1))
}

export const newId = (s: State): number => s.nextId++

export function addChange(s: State, c: Omit<Change, 'id' | 'status'>): Change {
  const change: Change = { ...c, id: newId(s), status: 'applied' }
  s.changes.push(change)
  return change
}

// Markdown copies

const day = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 16)

export function runLine(r: Run): string {
  const counts = `${r.extracted} found, ${r.saved} saved, ${r.queued} to review, ${r.merged} merged, ${r.staled} stale, ${r.drafts} skill drafts`
  const skips = r.skipped.map(k => `${k.store} skipped: ${k.reason}`).join('; ')
  return `- ${day(r.at)} | ${r.folder || 'no folder'} | ${r.trigger} | ${r.error || counts}${skips ? ` | ${skips}` : ''} | ${r.calls} calls, ~${r.tokens} tokens, ~$${r.usd.toFixed(4)}`
}

export function runsMarkdown(runs: readonly Run[]): string {
  return `# Self Improve runs\n\nNewest last. Written by the Self Improve mod.\n\n${runs.map(runLine).join('\n')}\n`
}

export function draftMarkdown(d: Draft): string {
  const head = [`<!-- Self Improve draft ${d.id}: ${d.kind} ${d.name}, ${d.status}${d.validation ? `, fails: ${d.validation}` : ', passes validation'} -->`]
  if (d.targetPath) head.push(`<!-- installs to: ${d.targetPath} -->`)
  return `${head.join('\n')}\n${d.body}`
}

export async function writeBackups(io: Io, s: State, draftIds?: readonly number[]): Promise<void> {
  const dir = modDir(io.config, io.isWindows)
  await io.write(joinPath(io.isWindows, dir, 'runs.md'), runsMarkdown(s.runs))
  for (const d of s.drafts) {
    if (draftIds && !draftIds.includes(d.id)) continue
    await io.write(joinPath(io.isWindows, dir, 'drafts', `${d.id}-${d.name}.md`), draftMarkdown(d))
  }
}

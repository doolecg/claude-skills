export type LessonKind = 'convention' | 'pitfall' | 'correction' | 'procedure'
export type LessonScope = 'project' | 'user'
export type LessonStatus = 'pending' | 'active' | 'stale' | 'rejected'
export type ReviewMode = 'off' | 'suggest' | 'controlled' | 'advanced'

export type Lesson = {
  id: string
  kind: LessonKind
  /** One sentence. */
  text: string
  scope: LessonScope
  files: string[]
  symbols: string[]
  /** The skill a correction points at, when Claude had loaded it. */
  skill?: string
  sourceSession: string
  /** Every session that taught it (merges add to this). */
  sessions: string[]
  /** Folder key of the project (normalised, lower case). */
  project: string
  /** The project folder as spelled, for display and for writes. */
  cwd: string
  status: LessonStatus
  /** Stores it is written to: 'hindsight', 'memory'. */
  stores: string[]
  /** Why it waits (a contradiction, a risky word, a budget stop). */
  hold?: string
  createdAt: number
  updatedAt: number
}

export type DraftType = 'new' | 'fix' | 'rewrite' | 'override'

export type Draft = {
  id: string
  type: DraftType
  /** The skill name the draft installs as. */
  skill: string
  /** The skill it came from, for fix, rewrite and override. */
  baseSkill?: string
  /** SKILL.md the draft writes. */
  path: string
  before: string | null
  after: string
  status: 'pending' | 'applied' | 'rejected'
  problems: string[]
  reason: string
  createdAt: number
  project: string
}

export type Change = {
  id: string
  at: number
  kind: 'lesson' | 'skill' | 'stale'
  /** What changed, in words. */
  title: string
  before: string | null
  after: string | null
  isAuto: boolean
  lessonId?: string
  draftId?: string
  path?: string
  skill?: string
  isRolledBack?: boolean
  notes?: string[]
}

export type Run = {
  id: string
  at: number
  sessionId: string
  cwd: string
  trigger: string
  state: 'done' | 'skipped' | 'error'
  skip?: string
  found: number
  saved: number
  review: number
  merged: number
  stale: number
  drafts: number
  errors: string[]
  skippedStores: string[]
  budgetStop?: string
  modelCalls: number
  tokens: number
  spendUsd: number
  notes: string[]
}

export type SkillSession = {
  sessionId: string
  at: number
  corrected: boolean
  interrupts: number
  failures: number
  turnsToDone: number | null
}

export type SkillCard = {
  name: string
  loads: number
  history: SkillSession[]
  changedAt?: number
  changeId?: string
  isWorse?: boolean
}

export type LastRun = {
  state: 'running' | 'done' | 'error'
  found: number
  saved: number
  review: number
  error?: string
  at: number
  cwd: string
}

export type Job = {
  id: string
  sessionId: string
  cwd: string
  transcriptPath: string
  startHead: string
  note: string
  reason: string
  createdAt: number
  state: 'pending' | 'running' | 'done'
  startedAt?: number
  finishedAt?: number
}

export type LearnerSession = {
  id: string
  cwd: string
  startHead: string
  transcriptPath: string
  edits: number
  isOff: boolean
  isQueued: boolean
  note: string
}

export type LearnerStatus = {
  isRunning: boolean
  lastRun: LastRun | null
  /** A store that failed last run, shown in the band (Hindsight down). */
  warning: string | null
  /** Lessons and drafts waiting for review in this folder. */
  pending: number
}

export type LearnerTab = 'lessons' | 'drafts' | 'skills' | 'changes' | 'runs' | 'settings'

export type LearnerView = {
  tab: LearnerTab
  kind: 'all' | LessonKind
  store: 'all' | 'pending' | 'project' | 'user' | 'stale'
  search: string
  editing: string | null
  editText: string
  confirm: { action: string; ids: string[]; text: string } | null
  notice: string | null
  test: string | null
}

export type LearnerData = {
  lessons: Lesson[]
  drafts: Draft[]
  changes: Change[]
  runs: Run[]
  cards: SkillCard[]
}

declare module 'claude-code' {
  interface PluginState {
    'session-learner': {
      session: LearnerSession
      status: LearnerStatus
      view: LearnerView
      data: LearnerData
      bandPick: { value: boolean; from: boolean } | null
    }
  }
}

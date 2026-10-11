/** Lessons: parsing the model's JSON, checking them against the evidence, merging, risk and staleness. */
import type { Lesson, LessonKind, LessonScope, ReviewMode } from '../types'
import { contradicts, firstSentence, hasSecret, similarity } from './text'

export const MAX_LESSONS = 8
const KINDS: readonly LessonKind[] = ['convention', 'pitfall', 'correction', 'procedure']

export type Candidate = {
  kind: LessonKind
  text: string
  scope: LessonScope
  files: string[]
  symbols: string[]
  skill?: string
}

export type ParseResult = { lessons: Candidate[]; dropped: string[] }

/** Pulls the first JSON array (or `{ "lessons": [...] }`) out of a model reply. */
export function extractJson(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = (fence ? fence[1]! : text).trim()
  for (const [open, close] of [
    ['[', ']'],
    ['{', '}'],
  ] as const) {
    const start = body.indexOf(open)
    const end = body.lastIndexOf(close)
    if (start < 0 || end <= start) continue
    try {
      return JSON.parse(body.slice(start, end + 1))
    } catch {
      // try the other shape
    }
  }
  return null
}

const strings = (v: unknown): string[] | null => {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) return null
  if (!v.every(x => typeof x === 'string')) return null
  return (v as string[]).map(s => s.trim()).filter(Boolean)
}

/** Parses the model's reply into candidate lessons; anything malformed is dropped (and named in `dropped`). */
export function parseLessons(reply: string): ParseResult {
  const raw = extractJson(reply)
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { lessons?: unknown }).lessons) ? (raw as { lessons: unknown[] }).lessons : null
  if (!list) return { lessons: [], dropped: reply.trim() ? ['the reply was not JSON'] : [] }
  const lessons: Candidate[] = []
  const dropped: string[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      dropped.push('not an object')
      continue
    }
    const o = item as Record<string, unknown>
    const kind = o.kind as LessonKind
    const scope = (o.scope ?? 'project') as LessonScope
    const files = strings(o.files)
    const symbols = strings(o.symbols)
    if (!KINDS.includes(kind)) {
      dropped.push(`unknown kind ${String(o.kind)}`)
      continue
    }
    if (scope !== 'project' && scope !== 'user') {
      dropped.push(`unknown scope ${String(o.scope)}`)
      continue
    }
    if (typeof o.text !== 'string' || o.text.trim().length < 8) {
      dropped.push('no text')
      continue
    }
    if (files === null || symbols === null) {
      dropped.push('files or symbols not a list of strings')
      continue
    }
    const skill = typeof o.skill === 'string' && o.skill.trim() ? o.skill.trim() : undefined
    lessons.push({ kind, scope, text: firstSentence(o.text), files, symbols, ...(skill ? { skill } : {}) })
  }
  return { lessons, dropped }
}

export type EvidenceIndex = {
  /** Files the session touched or changed, relative to the project or absolute. */
  files: string[]
  /** Symbols that appear in the evidence (declarations, hunk names, CodeGraph output). */
  symbols: string[]
  /** All evidence text, for a last check that a symbol was really mentioned. */
  text: string
  /** Skills Claude loaded this session. */
  skills: string[]
  cwd: string
}

const slashLower = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()

/** Matches a lesson's file against the evidence: the same path, a path ending in it, or the same file name. */
export function fileInEvidence(file: string, ev: EvidenceIndex): string | null {
  const f = slashLower(file)
  const root = slashLower(ev.cwd).replace(/\/+$/, '')
  const rel = f.startsWith(`${root}/`) ? f.slice(root.length + 1) : f
  for (const known of ev.files) {
    const k = slashLower(known)
    const kRel = k.startsWith(`${root}/`) ? k.slice(root.length + 1) : k
    if (kRel === rel || kRel.endsWith(`/${rel}`) || rel.endsWith(`/${kRel}`)) return kRel
  }
  if (!rel.includes('/')) {
    for (const known of ev.files) {
      const k = slashLower(known)
      if (k.endsWith(`/${rel}`) || k === rel) {
        const kRel = k.startsWith(`${root}/`) ? k.slice(root.length + 1) : k
        return kRel
      }
    }
  }
  return null
}

export function symbolInEvidence(symbol: string, ev: EvidenceIndex): boolean {
  const s = symbol.replace(/\(\)$/, '').trim()
  if (!s) return false
  if (ev.symbols.includes(s)) return true
  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`).test(ev.text)
}

export type CheckResult = { kept: Candidate[]; dropped: string[] }

/** Drops lessons that name files or symbols the evidence does not hold, or that carry a secret; keeps at most 8. */
export function checkAgainstEvidence(candidates: Candidate[], ev: EvidenceIndex): CheckResult {
  const kept: Candidate[] = []
  const dropped: string[] = []
  for (const c of candidates) {
    if (hasSecret(c.text) || c.files.some(hasSecret) || c.symbols.some(hasSecret)) {
      dropped.push('held a secret')
      continue
    }
    const files: string[] = []
    let badFile: string | null = null
    for (const f of c.files) {
      const hit = fileInEvidence(f, ev)
      if (hit === null) {
        badFile = f
        break
      }
      if (!files.includes(hit)) files.push(hit)
    }
    if (badFile !== null) {
      dropped.push(`named a file not in the session: ${badFile}`)
      continue
    }
    const badSymbol = c.symbols.find(s => !symbolInEvidence(s, ev))
    if (badSymbol !== undefined) {
      dropped.push(`named a symbol not in the session: ${badSymbol}`)
      continue
    }
    const skill = c.skill && ev.skills.some(s => s === c.skill || s.endsWith(`:${c.skill}`) || c.skill!.endsWith(`:${s}`)) ? c.skill : undefined
    if (kept.length >= MAX_LESSONS) {
      dropped.push('over the limit of 8')
      continue
    }
    kept.push({ ...c, files, symbols: c.symbols.map(s => s.replace(/\(\)$/, '')), ...(skill ? { skill } : { skill: undefined }) })
  }
  return { kept: kept.map(k => (k.skill === undefined ? withoutSkill(k) : k)), dropped }
}

function withoutSkill(c: Candidate): Candidate {
  const { skill: _skill, ...rest } = c
  return rest
}

export const SAME_LESSON = 0.6

/** The existing lesson this candidate repeats: similar text, and the same files when both name files. */
export function findDuplicate(c: { text: string; files: string[] }, existing: Lesson[]): Lesson | null {
  let best: { lesson: Lesson; score: number } | null = null
  for (const l of existing) {
    if (l.status === 'rejected') continue
    const score = similarity(c.text, l.text)
    if (score < SAME_LESSON) continue
    const fa = c.files.map(slashLower)
    const fb = l.files.map(slashLower)
    if (fa.length && fb.length && !fa.some(f => fb.includes(f))) continue
    if (!best || score > best.score) best = { lesson: l, score }
  }
  return best?.lesson ?? null
}

/** Folds a repeat into the lesson it repeats: more sessions, the union of files and symbols. */
export function mergeInto(target: Lesson, c: { files: string[]; symbols: string[]; sourceSession?: string; sessions?: string[] }, now: number): Lesson {
  const sessions = [...target.sessions]
  for (const s of [...(c.sessions ?? []), ...(c.sourceSession ? [c.sourceSession] : [])]) if (!sessions.includes(s)) sessions.push(s)
  const files = [...target.files]
  for (const f of c.files) if (!files.some(x => slashLower(x) === slashLower(f))) files.push(f)
  const symbols = [...target.symbols]
  for (const s of c.symbols) if (!symbols.includes(s)) symbols.push(s)
  return { ...target, sessions, files, symbols, updatedAt: now }
}

export function findContradiction(text: string, others: Array<{ text: string }>): string | null {
  for (const o of others) if (contradicts(text, o.text)) return o.text
  return null
}

const RISKY = [
  { re: /https?:\/\/|www\./i, why: 'names a URL' },
  { re: /\balways\b/i, why: 'says "always"' },
  { re: /\bnever\b/i, why: 'says "never"' },
  { re: /`[^`]+`/, why: 'names a command' },
  {
    re: /\b(npm|npx|pnpm|yarn|bun|git|gradle|gradlew|mvn|pip|python|node|cargo|go|make|docker|kubectl|curl|wget|rm|del|sudo|powershell|bash|sh|claude)\s+[a-z-]/i,
    why: 'names a command',
  },
]

/** Why a lesson must wait for review in controlled mode, or null when it is low risk. */
export function riskOf(text: string): string | null {
  for (const r of RISKY) if (r.re.test(text)) return r.why
  return null
}

/** Whether a lesson applies itself under this review mode. */
export function appliesItself(mode: ReviewMode, text: string, hold?: string): boolean {
  if (mode === 'controlled' || mode === 'advanced') return !hold && riskOf(text) === null
  return false
}

/** A lesson is stale when it names files and all are gone, or names symbols and none still exist. */
export function isStale(lesson: Pick<Lesson, 'files' | 'symbols'>, fileExists: Record<string, boolean>, symbolExists: Record<string, boolean> | null): boolean {
  if (lesson.files.length > 0 && lesson.files.every(f => fileExists[f] === false)) return true
  if (symbolExists && lesson.symbols.length > 0 && lesson.symbols.every(s => symbolExists[s] === false)) return true
  return false
}

export function filterLessons(
  lessons: Lesson[],
  f: { kind: string; store: string; search: string; project?: string },
): Lesson[] {
  const q = f.search.trim().toLowerCase()
  return lessons.filter(l => {
    if (l.status === 'rejected') return false
    if (f.project && l.project !== f.project && l.scope !== 'user') return false
    if (f.kind !== 'all' && l.kind !== f.kind) return false
    if (f.store === 'pending' && l.status !== 'pending') return false
    if (f.store === 'stale' && l.status !== 'stale') return false
    if ((f.store === 'project' || f.store === 'user') && (l.scope !== f.store || l.status !== 'active')) return false
    if (q && !`${l.text} ${l.files.join(' ')} ${l.symbols.join(' ')}`.toLowerCase().includes(q)) return false
    return true
  })
}

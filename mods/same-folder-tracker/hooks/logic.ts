import type { TrackerPhase, TrackerView } from '../types'

export const DROP_MS = 30 * 60_000
export const MAX_PATHS = 50
export const MAX_BAND_SESSIONS = 3
// Entries nobody has touched for a day are dead sessions; any session may remove them.
export const PRUNE_MS = 24 * 60 * 60_000

const PHASES: readonly TrackerPhase[] = ['working', 'waiting', 'idle', 'done']

/** What one session keeps in the store about itself. Paths only, never file contents. */
export type Entry = {
  sid: string
  folder: string
  phase: TrackerPhase
  updatedAt: number
  files: string[]
}

const slashes = (p: string): string => p.replace(/\\/g, '/')

/** The key two sessions share when they run in the same folder: case-insensitive, no trailing slash. */
export function folderKey(cwd: string): string {
  let p = slashes(cwd).trim()
  while (p.length > 1 && p.endsWith('/') && !/^[a-zA-Z]:\/$/.test(p)) p = p.slice(0, -1)
  return p.toLowerCase()
}

const isAbsolute = (p: string): boolean => p.startsWith('/') || /^[a-zA-Z]:\//.test(p)

/** An edited file's path with forward slashes, made absolute against the session folder when it is relative. */
export function resolvePath(path: string, cwd: string): string {
  const p = slashes(path).trim()
  if (p === '' || isAbsolute(p)) return p
  const base = slashes(cwd).replace(/\/+$/, '')
  return `${base}/${p.replace(/^\.\//, '')}`
}

export const pathKey = (path: string): string => slashes(path).toLowerCase()

export function baseName(path: string): string {
  const p = slashes(path).replace(/\/+$/, '')
  const i = p.lastIndexOf('/')
  return i === -1 ? p : p.slice(i + 1)
}

/** Adds a path as the most recent one: a path edited again moves to the end, and only the last 50 are kept. */
export function addPath(files: readonly string[], path: string, max = MAX_PATHS): string[] {
  const key = pathKey(path)
  const next = files.filter(f => pathKey(f) !== key)
  next.push(slashes(path))
  return next.length > max ? next.slice(next.length - max) : next
}

export const entryKey = (folder: string, sid: string): string => `s|${folder}|${sid}`
export const folderPrefix = (folder: string): string => `s|${folder}|`
export const ENTRY_PREFIX = 's|'

/** Reads a stored value back into an Entry, or null when it is not one. */
export function parseEntry(raw: unknown): Entry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.sid !== 'string' || typeof r.folder !== 'string') return null
  if (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt)) return null
  if (!PHASES.includes(r.phase as TrackerPhase)) return null
  const files = Array.isArray(r.files) ? r.files.filter((f): f is string => typeof f === 'string') : []
  return {
    sid: r.sid,
    folder: r.folder,
    phase: r.phase as TrackerPhase,
    updatedAt: r.updatedAt,
    files: files.slice(-MAX_PATHS),
  }
}

/** A session is live until it says it is done or goes 30 minutes without an update. */
export function isLive(entry: Entry, now: number): boolean {
  return entry.phase !== 'done' && now - entry.updatedAt <= DROP_MS
}

/** The other live sessions in one folder, most recently updated first. */
export function liveOthers(entries: readonly Entry[], selfSid: string, folder: string, now: number): Entry[] {
  return entries
    .filter(e => e.sid !== selfSid && e.folder === folder && isLive(e, now))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** The first of the other sessions that already edited this file, or null. */
export function clashFor(others: readonly Entry[], path: string): Entry | null {
  const key = pathKey(path)
  return others.find(o => o.files.some(f => pathKey(f) === key)) ?? null
}

/**
 * The toast rule: one warning per file per session. Returns true, and remembers
 * the file, only the first time another live session has already edited it.
 */
export function claimToast(warned: Set<string>, others: readonly Entry[], path: string): boolean {
  const key = pathKey(path)
  if (warned.has(key)) return false
  if (clashFor(others, path) === null) return false
  warned.add(key)
  return true
}

export function toView(entry: Entry): TrackerView {
  const last = entry.files[entry.files.length - 1]
  return {
    sid: entry.sid,
    phase: entry.phase === 'done' ? 'idle' : entry.phase,
    file: last === undefined ? null : baseName(last),
    count: entry.files.length,
  }
}

const PHASE_TEXT: Record<TrackerView['phase'], string> = {
  working: 'working',
  waiting: 'waiting on permission',
  idle: 'idle',
}

export function sessionLine(view: TrackerView): string {
  const head = `Other session: ${PHASE_TEXT[view.phase]}`
  if (view.file === null) return head
  return `${head} — editing ${view.file} (${view.count} ${view.count === 1 ? 'file' : 'files'})`
}

/** The band's lines: up to three sessions, then a note for any more. Empty when there are none. */
export function bandLines(views: readonly TrackerView[]): string[] {
  const lines = views.slice(0, MAX_BAND_SESSIONS).map(sessionLine)
  const extra = views.length - MAX_BAND_SESSIONS
  if (extra > 0) lines.push(`+${extra} more ${extra === 1 ? 'session' : 'sessions'} in this folder`)
  return lines
}

export const toastText = (path: string): string =>
  `Another session in this folder already edited ${baseName(path)}.`

/** The file an Edit, Write or NotebookEdit call touches, or null for any other call. */
export function editedPath(tool: string, input: { file_path?: unknown; notebook_path?: unknown }): string | null {
  if (tool === 'Edit' || tool === 'Write') return typeof input.file_path === 'string' ? input.file_path : null
  if (tool === 'NotebookEdit') return typeof input.notebook_path === 'string' ? input.notebook_path : null
  return null
}

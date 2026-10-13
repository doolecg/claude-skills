// Job files: session.end has 1.5 s, so it only writes a job and starts a detached learner. A job left behind
// (the machine slept, the process died) is picked up by the next session's start and run once.

import type { Io } from './io'
import type { Job } from './learner'
import { joinPath, modDir } from './paths'

export type JobFile = Job & { status: 'queued' | 'running'; startedAt: number; attempts: number }

// A running job older than this is taken to have died with its process.
export const STALE_RUNNING_MS = 15 * 60 * 1000
// A queued job is left to its own detached learner for this long before a session start picks it up.
export const PICKUP_AFTER_MS = 2 * 60 * 1000

export const jobsDir = (io: Pick<Io, 'config' | 'isWindows'>): string => joinPath(io.isWindows, modDir(io.config, io.isWindows), 'jobs')
export const jobPath = (io: Pick<Io, 'config' | 'isWindows'>, sessionId: string): string => joinPath(io.isWindows, jobsDir(io), `${sessionId.replace(/[^\w-]/g, '_')}.json`)

export async function writeJob(io: Io, job: Job): Promise<string> {
  const path = jobPath(io, job.sessionId)
  const file: JobFile = { ...job, status: 'queued', startedAt: 0, attempts: 0 }
  await io.write(path, JSON.stringify(file))
  return path
}

export async function readJob(io: Io, sessionId: string): Promise<JobFile | null> {
  const text = await io.read(jobPath(io, sessionId)).catch(() => null)
  if (!text) return null
  try {
    return JSON.parse(text) as JobFile
  } catch {
    return null
  }
}

export async function listJobs(io: Io): Promise<JobFile[]> {
  const out: JobFile[] = []
  const entries = await io.list(jobsDir(io)).catch(() => [])
  for (const e of entries) {
    if (e.kind !== 'file' || !e.name.endsWith('.json')) continue
    const j = await readJob(io, e.name.slice(0, -5))
    if (j) out.push(j)
  }
  return out
}

// Whether a job may be taken now: queued long enough, or running so long its process must have died. Tried twice at most.
export const isDue = (j: JobFile, now: number, currentSession: string): boolean =>
  j.sessionId !== currentSession &&
  j.attempts < 2 &&
  ((j.status === 'queued' && now - j.createdAt >= PICKUP_AFTER_MS) || (j.status === 'running' && now - j.startedAt >= STALE_RUNNING_MS))

// Marks the job running, then reads it back: a second taker that wrote in between sees its own mark lost.
export async function claimJob(io: Io, sessionId: string, now: number, by: string): Promise<JobFile | null> {
  const j = await readJob(io, sessionId)
  if (!j) return null
  if (j.status === 'running' && now - j.startedAt < STALE_RUNNING_MS) return null
  const mine = { ...j, status: 'running' as const, startedAt: now, attempts: j.attempts + 1, by }
  await io.write(jobPath(io, sessionId), JSON.stringify(mine))
  const back = (await readJob(io, sessionId)) as (JobFile & { by?: string }) | null
  return back && back.by === by ? mine : null
}

export async function finishJob(io: Io, sessionId: string): Promise<void> {
  await io.remove(jobPath(io, sessionId)).catch(() => undefined)
}

// The command that starts the detached learner: a headless Claude Code run of /self-improve-run <session>, with a hidden
// window on Windows, and no window or terminal tie elsewhere.
export function workerArgv(o: { isWindows: boolean; sessionId: string; pluginDir: string | null; cwd: string }): string[] {
  const args = ['-p', `/self-improve-run ${o.sessionId}`, '--output-format', 'text']
  if (o.pluginDir) args.push('--plugin-dir', o.pluginDir)
  if (o.isWindows) {
    // Start-Process joins -ArgumentList with spaces and quotes nothing, so the command line is built here.
    const line = args.map(a => (/[\s"]/.test(a) ? `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"` : a)).join(' ')
    const quoted = `'${line.replace(/'/g, "''")}'`
    return [
      'powershell',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      `Start-Process -WindowStyle Hidden -WorkingDirectory '${o.cwd.replace(/'/g, "''")}' -FilePath 'claude' -ArgumentList ${quoted}`,
    ]
  }
  const sh = (a: string) => `'${a.replace(/'/g, `'\\''`)}'`
  return ['sh', '-c', `cd ${sh(o.cwd)} && nohup claude ${args.map(sh).join(' ')} >/dev/null 2>&1 &`]
}

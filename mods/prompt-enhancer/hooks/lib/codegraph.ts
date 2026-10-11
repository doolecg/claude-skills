import { dirname, isWindows, joinPath, normPath } from './paths'
import type { Io } from './io'

export const NOT_INDEXED = 'CodeGraph: not indexed'
export const DEFAULT_EXPLORE_TIMEOUT_MS = 20000
const MAX_QUERY = 600

export type ExploreResult = { ok: true; text: string } | { ok: false; reason: string }

/** The folder that holds the nearest `.codegraph/` at or above `cwd`, or null. */
export async function findIndex(io: Io, cwd: string): Promise<string | null> {
  let dir = normPath(cwd)
  for (let guard = 0; guard < 64; guard++) {
    try {
      const st = await io.fs.stat(joinPath(dir, '.codegraph'))
      if (st.kind === 'dir') return dir
    } catch {
      // not here, keep climbing
    }
    const up = dirname(dir)
    if (up === dir || up === '.') return null
    dir = up
  }
  return null
}

/** Keeps the query one plain line; on Windows also drops what cmd.exe would treat as syntax. */
export function cleanQuery(query: string, forCmd: boolean): string {
  const base = query.replace(/[\u0000-\u001f]+/g, ' ')
  const safe = forCmd ? base.replace(/[&|<>^%!"`()]/g, ' ') : base
  return safe.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY)
}

/** The argv for `codegraph explore`; Windows goes through `cmd /c` because the npm shim is codegraph.cmd. */
export function exploreArgv(query: string, opts: { windows: boolean; maxFiles?: number }): string[] {
  const args = ['explore']
  if (opts.maxFiles && opts.maxFiles > 0) args.push('--max-files', String(Math.floor(opts.maxFiles)))
  args.push(cleanQuery(query, opts.windows))
  return opts.windows ? ['cmd', '/c', 'codegraph', ...args] : ['codegraph', ...args]
}

/** Runs the global `codegraph explore` in `root`. Read-only: never init, index or sync. */
export async function explore(
  io: Io,
  root: string,
  query: string,
  opts: { timeoutMs?: number; maxFiles?: number } = {},
): Promise<ExploreResult> {
  const windows = await isWindows(io, root)
  if (cleanQuery(query, windows) === '') return { ok: false, reason: 'empty query' }
  try {
    const run = await io.process.run(exploreArgv(query, { windows, maxFiles: opts.maxFiles }), {
      cwd: root,
      timeoutMs: opts.timeoutMs ?? DEFAULT_EXPLORE_TIMEOUT_MS,
    })
    const text = run.stdout.trim()
    if (/no \.codegraph\/ index exists|isn't available here/i.test(text) || /no \.codegraph\/ index exists/i.test(run.stderr)) {
      return { ok: false, reason: NOT_INDEXED }
    }
    if (run.exitCode !== 0) {
      const err = (run.stderr.trim() || text).split('\n')[0] ?? ''
      return { ok: false, reason: `exit ${run.exitCode}${err ? `: ${err.slice(0, 160)}` : ''}` }
    }
    return text === '' ? { ok: false, reason: 'no output' } : { ok: true, text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/time(d)? ?out|still running/i.test(msg)) return { ok: false, reason: 'timeout' }
    return { ok: false, reason: `codegraph not available: ${msg.slice(0, 160)}` }
  }
}

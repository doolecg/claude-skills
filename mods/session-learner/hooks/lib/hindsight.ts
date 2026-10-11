import { basename, dirname, folderKey, homeDir, isAbsolutePath, joinPath, normPath, resolvePath } from './paths'
import type { Io } from './io'

/**
 * Client for the user's self-hosted Hindsight server, mirroring @vectorize-io/hindsight-coding-agents
 * (claude-hook.js / claude-stop-hook.js): same config file, same bank name, same endpoints.
 * Every call is limited to 5 s and resolves `{ ok: false, reason }` instead of throwing.
 */

export const HINDSIGHT_TIMEOUT_MS = 5000
export const DEFAULT_BANK_TEMPLATE = 'coding-agent::{gitProject}'
/** The one global bank for facts about the user. The hooks have no such bank; this is ours. */
export const DEFAULT_USER_BANK = 'coding-agent::user'
const HARNESS = 'claude-code'

export type Fail = { ok: false; reason: string }
export type Result<T> = ({ ok: true } & T) | Fail

export type HindsightConfig = {
  apiUrl: string
  /** Not enumerable: it never shows in JSON.stringify or a log of the config. */
  readonly token?: string
  bankId?: string
  dynamicBankId?: boolean
  bankIdTemplate?: string
  resolveWorktrees?: boolean
  mapPathToBank?: Record<string, string>
  userBankId?: string
}

export type RecallOptions = {
  maxTokens?: number
  /** Default ['observation'], as the hooks. */
  types?: Array<'observation' | 'world' | 'experience'>
  budget?: 'low' | 'mid' | 'high'
  tags?: string[]
  timeoutMs?: number
}

export type RecallItem = {
  id: string
  text: string
  type: string
  tags: string[]
  documentId: string | null
  mentionedAt: string | null
}

export type RetainItem = {
  content: string
  context?: string
  documentId?: string
  tags?: string[]
  metadata?: Record<string, string>
  /** ISO 8601 */
  timestamp?: string
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function scrub(message: string, token: string | undefined): string {
  const cut = message.length > 160 ? `${message.slice(0, 160)}...` : message
  return token ? cut.split(token).join('***') : cut
}

export async function loadHindsight(io: Io): Promise<Result<{ config: HindsightConfig }>> {
  const home = await homeDir(io)
  if (!home) return { ok: false, reason: 'not configured' }
  const file = joinPath(home, '.hindsight/coding-agent.json')
  let raw: Record<string, unknown>
  try {
    if (!(await io.fs.exists(file))) return { ok: false, reason: 'not configured' }
    raw = JSON.parse(await io.fs.read(file)) as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'invalid config' }
  }
  return parseHindsightConfig(raw)
}

/** Pure part of `loadHindsight`: only `serverMode: self-hosted` with an `apiUrl` is accepted. */
export function parseHindsightConfig(raw: Record<string, unknown> | null | undefined): Result<{ config: HindsightConfig }> {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'invalid config' }
  if (raw.disabled === true) return { ok: false, reason: 'disabled' }
  if (raw.serverMode !== 'self-hosted') return { ok: false, reason: 'not self-hosted' }
  if (typeof raw.apiUrl !== 'string' || !/^https?:\/\//.test(raw.apiUrl)) return { ok: false, reason: 'not configured' }

  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)
  const config: HindsightConfig = {
    apiUrl: raw.apiUrl.replace(/\/+$/, ''),
    bankId: str(raw.bankId),
    dynamicBankId: typeof raw.dynamicBankId === 'boolean' ? raw.dynamicBankId : undefined,
    bankIdTemplate: str(raw.bankIdTemplate),
    resolveWorktrees: typeof raw.resolveWorktrees === 'boolean' ? raw.resolveWorktrees : undefined,
    mapPathToBank:
      raw.mapPathToBank && typeof raw.mapPathToBank === 'object' ? (raw.mapPathToBank as Record<string, string>) : undefined,
    userBankId: str(raw.userBankId),
  }
  Object.defineProperty(config, 'token', { value: str(raw.apiToken), enumerable: false })
  return { ok: true, config }
}

/** The bank for a project folder name: `coding-agent::<name>`. Pure; see `resolveProjectBank` for the real derivation. */
export function projectBank(cwd: string, projectName?: string): string {
  const name = projectName ?? (basename(cwd) || 'unknown')
  return DEFAULT_BANK_TEMPLATE.replace('{gitProject}', name)
}

export function userBank(config?: Pick<HindsightConfig, 'userBankId'> | null): string {
  return config?.userBankId ?? DEFAULT_USER_BANK
}

/**
 * The project name the hooks use for {gitProject}: the folder that holds the repository's common
 * .git (so a worktree and a subfolder both give the main checkout's name), else the folder's name.
 */
export async function gitProjectName(io: Io, cwd: string, resolveWorktrees = true): Promise<string> {
  const fallback = basename(cwd) || 'unknown'
  if (!resolveWorktrees) return fallback
  try {
    let dir = normPath(cwd)
    while (!(await io.fs.exists(dir))) {
      const up = dirname(dir)
      if (up === dir || up === '.') return fallback
      dir = up
    }
    for (let guard = 0; guard < 64; guard++) {
      const dotGit = joinPath(dir, '.git')
      const st = await io.fs.stat(dotGit).catch(() => undefined)
      let common: string | undefined
      if (st?.kind === 'dir') {
        common = await commonDirOf(io, dotGit)
      } else if (st?.kind === 'file') {
        const m = /^\s*gitdir:\s*(.+?)\s*$/m.exec(await io.fs.read(dotGit))
        if (m) common = await commonDirOf(io, isAbsolutePath(m[1]!) ? normPath(m[1]!) : resolvePath(dir, m[1]!))
      }
      if (common) return basename(basename(common) === '.git' ? dirname(common) : common) || fallback
      const up = dirname(dir)
      if (up === dir) return fallback
      dir = up
    }
  } catch {
    // fall through to the folder name
  }
  return fallback
}

async function commonDirOf(io: Io, gitDir: string): Promise<string> {
  const pointer = joinPath(gitDir, 'commondir')
  if (!(await io.fs.exists(pointer))) return gitDir
  const rel = (await io.fs.read(pointer)).trim()
  return rel ? resolvePath(gitDir, rel) : gitDir
}

function mapPath(map: Record<string, string>, dir: string, home: string | null): string | undefined {
  const here = folderKey(dir)
  let best: { len: number; value: string } | undefined
  for (const [configured, value] of Object.entries(map)) {
    const expanded = configured === '~' || configured.startsWith('~/') ? `${home ?? ''}${configured.slice(1)}` : configured
    const p = folderKey(expanded)
    if ((here === p || here.startsWith(`${p}/`)) && (!best || p.length > best.len)) best = { len: p.length, value }
  }
  return best?.value
}

/** The bank the hooks would use for this folder (mapPathToBank, fixed bankId or the template). */
export async function resolveProjectBank(io: Io, config: HindsightConfig, cwd: string): Promise<string> {
  if (config.mapPathToBank) {
    const mapped = mapPath(config.mapPathToBank, cwd, await homeDir(io))
    if (mapped) return mapped
  }
  const dynamic = config.dynamicBankId ?? !config.bankId
  if (!dynamic) return config.bankId || 'coding'
  const template = config.bankIdTemplate ?? DEFAULT_BANK_TEMPLATE
  const known: Record<string, () => Promise<string> | string> = {
    harness: () => HARNESS,
    project: () => basename(cwd) || 'unknown',
    gitProject: () => gitProjectName(io, cwd, config.resolveWorktrees ?? true),
    channel: async () => (await io.env.HINDSIGHT_CHANNEL_ID()) || 'default',
    user: async () => (await io.env.HINDSIGHT_USER_ID()) || 'anonymous',
  }
  let out = ''
  let last = 0
  for (const m of template.matchAll(/\{([a-zA-Z_]+)\}/g)) {
    out += template.slice(last, m.index)
    out += (await known[m[1]!]?.()) ?? 'unknown'
    last = m.index! + m[0].length
  }
  return out + template.slice(last)
}

const TIMED_OUT = Symbol('timed out')

/** Runs `work` against a 5 s (or `ms`) limit on the engine's clock, since `io.http.fetch` has no timeout of its own. */
export async function withTimeout<T>(io: Io, work: Promise<T>, ms = HINDSIGHT_TIMEOUT_MS): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  const stop = typeof AbortController === 'function' ? new AbortController() : undefined
  work.catch(() => undefined)
  const clock = io.clock.sleep(ms, stop ? { signal: stop.signal } : undefined).then(
    () => TIMED_OUT,
    () => new Promise<never>(() => undefined),
  )
  try {
    const won = await Promise.race([work.then(value => ({ value })), clock])
    return won === TIMED_OUT ? { timedOut: true } : { timedOut: false, value: (won as { value: T }).value }
  } finally {
    stop?.abort()
  }
}

type Reply = { status: number; json: unknown }

async function request(
  io: Io,
  config: HindsightConfig,
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<Result<{ reply: Reply }>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.token) headers.Authorization = `Bearer ${config.token}`
  try {
    const res = await withTimeout(
      io,
      io.http.fetch(`${config.apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
      timeoutMs,
    )
    if (res.timedOut) return { ok: false, reason: 'timeout' }
    const { status, ok, text } = res.value
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (!ok && status !== 404) return { ok: false, reason: `HTTP ${status}` }
    return { ok: true, reply: { status, json } }
  } catch (e) {
    return { ok: false, reason: `unreachable: ${scrub(errText(e), config.token)}` }
  }
}

const bankPath = (bank: string, suffix: string): string => `/v1/default/banks/${encodeURIComponent(bank)}${suffix}`

export async function health(io: Io, config: HindsightConfig): Promise<Result<{ status: string }>> {
  const r = await request(io, config, 'GET', '/health', undefined, HINDSIGHT_TIMEOUT_MS)
  if (!r.ok) return r
  const status = (r.reply.json as { status?: unknown } | null)?.status
  if (status !== 'healthy') return { ok: false, reason: `status ${typeof status === 'string' ? status : 'unknown'}` }
  return { ok: true, status }
}

/** POST /v1/default/banks/{bank}/memories/recall. A bank that does not exist yet answers `ok` with no results. */
export async function recall(
  io: Io,
  config: HindsightConfig,
  bank: string,
  query: string,
  opts: RecallOptions = {},
): Promise<Result<{ results: RecallItem[] }>> {
  const body: Record<string, unknown> = {
    query,
    types: opts.types ?? ['observation'],
    budget: opts.budget ?? 'low',
    max_tokens: opts.maxTokens ?? 1500,
    include: { entities: null },
  }
  if (opts.tags && opts.tags.length > 0) body.tags = opts.tags
  const r = await request(io, config, 'POST', bankPath(bank, '/memories/recall'), body, opts.timeoutMs ?? HINDSIGHT_TIMEOUT_MS)
  if (!r.ok) return r
  if (r.reply.status === 404) return { ok: true, results: [] }
  const rows = (r.reply.json as { results?: unknown } | null)?.results
  const results: RecallItem[] = []
  for (const row of Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []) {
    const text = typeof row.text === 'string' ? row.text.trim() : ''
    if (!text) continue
    results.push({
      id: String(row.id ?? ''),
      text,
      type: String(row.type ?? ''),
      tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : [],
      documentId: typeof row.document_id === 'string' ? row.document_id : null,
      mentionedAt: typeof row.mentioned_at === 'string' ? row.mentioned_at : null,
    })
  }
  return { ok: true, results }
}

/** POST /v1/default/banks/{bank}/memories with `async: true`, as the hooks do. */
export async function retain(
  io: Io,
  config: HindsightConfig,
  bank: string,
  items: RetainItem[],
  opts: { timeoutMs?: number } = {},
): Promise<Result<{ operationId: string | null }>> {
  const usable = items.filter(i => typeof i.content === 'string' && i.content.trim() !== '')
  if (usable.length === 0) return { ok: false, reason: 'nothing to retain' }
  const body = {
    async: true,
    items: usable.map(i => ({
      content: i.content,
      ...(i.context ? { context: i.context } : {}),
      ...(i.documentId ? { document_id: i.documentId } : {}),
      ...(i.tags && i.tags.length > 0 ? { tags: i.tags } : {}),
      ...(i.metadata ? { metadata: i.metadata } : {}),
      ...(i.timestamp ? { timestamp: i.timestamp } : {}),
    })),
  }
  const r = await request(io, config, 'POST', bankPath(bank, '/memories'), body, opts.timeoutMs ?? HINDSIGHT_TIMEOUT_MS)
  if (!r.ok) return r
  if (r.reply.status === 404) return { ok: false, reason: 'HTTP 404' }
  const op = (r.reply.json as { operation_id?: unknown } | null)?.operation_id
  return { ok: true, operationId: typeof op === 'string' ? op : null }
}

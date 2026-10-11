import type {
  AgentsPanelAgent,
  AgentsPanelCall,
  AgentsPanelFile,
  AgentsPanelGit,
  AgentsPanelHookMessage,
  AgentsPanelLearner,
  AgentsPanelMcp,
  AgentsPanelMemory,
  AgentsPanelPending,
  AgentsPanelStatus,
  AgentsPanelTurn,
} from '../types'
import { basename, dirname, folderKey, normPath, resolvePath } from './lib/paths'

export const UNKNOWN = '—'

// ---------- tools and files ----------

const READ_TOOLS = new Set(['Read', 'NotebookRead', 'Grep', 'Glob', 'LS'])
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])

export type ToolTarget = { kind: 'read' | 'edit' | 'command' | 'other'; path?: string; command?: string }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

/** What a tool call works on, from its name and arguments. */
export function targetOf(tool: string, input: Record<string, unknown>, cwd?: string): ToolTarget {
  const abs = (p: string | undefined) => (p === undefined ? undefined : cwd ? resolvePath(cwd, p) : normPath(p))
  if (READ_TOOLS.has(tool)) {
    const path = str(input.file_path) ?? str(input.notebook_path) ?? str(input.path)
    return { kind: 'read', path: abs(path) }
  }
  if (EDIT_TOOLS.has(tool)) return { kind: 'edit', path: abs(str(input.file_path) ?? str(input.notebook_path)) }
  if (SHELL_TOOLS.has(tool)) return { kind: 'command', command: str(input.command) }
  return { kind: 'other' }
}

/** Only these name a single file the files list keeps (Grep, Glob and LS name folders or patterns). */
export function isFileTool(tool: string): boolean {
  return tool === 'Read' || tool === 'NotebookRead' || EDIT_TOOLS.has(tool)
}

export function isEditTool(tool: string): boolean {
  return EDIT_TOOLS.has(tool)
}

/** Lines added and removed by an edit, from the tool's own record; undefined when it does not say. */
export function diffOf(tool: string, result: unknown): { added: number; removed: number } | undefined {
  if (!result || typeof result !== 'object') return undefined
  const r = result as Record<string, unknown>
  const hunks = r.structuredPatch
  if (Array.isArray(hunks) && hunks.length > 0) {
    let added = 0
    let removed = 0
    for (const hunk of hunks) {
      const lines = (hunk as { lines?: unknown })?.lines
      if (!Array.isArray(lines)) return undefined
      for (const line of lines) {
        if (typeof line !== 'string') continue
        if (line.startsWith('+')) added++
        else if (line.startsWith('-')) removed++
      }
    }
    return { added, removed }
  }
  if (tool === 'Write' && r.type === 'create' && typeof r.content === 'string') {
    const text = r.content as string
    return { added: text === '' ? 0 : text.replace(/\n$/, '').split('\n').length, removed: 0 }
  }
  return undefined
}

/** Adds or refreshes a file at the top of the list. Edited wins over read. */
export function touchFile(
  files: readonly AgentsPanelFile[],
  path: string,
  kind: 'read' | 'edit',
  at: number,
  diff?: { added: number; removed: number },
): AgentsPanelFile[] {
  const key = folderKey(path)
  const old = files.find(f => folderKey(f.path) === key)
  const rest = files.filter(f => folderKey(f.path) !== key)
  const next: AgentsPanelFile = {
    path,
    kind: old?.kind === 'edit' || kind === 'edit' ? 'edit' : 'read',
    at,
  }
  const added = (old?.added ?? 0) + (diff?.added ?? 0)
  const removed = (old?.removed ?? 0) + (diff?.removed ?? 0)
  if (diff || old?.added !== undefined) {
    next.added = added
    next.removed = removed
  }
  return [next, ...rest].slice(0, 500)
}

export const FILES_SHOWN = 5

export type FileRow = { path: string; name: string; kind: 'read' | 'edit'; isUncommitted: boolean }

export function fileRows(
  files: readonly AgentsPanelFile[],
  git: AgentsPanelGit | null,
): { rows: FileRow[]; more: number } {
  const sorted = [...files].sort((a, b) => b.at - a.at)
  const rows = sorted.slice(0, FILES_SHOWN).map(f => ({
    path: f.path,
    name: basename(f.path),
    kind: f.kind,
    isUncommitted: isUncommitted(f.path, git),
  }))
  return { rows, more: Math.max(0, sorted.length - FILES_SHOWN) }
}

// ---------- the Right Now headline ----------

export type Headline = { title: string; detail?: string; sub: string; added?: number; removed?: number; isWaiting: boolean }

const oneLine = (text: string, max = 80) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

export function headline(
  calls: readonly AgentsPanelCall[],
  pending: AgentsPanelPending | null,
  turn: AgentsPanelTurn,
  lastFile: string | null,
): Headline {
  const sub = lastFile ? `last: ${basename(lastFile)}` : 'no files touched yet'
  if (pending) return { title: 'Waiting for you', detail: pending.text, sub, isWaiting: true }
  const call = [...calls].sort((a, b) => b.at - a.at)[0]
  if (call) {
    const target = targetOf(call.tool, { file_path: call.path, command: call.command })
    const where = call.path ? `${basename(call.path)} in ${basename(dirname(call.path))}` : undefined
    if (READ_TOOLS.has(call.tool)) return { title: where ? `Claude is reading ${where}` : 'Claude is reading', sub, isWaiting: false }
    if (EDIT_TOOLS.has(call.tool)) return { title: where ? `Claude is editing ${where}` : 'Claude is editing', sub, isWaiting: false }
    if (target.kind === 'command') {
      return { title: 'Claude is running a command', detail: call.command ? oneLine(call.command) : undefined, sub, isWaiting: false }
    }
    return { title: 'Claude is working', sub, isWaiting: false }
  }
  if (turn.isRunning) return { title: 'Claude is thinking', sub, isWaiting: false }
  if (turn.edited.length > 0) {
    const n = turn.edited.length
    const last = turn.edited[turn.edited.length - 1]!
    return {
      title: `Claude edited ${n} ${n === 1 ? 'file' : 'files'}`,
      detail: basename(last),
      added: turn.added,
      removed: turn.removed,
      sub,
      isWaiting: false,
    }
  }
  return { title: 'Claude is idle', sub, isWaiting: false }
}

export function questionText(input: Record<string, unknown>): string {
  const questions = input.questions
  if (Array.isArray(questions)) {
    const first = questions[0] as { question?: unknown } | undefined
    if (first && typeof first.question === 'string') {
      return oneLine(first.question, 120) + (questions.length > 1 ? ` (+${questions.length - 1} more)` : '')
    }
  }
  return 'Claude has a question'
}

export function permissionText(tool: string, input: unknown): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (tool === 'ExitPlanMode') return 'Approve the plan?'
  const t = targetOf(tool, i)
  if (t.kind === 'command' && t.command) return `Allow ${tool}: ${oneLine(t.command, 70)}?`
  if (t.path) return `Allow ${tool} on ${basename(t.path)}?`
  return `Allow ${tool.startsWith('mcp__') ? tool.split('__').slice(1).join(' ') : tool}?`
}

// ---------- git ----------

/** Parses `git status --porcelain=v1 --branch`: the branch and the changed files, as absolute paths under `root`. */
export function parseGitStatus(stdout: string, root: string): AgentsPanelGit {
  let branch = UNKNOWN
  const changed: string[] = []
  for (const raw of stdout.split(/\r?\n/)) {
    if (raw === '') continue
    if (raw.startsWith('## ')) {
      const head = raw.slice(3)
      if (head.startsWith('No commits yet on ')) branch = head.slice('No commits yet on '.length)
      else if (head.startsWith('HEAD (no branch)')) branch = 'detached HEAD'
      else branch = head.split('...')[0]!.split(' ')[0]!
      continue
    }
    let path = raw.slice(3)
    const arrow = path.indexOf(' -> ')
    if (arrow >= 0) path = path.slice(arrow + 4)
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1).replace(/\\(.)/g, '$1')
    changed.push(resolvePath(root, path))
  }
  return { root: normPath(root), branch, changed }
}

export function isUncommitted(path: string, git: AgentsPanelGit | null): boolean {
  if (!git) return false
  const key = folderKey(path)
  return git.changed.some(c => folderKey(c) === key)
}

// ---------- memory ----------

/** A Session Learner last-run record, when it is one and belongs to this folder. */
export function parseLearner(text: string, cwd: string): AgentsPanelLearner | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.state !== 'running' && d.state !== 'done' && d.state !== 'error') return null
  if (typeof d.cwd === 'string' && cwd !== '' && folderKey(d.cwd) !== folderKey(cwd)) return null
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)
  const out: AgentsPanelLearner = { state: d.state, found: n(d.found), saved: n(d.saved), review: n(d.review) }
  if (typeof d.error === 'string' && d.error !== '') out.error = d.error
  return out
}

/** True for CLAUDE.md, MEMORY.md and anything in an auto-memory folder (~/.claude/projects/<slug>/memory/). */
export function isMemoryPath(path: string): boolean {
  const p = normPath(path).toLowerCase()
  const name = basename(p)
  if (name === 'claude.md' || name === 'memory.md') return true
  return /\/\.claude\/projects\/[^/]+\/memory\//.test(p)
}

export function addMemoryWrite(writes: readonly string[], path: string): string[] {
  const name = basename(path)
  return [name, ...writes.filter(w => w !== name)].slice(0, 20)
}

export type MemoryLine = { text: string; isRunning: boolean; isError: boolean }

export function memoryLine(memory: AgentsPanelMemory): MemoryLine {
  const l = memory.learner
  if (memory.isLearnerInstalled && l) {
    if (l.state === 'running') return { text: 'Learning from this session…', isRunning: true, isError: false }
    if (l.state === 'error') return { text: `Memory: ${l.error ?? 'the last run failed'}`, isRunning: false, isError: true }
    if (l.found === 0) return { text: 'Memory: nothing learned yet', isRunning: false, isError: false }
    return {
      text: `Learned ${l.found} ${l.found === 1 ? 'lesson' : 'lessons'}: ${l.saved} saved, ${l.review} to review`,
      isRunning: false,
      isError: false,
    }
  }
  if (!memory.isLearnerInstalled && memory.writes.length > 0) {
    const names = memory.writes.slice(0, 3).join(', ')
    const more = memory.writes.length > 3 ? ` +${memory.writes.length - 3} more` : ''
    return { text: `Memory: saved to ${names}${more}`, isRunning: false, isError: false }
  }
  return { text: 'Memory: nothing learned yet', isRunning: false, isError: false }
}

export const SPINNER = ['|', '/', '-', '\\']

// ---------- models, prices, formatting ----------

/** "Haiku 5.5" from "claude-haiku-5-5"; aliases keep their family name; undefined when unknown. */
export function shortModel(model: string | undefined): string | undefined {
  if (!model) return undefined
  const m = /(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?!\d)/i.exec(model)
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1).toLowerCase()
  if (m) return `${cap(m[1]!)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
  const alias = /^(opus|sonnet|haiku|fable)(\[1m\])?$/i.exec(model.trim())
  if (alias) return cap(alias[1]!)
  return model === 'inherit' ? undefined : model
}

/** "opus-4-8" from "claude-opus-4-8", "claude-opus-4-8[1m]" or a dated id; undefined for anything else. */
export function modelKey(model: string | undefined): string | undefined {
  if (!model) return undefined
  const m = model.toLowerCase().replace(/\[1m\]$/, '').replace(/-\d{8}$/, '')
  const hit = /(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?$/.exec(m)
  return hit ? `${hit[1]}-${hit[2]}${hit[3] ? `-${hit[3]}` : ''}` : undefined
}

type Price = { input: number; output: number; cacheRead: number }

// US dollars per million tokens, the Claude API's list prices (cache writes at 1.25 times input).
const FABLE: Price = { input: 10, output: 50, cacheRead: 0.25 }
const OPUS: Price = { input: 5, output: 25, cacheRead: 0.5 }
const OPUS_OLD: Price = { input: 15, output: 75, cacheRead: 1.5 }
const SONNET: Price = { input: 2, output: 10, cacheRead: 0.2 }
const SONNET_OLD: Price = { input: 3, output: 15, cacheRead: 0.3 }
const PRICES: Record<string, Price> = {
  'fable-5': FABLE,
  'fable-5-1': FABLE,
  'mythos-5': FABLE,
  'mythos-5-1': FABLE,
  'opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'opus-5': OPUS,
  'opus-4-8': OPUS,
  'opus-4-7': OPUS,
  'opus-4-6': OPUS,
  'opus-4-5': OPUS,
  'opus-4-1': OPUS_OLD,
  'opus-4': OPUS_OLD,
  'sonnet-5-5': SONNET,
  'sonnet-5': SONNET,
  'sonnet-4-6': SONNET_OLD,
  'sonnet-4-5': SONNET_OLD,
  'sonnet-4': SONNET_OLD,
  'haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
}

const WINDOW_200K = new Set(['haiku-4-5', 'sonnet-4-5', 'sonnet-4', 'opus-4-5', 'opus-4-1', 'opus-4'])

export function priceOf(model: string | undefined): Price | undefined {
  const key = modelKey(model)
  return key ? PRICES[key] : undefined
}

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export function costOf(usage: Usage, model: string | undefined): number | undefined {
  const p = priceOf(model)
  if (!p) return undefined
  return (
    (usage.input_tokens * p.input +
      usage.cache_creation_input_tokens * p.input * 1.25 +
      usage.cache_read_input_tokens * p.cacheRead +
      usage.output_tokens * p.output) /
    1_000_000
  )
}

export function contextOf(usage: Usage): number {
  return usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens + usage.output_tokens
}

/** The context window an agent's model has: the session's own when it runs the main model, else the model's published one. */
export function windowOf(model: string | undefined, mainModel: string | null, sessionWindow: number | null): number | undefined {
  if (!model) return undefined
  if (mainModel && sessionWindow && model === mainModel) return sessionWindow
  if (/\[1m\]$/i.test(model)) return 1_000_000
  const key = modelKey(model)
  if (!key || !PRICES[key]) return undefined
  return WINDOW_200K.has(key) ? 200_000 : 1_000_000
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 100_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

export function fmtCost(usd: number): string {
  if (usd >= 0.01) return `≈$${usd.toFixed(2)}`
  if (usd >= 0.001) return `≈$${usd.toFixed(3)}`
  return '≈<$0.001'
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// ---------- sub-agents ----------

export const isFinished = (a: AgentsPanelAgent) => a.status === 'done' || a.status === 'failed' || a.status === 'stopped'

/** The status a row shows: waiting while a permission dialog of the agent is up. */
export function shownStatus(a: AgentsPanelAgent): AgentsPanelStatus {
  return a.status === 'running' && a.isAsking ? 'waiting' : a.status
}

export function statusFromList(status: string): AgentsPanelStatus | undefined {
  switch (status) {
    case 'pending':
    case 'running':
      return 'running'
    case 'waiting':
    case 'idle':
      return 'waiting'
    case 'completed':
      return 'done'
    case 'failed':
      return 'failed'
    case 'killed':
      return 'stopped'
    default:
      return undefined
  }
}

export function statusFromReason(reason: string): AgentsPanelStatus {
  return reason === 'answer' ? 'done' : reason === 'aborted' ? 'stopped' : 'failed'
}

export function ctxPercent(a: AgentsPanelAgent): number | undefined {
  if (a.ctxTokens === undefined || !a.window) return undefined
  return Math.min(100, Math.round((a.ctxTokens / a.window) * 100))
}

export function elapsedOf(a: AgentsPanelAgent, now: number): number {
  return (a.endedAt ?? (isFinished(a) ? a.startedAt : now)) - a.startedAt
}

/** "ctx 18% · 36.8k ≈$0.001 0:02", leaving out what is not known. */
export function agentMetrics(a: AgentsPanelAgent, now: number): string {
  const parts: string[] = []
  const pct = ctxPercent(a)
  const head: string[] = []
  if (pct !== undefined) head.push(`ctx ${pct}%`)
  if (a.ctxTokens !== undefined) head.push(fmtTokens(a.ctxTokens))
  if (head.length) parts.push(head.join(' · '))
  if (a.costUsd !== undefined && a.isCostKnown) parts.push(fmtCost(a.costUsd))
  parts.push(fmtDuration(elapsedOf(a, now)))
  return parts.join(' ')
}

/** The 3px bar: todo progress when the agent made todos, else context fill; null when neither is known. */
export function agentBar(a: AgentsPanelAgent): { ratio: number; kind: 'todos' | 'context'; label: string } | null {
  if (a.todosTotal && a.todosTotal > 0) {
    const done = a.todosDone ?? 0
    return { ratio: done / a.todosTotal, kind: 'todos', label: `${done} of ${a.todosTotal} todos done` }
  }
  const pct = ctxPercent(a)
  if (pct === undefined) return null
  return { ratio: pct / 100, kind: 'context', label: `Context ${pct}% full` }
}

export function todoCounts(input: Record<string, unknown>): { done: number; total: number } | undefined {
  const todos = input.todos
  if (!Array.isArray(todos)) return undefined
  const done = todos.filter(t => (t as { status?: unknown })?.status === 'completed').length
  return { done, total: todos.length }
}

export function groupAgents(agents: readonly AgentsPanelAgent[], cleared: readonly string[]) {
  const visible = agents.filter(a => !cleared.includes(a.id))
  const byNewest = (x: AgentsPanelAgent, y: AgentsPanelAgent) => y.startedAt - x.startedAt
  return {
    visible,
    running: visible.filter(a => !isFinished(a)).sort(byNewest),
    finished: visible.filter(isFinished).sort((x, y) => (y.endedAt ?? y.startedAt) - (x.endedAt ?? x.startedAt)),
  }
}

export type Summary = { cost: string; tokens: string; time: string }

/** Cost, Tokens and Time summed over the known values of the visible agents. */
export function summaryOf(agents: readonly AgentsPanelAgent[], now: number): Summary {
  const costs = agents.filter(a => a.isCostKnown && a.costUsd !== undefined).map(a => a.costUsd!)
  const tokens = agents.filter(a => a.ctxTokens !== undefined).map(a => a.ctxTokens!)
  let time = UNKNOWN
  if (agents.length > 0) {
    const first = Math.min(...agents.map(a => a.startedAt))
    const isAnyRunning = agents.some(a => !isFinished(a))
    const end = isAnyRunning ? now : Math.max(...agents.map(a => a.endedAt ?? a.startedAt))
    time = fmtDuration(end - first)
  }
  return {
    cost: costs.length ? fmtCost(costs.reduce((s, n) => s + n, 0)) : UNKNOWN,
    tokens: tokens.length ? fmtTokens(tokens.reduce((s, n) => s + n, 0)) : UNKNOWN,
    time,
  }
}

export const EFFORT_COLOR: Record<string, string> = {
  low: 'success',
  medium: 'suggestion',
  high: 'warning',
  xhigh: 'claude',
  max: 'error',
}

export function effortWord(effort: unknown): string | undefined {
  if (typeof effort === 'string' && effort !== '') return effort
  if (typeof effort === 'number') return `${effort} tokens`
  if (effort && typeof effort === 'object' && typeof (effort as { level?: unknown }).level === 'string') {
    return (effort as { level: string }).level
  }
  return undefined
}

// ---------- MCP servers ----------

/** Servers from the context report's MCP tools: one whose only tools are the sign-in ones needs sign-in. */
export function mcpFromTools(tools: readonly { name: string; serverName: string }[]): AgentsPanelMcp[] {
  const by = new Map<string, string[]>()
  for (const t of tools) {
    const list = by.get(t.serverName) ?? []
    list.push(t.name.split('__').slice(2).join('__'))
    by.set(t.serverName, list)
  }
  return [...by.entries()].map(([server, names]) => ({
    server,
    state: names.length > 0 && names.every(n => n === 'authenticate' || n === 'complete_authentication') ? 'needs-auth' : 'connected',
  }))
}

/** The server a `mcp__<server>__<tool>` call goes to, spelled as /mcp lists it where the context report knows it. */
export function serverOfTool(tool: string, known: readonly AgentsPanelMcp[]): string | undefined {
  if (!tool.startsWith('mcp__')) return undefined
  const wire = tool.split('__')[1] ?? ''
  const spell = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_')
  return known.find(k => spell(k.server) === wire)?.server ?? wire
}

const FAILURE = /not connected|failed to connect|connection (closed|refused|error)|server .*(disconnected|unavailable)|ECONNREFUSED/i

/** True when an MCP tool's error says its server is down, not that the tool itself refused. */
export function isServerFailure(text: string | undefined): boolean {
  return text !== undefined && FAILURE.test(text)
}

export function mergeMcp(connected: readonly AgentsPanelMcp[], failed: readonly AgentsPanelMcp[]): AgentsPanelMcp[] {
  const out = new Map<string, AgentsPanelMcp>()
  for (const s of connected) out.set(s.server, s)
  for (const s of failed) out.set(s.server, s)
  const rank = { failed: 0, 'needs-auth': 1, connected: 2, other: 3 }
  return [...out.values()].sort((a, b) => rank[a.state] - rank[b.state] || a.server.localeCompare(b.server))
}

export const MCP_WORD = { connected: 'connected', 'needs-auth': 'needs sign-in', failed: 'failed', other: 'unknown' } as const
export const MCP_COLOR = { connected: 'success', 'needs-auth': 'warning', failed: 'error', other: 'inactive' } as const

export function mcpSummary(servers: readonly AgentsPanelMcp[]): string {
  const count = (s: AgentsPanelMcp['state']) => servers.filter(x => x.state === s).length
  const parts = (['connected', 'needs-auth', 'failed', 'other'] as const)
    .map(s => [count(s), MCP_WORD[s]] as const)
    .filter(([n]) => n > 0)
    .map(([n, w]) => `${n} ${w}`)
  return ['MCP', ...parts].join(' · ')
}

export type McpTile = { key: string; prefix?: string; name: string; state: AgentsPanelMcp['state']; word: string; reason?: string }

export function mcpTiles(servers: readonly AgentsPanelMcp[]): McpTile[] {
  return servers.map(s => {
    const connector = /^claude\.ai\s+(.+)$/i.exec(s.server) ?? /^claude_ai_(.+)$/i.exec(s.server)
    return {
      key: s.server,
      prefix: connector ? 'claude.ai' : undefined,
      name: connector ? connector[1]!.replace(/_/g, ' ') : s.server,
      state: s.state,
      word: MCP_WORD[s.state],
      reason: s.reason,
    }
  })
}

// ---------- skills ----------

export function addSkill(skills: readonly string[], name: string): string[] {
  const clean = name.trim().replace(/^\//, '')
  if (clean === '') return [...skills]
  return [clean, ...skills.filter(s => s !== clean)].slice(0, 100)
}

export function skillTiles(skills: readonly string[]): { key: string; prefix?: string; name: string }[] {
  return skills.map(s => {
    const cut = s.indexOf(':')
    return cut > 0 ? { key: s, prefix: s.slice(0, cut), name: s.slice(cut + 1) } : { key: s, name: s }
  })
}

// ---------- SessionStart hook messages ----------

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\u001b\][^\u0007]*\u0007/g, '')
}

/** Where a hook came from, from its command line: the plugin hook or the script it runs. */
export function hookOrigin(command: string | undefined, hookName: string | undefined): string {
  if (!command) return hookName ?? 'SessionStart hook'
  const plugin = /\$\{CLAUDE_PLUGIN_ROOT\}[\\/]+(.+)$/.exec(command)
  if (plugin) return `plugin hook: ${oneLine(plugin[1]!.replace(/"/g, ''), 60)}`
  const quoted = /"([^"]+\.(?:js|mjs|cjs|ts|py|sh|ps1|cmd|bat|exe))"/i.exec(command)
  const bare = /(\S+\.(?:js|mjs|cjs|ts|py|sh|ps1|cmd|bat|exe))(?:\s|$)/i.exec(command)
  const script = quoted?.[1] ?? bare?.[1]
  if (script) return basename(script)
  return oneLine(command, 60)
}

/** The SessionStart hook messages a transcript (JSONL) records, each with its origin. */
export function hookMessagesFrom(jsonl: string): AgentsPanelHookMessage[] {
  const out: AgentsPanelHookMessage[] = []
  const shown = new Set<string>()
  const loose: { text: string }[] = []
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"SessionStart')) continue
    let row: { attachment?: Record<string, unknown> }
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const a = row.attachment
    if (!a || a.hookEvent !== 'SessionStart') continue
    const command = typeof a.command === 'string' ? a.command : undefined
    const hookName = typeof a.hookName === 'string' ? a.hookName : undefined
    if (a.type === 'hook_system_message' && typeof a.content === 'string') {
      loose.push({ text: stripAnsi(a.content).trim() })
      continue
    }
    if (a.type === 'hook_success') {
      let parsed: Record<string, unknown> | undefined
      try {
        parsed = typeof a.stdout === 'string' && a.stdout.trim().startsWith('{') ? JSON.parse(a.stdout) : undefined
      } catch {}
      const message = typeof parsed?.systemMessage === 'string' ? stripAnsi(parsed.systemMessage).trim() : ''
      const context = (parsed?.hookSpecificOutput as { additionalContext?: unknown } | undefined)?.additionalContext
      const plain = parsed === undefined && typeof a.stdout === 'string' ? stripAnsi(a.stdout).trim() : ''
      const text =
        message ||
        (typeof context === 'string' && context !== ''
          ? `Added context for Claude (${fmtTokens(context.length)} characters)`
          : plain
            ? `Added context for Claude (${fmtTokens(plain.length)} characters)`
            : '')
      if (text === '') continue
      if (message) shown.add(message)
      out.push({ origin: hookOrigin(command, hookName), text: oneLine(text, 200) })
      continue
    }
    if (typeof a.type === 'string' && /error|blocking/.test(a.type)) {
      const raw = [a.stderr, a.content, a.stdout].find(v => typeof v === 'string' && v.trim() !== '') as string | undefined
      out.push({ origin: hookOrigin(command, hookName), text: `Error: ${oneLine(stripAnsi(raw ?? 'the hook failed'), 180)}` })
    }
  }
  for (const m of loose) if (m.text && !shown.has(m.text)) out.push({ origin: 'SessionStart hook', text: oneLine(m.text, 200) })
  return out
}

/** The transcript a session writes: ~/.claude/projects/<cwd with every other character as '-'>/<id>.jsonl. */
export function transcriptPathOf(home: string, cwd: string, sessionId: string): string {
  const slug = cwd.replace(/[^A-Za-z0-9]/g, '-')
  return `${normPath(home)}/.claude/projects/${slug}/${sessionId}.jsonl`
}

/** A one-line band summary: headline · branch · memory line. */
export function bandLine(h: Headline, git: AgentsPanelGit | null, memory: MemoryLine): string {
  return [h.detail && h.isWaiting ? `${h.title}: ${h.detail}` : h.title, git?.branch, memory.text]
    .filter((p): p is string => typeof p === 'string' && p !== '')
    .join(' · ')
}

export function barText(ratio: number, width: number): string {
  const n = Math.max(0, Math.min(width, Math.round(ratio * width)))
  return '━'.repeat(n) + '─'.repeat(width - n)
}

export function emptyTurn(): AgentsPanelTurn {
  return { isRunning: false, edited: [] }
}

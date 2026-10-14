import type { FdAgent, FdLimit, FdMain, FdStatus, FdUsage } from '../types'

export const EMPTY_MAIN: FdMain = { model: '', effort: '', steps: 0, isRunning: false, turnStartedAt: 0, turnEndedAt: 0 }
export const EMPTY_USAGE: FdUsage = { ctxPct: null, ctxTokens: null, window: 0, costUsd: null, limits: [] }

// ---- colour ----------------------------------------------------------------

/** Bottom Bar's palette, plus the meter colours Clean View's pixel bars use. */
export type Palette = {
  text: string
  dim: string
  sep: string
  border: string
  accent: string
  good: string
  warn: string
  bad: string
  info: string
  pillBg: string
  pillFg: string
  panel: string
  /** Text on a filled chip. */
  ink: string
  track: string
  /** What a lit pixel brightens toward: light on a dark theme, dark on a light one. */
  tint: string
  warmFrom: string
  warmTo: string
  goodFrom: string
  goodTo: string
}

// Claude's warm coral, cream and sage, softened for a dark terminal.
export const DARK: Palette = {
  text: '#E8E3D9',
  dim: '#8C877E',
  sep: '#55514A',
  border: '#4E4943',
  accent: '#D97757',
  good: '#9CC5A1',
  warn: '#E5C07B',
  bad: '#E08A8A',
  info: '#B9B4E8',
  pillBg: '#1F2C3D',
  pillFg: '#C9D3E0',
  panel: '#24201D',
  ink: '#1A1714',
  track: '#3A3531',
  tint: '#FFF6EC',
  warmFrom: '#E8A06A',
  warmTo: '#D9667F',
  goodFrom: '#5E9A6A',
  goodTo: '#A9D6AE',
}

export const LIGHT: Palette = {
  text: '#3D3929',
  dim: '#8A857C',
  sep: '#C9C3B8',
  border: '#D3CCC0',
  accent: '#C15F3C',
  good: '#4E7D57',
  warn: '#9A6B10',
  bad: '#B3474A',
  info: '#5A62B8',
  pillBg: '#E3E9F1',
  pillFg: '#2B3A4C',
  panel: '#FBF8F3',
  ink: '#FBF8F3',
  track: '#E4DED3',
  tint: '#3A1E26',
  warmFrom: '#C9722F',
  warmTo: '#B8435F',
  goodFrom: '#3E7A4A',
  goodTo: '#6FAE7A',
}

export const paletteFor = (theme: unknown): Palette =>
  typeof theme === 'string' && theme.startsWith('light') ? LIGHT : DARK

// ---- models and prices ---------------------------------------------------------

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable', 'mythos'] as const

/** `claude-opus-5-5[1m]` or `Opus 5.5` → `Opus 5.5`; `haiku` → `Haiku`; anything else as given. */
export function modelName(raw: string): string {
  const id = raw.trim().toLowerCase()
  for (const family of FAMILIES) {
    const at = id.indexOf(family)
    if (at < 0) continue
    const rest = id.slice(at + family.length).replace(/\[[^\]]*\]/g, '')
    const nums = (rest.match(/\d+/g) ?? []).filter(n => n.length < 3).slice(0, 2)
    const name = family[0]!.toUpperCase() + family.slice(1)
    return nums.length > 0 ? `${name} ${nums.join('.')}` : name
  }
  return raw.trim() === 'inherit' ? '' : raw.trim()
}

/** 1000000 → `1M`, 200000 → `200K`, 0 → ``. */
export function windowLabel(tokens: number): string {
  if (!(tokens > 0)) return ''
  if (tokens >= 1_000_000) return `${+(tokens / 1_000_000).toFixed(1)}M`
  return `${Math.round(tokens / 1000)}K`
}

/** `opus-4-8` from `claude-opus-4-8`, `claude-opus-4-8[1m]` or a dated id; undefined for anything else. */
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

export type Tokens = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export function costOf(usage: Tokens, model: string | undefined): number | undefined {
  const key = modelKey(model)
  const p = key ? PRICES[key] : undefined
  if (!p) return undefined
  return (
    (usage.input_tokens * p.input +
      usage.cache_creation_input_tokens * p.input * 1.25 +
      usage.cache_read_input_tokens * p.cacheRead +
      usage.output_tokens * p.output) /
    1_000_000
  )
}

/** Tokens in the context after a response: everything it was answered over, plus what it wrote. */
export const contextOf = (u: Tokens): number =>
  u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens + u.output_tokens

/** The context window an agent's model has: the session's own when it runs the main model, else the model's published one. */
export function windowOf(model: string, mainModel: string, sessionWindow: number): number | undefined {
  if (!model) return undefined
  if (sessionWindow > 0 && mainModel && modelKey(model) === modelKey(mainModel)) return sessionWindow
  if (/\[1m\]$/i.test(model)) return 1_000_000
  const key = modelKey(model)
  if (!key || !PRICES[key]) return undefined
  return WINDOW_200K.has(key) ? 200_000 : 1_000_000
}

// ---- formatting ----------------------------------------------------------------

export function fmtTokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 100_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/** An estimate, marked ≈. */
export function fmtCost(usd: number): string {
  if (usd >= 0.01) return `≈$${usd.toFixed(2)}`
  if (usd >= 0.001) return `≈$${usd.toFixed(3)}`
  return '≈<$0.001'
}

/** The session's own figure, as /cost has it. */
export const fmtUsd = (usd: number): string => `$${usd >= 100 ? usd.toFixed(0) : usd.toFixed(2)}`

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function clip(text: string, room: number): string {
  const chars = [...text]
  if (room <= 0) return ''
  return chars.length <= room ? text : `${chars.slice(0, Math.max(0, room - 1)).join('')}…`
}

export const width = (text: string): number => [...text].length

export function effortWord(effort: unknown): string {
  if (typeof effort === 'string') return effort
  if (typeof effort === 'number') return `${effort} tokens`
  return ''
}

export function limitOf(r: { kind: string; percentUsed: number }): FdLimit {
  return { kind: r.kind, pct: r.percentUsed }
}

/** `five_hour` → `5h`, `seven_day` → `7d`; another window by its own name. */
export const limitLabel = (kind: string): string =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind.replace(/_/g, ' ')

// ---- subagents -------------------------------------------------------------------

export const isFinished = (a: FdAgent): boolean => a.status === 'done' || a.status === 'failed' || a.status === 'stopped'
export const isWorking = (a: FdAgent): boolean => !isFinished(a)

/** `$.agent.list()`'s status in the sidebar's words. */
export function statusFromList(status: string): FdStatus | undefined {
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

export const statusFromReason = (reason: string): FdStatus =>
  reason === 'answer' ? 'done' : reason === 'aborted' ? 'stopped' : 'failed'

export function newAgent(id: string, at: number, fields: Partial<FdAgent> = {}): FdAgent {
  return {
    id,
    description: '',
    type: '',
    status: 'running',
    startedAt: at,
    endedAt: 0,
    model: '',
    ctxTokens: 0,
    steps: 0,
    costUsd: 0,
    isCostKnown: true,
    ...fields,
  }
}

/** One answered request of an agent: its context, its cost so far, and back to running if it had finished. */
export function applyStep(a: FdAgent, step: { model: string; usage: (Tokens & { model?: string }) | null }): FdAgent {
  const model = step.usage?.model || step.model || a.model
  const next: FdAgent = { ...a, model, steps: a.steps + 1 }
  if (isFinished(a)) {
    next.status = 'running'
    next.endedAt = 0
  }
  if (step.usage) {
    next.ctxTokens = contextOf(step.usage)
    const cost = costOf(step.usage, model)
    next.costUsd = a.costUsd + (cost ?? 0)
    next.isCostKnown = a.isCostKnown && cost !== undefined
  }
  return next
}

export function finish(a: FdAgent, status: FdStatus, at: number): FdAgent {
  return isFinished(a) && a.status === status ? a : { ...a, status, endedAt: at }
}

/** `$.agent.list()` laid over what the hooks saw: new agents join, finished ones are marked so. */
export function reconcile(
  agents: readonly FdAgent[],
  listed: readonly { id: string; description: string; type: string; status: string; teammateId?: string }[],
  now: number,
): FdAgent[] {
  const byId = new Map(agents.map(a => [a.id, a]))
  let changed = false
  const out = agents.map(a => {
    const l = listed.find(x => x.id === a.id)
    const status = l ? statusFromList(l.status) : undefined
    if (!status || status === a.status) return a
    if (isFinished(a) && !isFinished({ ...a, status })) return a
    changed = true
    return status === 'running' || status === 'waiting' ? { ...a, status } : finish(a, status, now)
  })
  for (const l of listed) {
    if (byId.has(l.id) || l.teammateId) continue
    const status = statusFromList(l.status)
    if (!status) continue
    changed = true
    out.push(newAgent(l.id, now, { description: l.description, type: l.type, status, endedAt: status === 'running' || status === 'waiting' ? 0 : now }))
  }
  return changed ? out.slice(-40) : (agents as FdAgent[])
}

export function ctxPercent(a: FdAgent, window: number | undefined): number | undefined {
  if (!a.ctxTokens || !window) return undefined
  return Math.min(100, Math.round((a.ctxTokens / window) * 100))
}

export const elapsedOf = (a: FdAgent, now: number): number => (a.endedAt > 0 ? a.endedAt : isFinished(a) ? a.startedAt : now) - a.startedAt

export function groupAgents(agents: readonly FdAgent[]) {
  const working = agents.filter(isWorking).sort((x, y) => y.startedAt - x.startedAt)
  const finished = agents.filter(isFinished).sort((x, y) => y.endedAt - x.endedAt)
  return { working, finished }
}

export type Summary = { cost: string; tokens: string; time: string }

/** Cost, Tokens and Time over the session's subagents, `—` where none is known. */
export function summaryOf(agents: readonly FdAgent[], now: number): Summary {
  const priced = agents.filter(a => a.isCostKnown && a.steps > 0)
  const counted = agents.filter(a => a.ctxTokens > 0)
  let time = '—'
  if (agents.length > 0) {
    const first = Math.min(...agents.map(a => a.startedAt))
    const end = agents.some(isWorking) ? now : Math.max(...agents.map(a => a.endedAt || a.startedAt))
    time = fmtDuration(end - first)
  }
  return {
    cost: priced.length ? fmtCost(priced.reduce((s, a) => s + a.costUsd, 0)) : '—',
    tokens: counted.length ? fmtTokens(counted.reduce((s, a) => s + a.ctxTokens, 0)) : '—',
    time,
  }
}

/** `ctx 18% · 35.9k  ≈$0.01  0:06`, leaving out what is not known. */
export function agentMetrics(a: FdAgent, window: number | undefined, now: number): string {
  const parts: string[] = []
  const head: string[] = []
  const pct = ctxPercent(a, window)
  if (pct !== undefined) head.push(`ctx ${pct}%`)
  if (a.ctxTokens > 0) head.push(fmtTokens(a.ctxTokens))
  if (head.length) parts.push(head.join(' · '))
  if (a.isCostKnown && a.steps > 0) parts.push(fmtCost(a.costUsd))
  parts.push(fmtDuration(elapsedOf(a, now)))
  return parts.join('  ')
}

export const STATUS_WORD: Record<FdStatus, string> = {
  running: 'working',
  waiting: 'waiting',
  done: 'done',
  failed: 'failed',
  stopped: 'stopped',
}

/** The toggle's argument: `open`/`on` and `close`/`off`, anything else flips it. */
export function wantOpen(arg: string, isOpen: boolean): boolean {
  const a = arg.trim().toLowerCase()
  if (a === 'open' || a === 'on' || a === 'show') return true
  if (a === 'close' || a === 'off' || a === 'hide') return false
  return !isOpen
}

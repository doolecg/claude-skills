import type { CtxFooter } from '../types'
import { isCheckCommand } from './checks'

export const DEFAULT_LIMIT = 3
export const THROTTLE = { contextMs: 2000, gitMs: 3000 }
export const HINDSIGHT = { everyMs: 5 * 60 * 1000, timeoutMs: 5000 }

export type Passes = CtxFooter['passes']
export type GitInfo = NonNullable<CtxFooter['git']>

export const SHELL_TOOLS = ['Bash', 'PowerShell']
export const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

export function emptyFooter(limit = DEFAULT_LIMIT, extra: string[] = []): CtxFooter {
  return {
    context: { percent: null, tokens: null, window: null },
    hindsight: 'checking',
    codegraph: 'none',
    git: null,
    passes: { count: 0, limit, editedSince: false, extra },
  }
}

// ---------------------------------------------------------------- options

export function parseLimit(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_LIMIT
}

export function parseExtra(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return value
    .split(/[,;]/)
    .map(w => w.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------- passes

// A check command starts a new pass when none has started or an edit came since the last one.
export function onCheck(p: Passes): Passes {
  return p.count === 0 || p.editedSince ? { ...p, count: p.count + 1, editedSince: false } : p
}

export const onEdit = (p: Passes): Passes => (p.editedSince ? p : { ...p, editedSince: true })

export const resetPasses = (p: Passes): Passes => ({ ...p, count: 0, editedSince: false })

// What a finished tool call does to the count; the same passes back when it changes nothing.
export function afterTool(p: Passes, tool: string, command: unknown): Passes {
  if (SHELL_TOOLS.includes(tool)) return typeof command === 'string' && isCheckCommand(command, p.extra) ? onCheck(p) : p
  return EDIT_TOOLS.includes(tool) ? onEdit(p) : p
}

// The submissions that are the person's own: a slash command, a notification, a schedule or a mod's prompt is not.
export function isPersonPrompt(origin: { kind?: string } | undefined, hasCommand: boolean, isMeta: boolean): boolean {
  if (hasCommand || isMeta) return false
  return origin?.kind === 'composer' || origin?.kind === 'bridge' || origin?.kind === 'sdk'
}

export function passesText(p: Passes): string {
  return `Pass ${p.count} of ${p.limit}. ${p.editedSince ? 'An edit is waiting for the next check.' : 'No edit is waiting.'}`
}

// ---------------------------------------------------------------- context

export function contextOf(u: { context?: { percent?: number | null; tokens?: number | null; window?: number | null } }): CtxFooter['context'] {
  const c = u?.context ?? {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return { percent: num(c.percent), tokens: num(c.tokens), window: num(c.window) }
}

// ---------------------------------------------------------------- Hindsight

export type HindsightConfig = { url: string; token: string }

// ~/.hindsight/coding-agent.json: the self-hosted server's URL and optional token; null otherwise.
export function parseHindsightConfig(text: string): HindsightConfig | null {
  let j: Record<string, unknown>
  try {
    j = JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
  if (!j || typeof j !== 'object') return null
  const url = typeof j.apiUrl === 'string' ? j.apiUrl.trim().replace(/\/+$/, '') : ''
  if (j.serverMode !== 'self-hosted' || !/^https?:\/\/[^\s/]+/i.test(url)) return null
  const raw = [j.apiToken, j.apiKey, j.token].find(v => typeof v === 'string' && v.trim())
  return { url, token: typeof raw === 'string' ? raw.trim() : '' }
}

// Any HTTP answer below 500 means the server is there.
export const hindsightFrom = (status: number | null): 'up' | 'down' => (status !== null && status < 500 ? 'up' : 'down')

// ---------------------------------------------------------------- git

// `git rev-list --left-right --count @{upstream}...HEAD` prints "<behind>\t<ahead>".
export function parseCounts(text: string | null): { ahead: number; behind: number } {
  const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(text ?? '')
  return m ? { behind: Number(m[1]), ahead: Number(m[2]) } : { ahead: 0, behind: 0 }
}

export function gitInfo(branch: string | null, porcelain: string | null, counts: string | null): GitInfo | null {
  if (!branch || !branch.trim()) return null
  const changed = (porcelain ?? '').split(/\r?\n/).filter(l => l.trim() !== '').length
  return { branch: branch.trim(), changed, ...parseCounts(counts) }
}

// ---------------------------------------------------------------- throttle

export const isDue = (last: number, now: number, gapMs: number): boolean => last === 0 || now - last >= gapMs || now < last

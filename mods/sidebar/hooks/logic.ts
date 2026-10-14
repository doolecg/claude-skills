import type { SbBlock, SbFooter, SbJob, SbMode, SbStep, SbTab } from '../types'

/**
 * A mod the sidebar knows. `pane` mods draw their own tab in a pane of their own, which they open and
 * close themselves as the strip changes (`command` is theirs, and shows they are loaded); the rest are drawn by the sidebar.
 */
export type CatalogEntry = {
  id: string
  icon: string
  name: string
  /** The one word its tab shows in the strip. */
  label: string
  about: string
  pane?: { command: string }
  /** Drawn as the footer at the bottom of every tab, not as a tab of its own; its settings page still opens. */
  footer?: boolean
}

export const CATALOG: readonly CatalogEntry[] = [
  { id: 'flightdeck', icon: '✈', name: 'Flightdeck', label: 'Flightdeck', about: 'The main session and every subagent working now.', pane: { command: 'flightdeck' } },
  { id: 'self-improve', icon: '✺', name: 'Self Improve', label: 'Improve', about: 'Learns from finished sessions and keeps soul.md.', pane: { command: 'learn' } },
  { id: 'clean-view', icon: '✶', name: 'Clean View', label: 'Steps', about: 'A plain checklist above the prompt while Claude works.' },
  { id: 'idea-shelf', icon: '◇', name: 'Idea Shelf', label: 'Ideas', about: 'Park ideas while Claude works and send them later.', pane: { command: 'ideas' } },
  { id: 'folder-tracker', icon: '⇄', name: 'Folder Tracker', label: 'Folders', about: 'Other sessions working in this folder.', pane: { command: 'folders' } },
  { id: 'prompt-enhancer', icon: '✎', name: 'Prompt Enhancer', label: 'Enhance', about: 'Rewrites the prompt box into a clearer prompt.' },
  { id: 'design-picker', icon: '◐', name: 'Design Picker', label: 'Design', about: 'Opens a gallery when Claude asks you to pick a look.' },
  { id: 'plain-english', icon: '¶', name: 'Plain English', label: 'Plain', about: 'Plainer replies, checked against your rules.' },
  { id: 'bottom-bar', icon: '▭', name: 'Bottom Bar', label: 'Bar', about: 'The rounded bar under the prompt and its toolbox.' },
  { id: 'rule-guard', icon: '⊘', name: 'Rule Guard', label: 'Rules', about: 'Stops tool calls that break your rules and tells Claude why.' },
  { id: 'context', icon: '◎', name: 'Context', label: 'Context', about: 'Context used, Hindsight, CodeGraph, the git repo and test passes, at the bottom of every tab.', footer: true },
]

export const SIDEBAR_TAB = 'sidebar'
export const SETTINGS_PREFIX = 'settings:'

export const entryOf = (id: string): CatalogEntry | undefined => CATALOG.find(c => c.id === id)

/** The strip's tabs: installed catalog mods, in the person's order, less the hidden ones. */
export function tabsFor(installed: readonly string[], order: readonly string[], hidden: readonly string[], badges: Record<string, number>): SbTab[] {
  const known = CATALOG.filter(c => installed.includes(c.id) && !c.footer)
  const rank = (id: string) => {
    const at = order.indexOf(id)
    return at < 0 ? order.length + CATALOG.findIndex(c => c.id === id) : at
  }
  return known
    .filter(c => !hidden.includes(c.id))
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map(c => ({ id: c.id, icon: c.icon, name: c.name, label: c.label, badge: Math.max(0, Math.floor(badges[c.id] ?? 0)) }))
}

/** All installed catalog mods in the person's order, hidden ones included: the sidebar's own settings list. */
export function orderedIds(installed: readonly string[], order: readonly string[]): string[] {
  return tabsFor(installed, order, [], {}).map(t => t.id)
}

/** `order` with `id` moved one place up (`-1`) or down (`1`) among `ids`. */
export function move(ids: readonly string[], id: string, by: -1 | 1): string[] {
  const list = [...ids]
  const at = list.indexOf(id)
  const to = at + by
  if (at < 0 || to < 0 || to >= list.length) return list
  list.splice(at, 1)
  list.splice(to, 0, id)
  return list
}

/** Which tab `/sidebar` with no tab opens: the last one if it still shows, else the first. */
export function pickTab(active: string, tabs: readonly SbTab[]): string {
  if (active === SIDEBAR_TAB || active.startsWith(SETTINGS_PREFIX)) return active
  if (tabs.some(t => t.id === active)) return active
  return tabs[0]?.id ?? SIDEBAR_TAB
}

/** A `/sidebar` argument: open, close, flip, a tab, a mod's settings, or a pane's own close. */
export type SidebarArg =
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'flip' }
  | { kind: 'tab'; id: string }
  | { kind: 'settings'; id: string }
  | { kind: 'closed'; id: string }

export function parseArg(args: string): SidebarArg {
  const [word = '', rest = ''] = args.trim().split(/\s+/, 2)
  const w = word.toLowerCase()
  if (w === 'open' || w === 'on') return { kind: 'open' }
  if (w === 'close' || w === 'off') return { kind: 'close' }
  if (w === 'tab' && rest) return { kind: 'tab', id: rest }
  if (w === 'settings' && rest) return { kind: 'settings', id: rest }
  if (w === 'closed' && rest) return { kind: 'closed', id: rest }
  if (w && entryOf(w)) return { kind: 'tab', id: w }
  return { kind: 'flip' }
}

/** The installed, enabled mods, from `claude plugin list --json`. */
export function installedFrom(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const out = new Set<string>()
  for (const p of list) {
    const id = typeof p?.id === 'string' ? p.id : ''
    if (p?.enabled === false || !id) continue
    out.add(id.split('@')[0]!)
  }
  return [...out]
}

/** A mod's published `modes` value, kept when it is well formed. */
export function modesOf(value: unknown): Record<string, SbMode> {
  const out: Record<string, SbMode> = {}
  if (!value || typeof value !== 'object') return out
  for (const [command, m] of Object.entries(value as Record<string, unknown>)) {
    const mode = m as { label?: unknown; isOn?: unknown }
    if (typeof mode?.label === 'string' && typeof mode.isOn === 'boolean') out[command] = { label: mode.label, isOn: mode.isOn }
  }
  return out
}

/** Clean View's `checklist`, cut down to what the tab draws; null with no job. */
export function jobOf(value: unknown): SbJob | null {
  const v = value as Partial<SbJob> & { tasks?: unknown }
  if (!v || typeof v !== 'object' || typeof v.phase !== 'string' || v.phase === 'idle') return null
  const tasks: SbStep[] = Array.isArray(v.tasks)
    ? (v.tasks as Partial<SbStep>[]).map((t, i) => ({
        id: String(t?.id ?? i),
        name: String(t?.name ?? ''),
        status: String(t?.status ?? 'waiting'),
        percent: typeof t?.percent === 'number' ? t.percent : 0,
        hasReported: t?.hasReported === true,
      }))
    : []
  return {
    title: typeof v.title === 'string' ? v.title : '',
    phase: v.phase,
    tasks,
    startedAt: typeof v.startedAt === 'number' ? v.startedAt : 0,
    finishedAt: typeof v.finishedAt === 'number' ? v.finishedAt : 0,
  }
}

/** A job's overall progress: the step it is on, how many, and the percent done. */
export function progressOf(job: SbJob): { step: number; total: number; percent: number } {
  const total = job.tasks.length
  if (total === 0) return { step: 0, total: 0, percent: job.phase === 'done' ? 100 : 0 }
  const done = job.tasks.filter(t => t.status === 'done').length
  const active = job.tasks.findIndex(t => t.status === 'active')
  const activePct = active >= 0 ? job.tasks[active]!.percent : 0
  const percent = job.phase === 'done' ? 100 : Math.round(((done + activePct / 100) / total) * 100)
  return { step: active >= 0 ? active + 1 : Math.min(total, done + 1), total, percent }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Context's `footer`, kept when it is well formed; null otherwise, so the tabs draw no footer. */
export function footerOf(value: unknown): SbFooter | null {
  const v = value as Record<string, any> | null
  if (!v || typeof v !== 'object' || !v.context || !v.passes) return null
  const git = v.git && typeof v.git.branch === 'string' ? v.git : null
  return {
    context: { percent: num(v.context.percent), tokens: num(v.context.tokens), window: num(v.context.window) },
    hindsight: ['up', 'down', 'off', 'checking'].includes(v.hindsight) ? v.hindsight : 'off',
    codegraph: v.codegraph === 'indexed' ? 'indexed' : 'none',
    git: git ? { branch: git.branch, changed: num(git.changed) ?? 0, ahead: num(git.ahead) ?? 0, behind: num(git.behind) ?? 0 } : null,
    passes: {
      count: num(v.passes.count) ?? 0,
      limit: num(v.passes.limit) ?? 3,
      editedSince: v.passes.editedSince === true,
      extra: Array.isArray(v.passes.extra) ? v.passes.extra.filter((x: unknown): x is string => typeof x === 'string') : [],
    },
  }
}

/** Rule Guard's `blocks`: the calls it stopped this session, newest first. */
export function blocksOf(value: unknown): SbBlock[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(b => b && typeof b === 'object' && typeof b.label === 'string')
    .map(b => ({ at: num(b.at) ?? 0, rule: String(b.rule ?? ''), label: b.label as string, what: String(b.what ?? '') }))
}

/** How long ago `at` was: `just now`, `4m ago`, `2h ago`. */
export function fmtAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

/** 75000 → `1m 15s`. */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

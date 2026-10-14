import type { SbJob, SbMode, SbStep, SbTab } from '../types'

/**
 * A mod the sidebar knows. `pane` mods draw their own tab in a pane of their own, which they open and
 * close themselves as the strip changes (`command` is theirs, and shows they are loaded); the rest are drawn by the sidebar.
 */
export type CatalogEntry = {
  id: string
  icon: string
  name: string
  about: string
  pane?: { command: string }
}

export const CATALOG: readonly CatalogEntry[] = [
  { id: 'flightdeck', icon: '✈', name: 'Flightdeck', about: 'The main session and every subagent working now.', pane: { command: 'flightdeck' } },
  { id: 'self-improve', icon: '✺', name: 'Self Improve', about: 'Learns from finished sessions and keeps soul.md.', pane: { command: 'learn' } },
  { id: 'clean-view', icon: '✶', name: 'Clean View', about: 'A plain checklist above the prompt while Claude works.' },
  { id: 'idea-shelf', icon: '◇', name: 'Idea Shelf', about: 'Park ideas while Claude works and send them later.', pane: { command: 'ideas' } },
  { id: 'folder-tracker', icon: '⇄', name: 'Folder Tracker', about: 'Other sessions working in this folder.', pane: { command: 'folders' } },
  { id: 'prompt-enhancer', icon: '✎', name: 'Prompt Enhancer', about: 'Rewrites the prompt box into a clearer prompt.' },
  { id: 'design-picker', icon: '◐', name: 'Design Picker', about: 'Opens a gallery when Claude asks you to pick a look.' },
  { id: 'plain-english', icon: '¶', name: 'Plain English', about: 'Plainer replies, checked against your rules.' },
  { id: 'bottom-bar', icon: '▭', name: 'Bottom Bar', about: 'The rounded bar under the prompt and its toolbox.' },
]

export const SIDEBAR_TAB = 'sidebar'
export const SETTINGS_PREFIX = 'settings:'

export const entryOf = (id: string): CatalogEntry | undefined => CATALOG.find(c => c.id === id)

/** The strip's tabs: installed catalog mods, in the person's order, less the hidden ones. */
export function tabsFor(installed: readonly string[], order: readonly string[], hidden: readonly string[], badges: Record<string, number>): SbTab[] {
  const known = CATALOG.filter(c => installed.includes(c.id))
  const rank = (id: string) => {
    const at = order.indexOf(id)
    return at < 0 ? order.length + CATALOG.findIndex(c => c.id === id) : at
  }
  return known
    .filter(c => !hidden.includes(c.id))
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map(c => ({ id: c.id, icon: c.icon, name: c.name, badge: Math.max(0, Math.floor(badges[c.id] ?? 0)) }))
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

/** 75000 → `1m 15s`. */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

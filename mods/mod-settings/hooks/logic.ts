import type { MsRow } from '../types'
import type { PluginEntry, PluginField } from './plugin-config'
import { valueOf } from './plugin-config'

/** One mod's card: its name and its settings, in the order `/config` lists them. */
export type ModGroup = { plugin: string; title: string; rows: MsRow[] }

/** `bottom-bar` → `Bottom Bar`; `clean-view` keeps its newer name, Task View. */
export function titleOf(plugin: string): string {
  if (plugin === 'clean-view') return 'Task View'
  return plugin
    .split(/[-_]/)
    .filter(Boolean)
    .map(w => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}

/** One plugin's rows: its manifest fields in order, each with its saved value or its default. */
export function pluginRows(entry: PluginEntry, fields: readonly PluginField[], options: Record<string, unknown>): MsRow[] {
  return fields.map(f => ({
    key: `${entry.name}.${f.key}`,
    id: entry.id,
    field: f.key,
    plugin: entry.name,
    label: f.label,
    description: f.description,
    kind: f.kind,
    value: valueOf(f, options),
    options: [...f.options],
    isLocked: false,
  }))
}

/** The rows grouped by mod, mods in name order. */
export function groupRows(rows: readonly MsRow[]): ModGroup[] {
  const by = new Map<string, MsRow[]>()
  for (const r of rows) by.set(r.plugin, [...(by.get(r.plugin) ?? []), r])
  return [...by.entries()].map(([plugin, list]) => ({ plugin, title: titleOf(plugin), rows: list })).sort((a, b) => a.title.localeCompare(b.title))
}

/** A typed value for a text or number row, or why it does not fit. */
export function parseValue(kind: MsRow['kind'], text: string): { value: string | number } | { error: string } {
  if (kind !== 'number') return { value: text }
  const n = Number(text.trim())
  return text.trim() !== '' && Number.isFinite(n) ? { value: n } : { error: 'Enter a number' }
}

/** What a row's value reads as on screen. */
export function shown(value: MsRow['value']): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  const s = String(value)
  return s === '' ? '(empty)' : s
}

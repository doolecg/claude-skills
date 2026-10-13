import type { BarMode, BarSetting, BarTool } from '../types'
import { isModCommand, type Palette } from './bar-logic'

/** `xhigh` → `XHigh`, `low` → `Low`. */
export const effortName = (level: string): string =>
  level === 'xhigh' ? 'XHigh' : level ? level[0]!.toUpperCase() + level.slice(1) : ''

/** `Doole's Tools` → `D O O L E ' S   T O O L S`, or plain capitals when that will not fit `room`. */
export function spaced(name: string, room: number): string {
  const upper = name.toUpperCase()
  const wide = [...upper].join(' ')
  return [...wide].length <= room ? wide : upper
}

/** The alias of the model in use (`Opus 5.5` → `opus`), or `` when none matches. */
export const currentAlias = (aliases: readonly string[], current: string): string =>
  aliases.find(a => current.toLowerCase().startsWith(a)) ?? ''

export const pad = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - [...text].length))

/** What the toolbox launches: the mods' own commands, less the ones with an on/off mode. */
export const launchList = (all: readonly BarTool[], modes: Record<string, BarMode>): BarTool[] =>
  all.filter(c => isModCommand(c) && !modes[c.name])

type Row = {
  key: string
  label: string
  description?: string
  kind: string
  value: unknown
  options?: readonly string[]
  provider: { plugin: string }
  isLocked: boolean
}

/** The plugins' own `/config` rows (`<plugin>.<field>`), the engine's left out. */
export function settingsList(rows: readonly Row[]): BarSetting[] {
  const out: BarSetting[] = []
  for (const r of rows) {
    if (!r.key.includes('.') || r.provider.plugin === 'engine') continue
    if (r.kind !== 'boolean' && r.kind !== 'choice' && r.kind !== 'text' && r.kind !== 'number') continue
    const value = typeof r.value === 'boolean' || typeof r.value === 'number' ? r.value : String(r.value ?? '')
    out.push({
      key: r.key,
      label: r.label,
      description: r.description ?? '',
      kind: r.kind,
      value,
      options: [...(r.options ?? [])],
      isLocked: r.isLocked,
    })
  }
  return out
}

/** The option after `value`, round to the first. */
export function nextOption(options: readonly string[], value: unknown): string | undefined {
  if (options.length === 0) return undefined
  const at = options.indexOf(String(value))
  return options[(at + 1) % options.length]
}

/** A launcher's mark and its colour, taken in turn. */
export const ICONS = ['✦', '◆', '★', '▦', '●', '▲'] as const
export const iconColor = (i: number, pal: Palette): string =>
  [pal.accent, pal.info, pal.good, pal.warn][i % 4]!

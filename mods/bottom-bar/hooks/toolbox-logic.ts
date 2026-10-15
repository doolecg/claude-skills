import type { BarMod, BarMode, BarTool } from '../types'
import { isModCommand, type Palette } from './bar-logic'

/** `xhigh` → `XHigh`, `low` → `Low`. */
export const effortName = (level: string): string =>
  level === 'xhigh' ? 'XHigh' : level ? level[0]!.toUpperCase() + level.slice(1) : ''

/** `Tools` → `T O O L S`, or plain capitals when that will not fit `room`. */
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

/** Quick Launch: the chosen commands first, in their order, then the rest of `launchList`. */
export function quickLaunch(all: readonly BarTool[], chosen: readonly string[], modes: Record<string, BarMode>): BarTool[] {
  const byName = new Map(all.map(c => [c.name, c]))
  const picked = chosen.map(name => byName.get(name) ?? { name, description: '', plugin: '', source: 'plugin' })
  return [...picked, ...launchList(all, modes).filter(c => !chosen.includes(c.name))]
}

/** A launcher's mark and its colour, taken in turn. */
export const ICONS = ['✦', '◆', '★', '▦', '●', '▲'] as const
export const iconColor = (i: number, pal: Palette): string =>
  [pal.accent, pal.info, pal.good, pal.warn][i % 4]!

/** One `claude plugin list --json` entry. */
export type Install = { id: string; scope: string; enabled: boolean; installPath: string; projectPath?: string }

const plainPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const samePath = (a: string, b: string) => plainPath(a) === plainPath(b)

/** One install per plugin: the user scope's, else this project's; other projects' left out. */
export function pickInstalls(list: readonly Install[], projectRoot: string): Install[] {
  const out = new Map<string, Install>()
  for (const p of list) {
    if (p.scope === 'project' || p.scope === 'local') {
      if (!p.projectPath || !samePath(p.projectPath, projectRoot)) continue
    }
    const had = out.get(p.id)
    if (!had || (had.scope !== 'user' && p.scope === 'user')) out.set(p.id, p)
  }
  return [...out.values()]
}

/** A row of the toolbox's Mods list: a mod's on/off mode while it is running, else the plugin itself. */
export type ModLine = { key: string; label: string; about: string; isOn: boolean; command?: string; mod?: BarMod }

export function modLines(mods: readonly BarMod[], modes: Record<string, BarMode>): ModLine[] {
  const out: ModLine[] = []
  const used = new Set<string>()
  for (const mod of mods) {
    const entry = Object.entries(modes).find(([, m]) => m.plugin === mod.name)
    if (entry && mod.isEnabled) {
      const [command, mode] = entry
      used.add(command)
      out.push({ key: `tb-mode:${command}`, label: mode.label, about: mod.description, isOn: mode.isOn, command })
    } else {
      out.push({ key: `tb-mod:${mod.id}`, label: mod.label, about: mod.description, isOn: mod.isEnabled, mod })
    }
  }
  for (const [command, mode] of Object.entries(modes)) {
    if (!used.has(command)) out.push({ key: `tb-mode:${command}`, label: mode.label, about: '', isOn: mode.isOn, command })
  }
  return out
}

import type { Idea } from '../types'

export const IDEA_MAX = 2000

export function folderOf(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).join('/').toLowerCase()
}

export function shelfPrefix(cwd: string): string {
  return `idea|${folderOf(cwd)}|`
}

export function ideaKey(cwd: string, id: string): string {
  return `${shelfPrefix(cwd)}${id}`
}

export function newId(now: number, random: number): string {
  return `${now.toString(36)}${Math.floor(random * 36 ** 4).toString(36).padStart(4, '0')}`
}

export function cleanIdea(text: string, max: number = IDEA_MAX): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed.slice(0, max)
}

/** The mod's settings, read from its userConfig. */
export type ShelfConfig = { isOn: boolean; max: number; isNewestFirst: boolean; removeOnSend: boolean; showAge: boolean; showBadge: boolean }

export function readConfig(options: Record<string, unknown> | undefined): ShelfConfig {
  const o = options ?? {}
  const max = typeof o.maxLength === 'number' && Number.isFinite(o.maxLength) ? Math.max(20, Math.min(10000, Math.round(o.maxLength))) : IDEA_MAX
  return {
    isOn: o.enabled !== false,
    max,
    isNewestFirst: o.order === 'Newest first',
    removeOnSend: o.removeOnSend !== false,
    showAge: o.showAge !== false,
    showBadge: o.showBadge !== false,
  }
}

export const OFF_TEXT = 'Idea Shelf is off. Turn it on in Mod Settings (/doole_settings) or /config.'

export function parseEdit(args: string): { n: number; text: string } | null {
  const match = /^edit\s+(\d+)\s*([\s\S]*)$/.exec(args.trim())
  return match ? { n: Number(match[1]), text: match[2] ?? '' } : null
}

export function isIdea(value: unknown): value is Idea {
  return typeof value === 'object' && value !== null
    && typeof (value as Idea).text === 'string' && typeof (value as Idea).at === 'number'
}

/** How long ago an idea was parked: `now`, `5m`, `2h`, `3d`. */
export function ageOf(now: number, at: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

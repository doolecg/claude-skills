import type { Idea } from '../types'

export const MAX_IDEA_CHARS = 2000

export type IdeaCommand =
  | { kind: 'add'; text: string }
  | { kind: 'edit'; n: number; text: string }
  | { kind: 'usage' }
  | { kind: 'error'; message: string }

export const USAGE =
  'Usage: /idea <text> parks an idea. /idea edit <n> <text> replaces idea n. /ideas opens the shelf.'

/** Lower-cased path with forward slashes and no trailing slash, so one folder has one key on any system. */
export function normalizeFolder(folder: string): string {
  let p = folder.trim().replace(/[\\]/g, '/').replace(/\/{2,}/g, '/')
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p.toLowerCase()
}

export function shelfKey(folder: string): string {
  return `shelf:${normalizeFolder(folder)}`
}

export function parseIdeaArgs(args: string): IdeaCommand {
  const raw = args.trim()
  if (raw === '') return { kind: 'usage' }

  const word = /^edit(?:\s+|$)/i.exec(raw)
  if (word) {
    const rest = raw.slice(word[0].length)
    const num = /^(\d+)(?:\s+([\s\S]*))?$/.exec(rest)
    if (num) {
      const n = Number(num[1])
      const text = (num[2] ?? '').trim()
      if (n < 1) return { kind: 'error', message: 'Idea numbers start at 1.' }
      if (text === '') return { kind: 'error', message: `Give the new text: /idea edit ${n} <text>` }
      return { kind: 'edit', n, text }
    }
    if (rest === '') return { kind: 'error', message: 'Say which idea to edit: /idea edit <n> <text>' }
    // "edit the readme" is an idea that starts with the word edit
  }
  return { kind: 'add', text: raw }
}

/** A plain-language reason the text cannot be stored, or null when it can. */
export function checkIdeaText(text: string): string | null {
  const t = text.trim()
  if (t === '') return 'An idea cannot be empty.'
  if (t.length > MAX_IDEA_CHARS) {
    return `That idea is ${t.length} characters. The limit is ${MAX_IDEA_CHARS}, so nothing was saved.`
  }
  return null
}

export function newId(now: number, salt: number): string {
  return `${now.toString(36)}-${Math.floor(salt * 1e9).toString(36)}`
}

export function parseShelf(value: unknown): Idea[] {
  if (!Array.isArray(value)) return []
  const out: Idea[] = []
  for (const item of value) {
    if (item && typeof item === 'object') {
      const { id, text, at } = item as Record<string, unknown>
      if (typeof id === 'string' && typeof text === 'string') {
        out.push({ id, text, at: typeof at === 'number' ? at : 0 })
      }
    }
  }
  return out
}

export function addIdea(shelf: readonly Idea[], text: string, id: string, now: number): Idea[] {
  return [...shelf, { id, text: text.trim(), at: now }]
}

/** Replaces the text of the idea at position n (1-based), keeping its place and id. */
export function editIdeaAt(shelf: readonly Idea[], n: number, text: string): Idea[] | null {
  if (!Number.isInteger(n) || n < 1 || n > shelf.length) return null
  return shelf.map((idea, i) => (i === n - 1 ? { ...idea, text: text.trim() } : idea))
}

export function editIdeaById(shelf: readonly Idea[], id: string, text: string): Idea[] | null {
  if (!shelf.some(idea => idea.id === id)) return null
  return shelf.map(idea => (idea.id === id ? { ...idea, text: text.trim() } : idea))
}

export function removeIdea(shelf: readonly Idea[], id: string): Idea[] {
  return shelf.filter(idea => idea.id !== id)
}

export function describeCount(n: number): string {
  return n === 1 ? '1 idea' : `${n} ideas`
}

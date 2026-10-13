import { TOTAL } from './challenges'
import type { ChallengeProgress } from '../types'

/** done: challenge index -> local day (YYYY-MM-DD) it was completed; today: the pick kept for that day */
export type Progress = ChallengeProgress

export const EMPTY: Progress = { done: {}, today: null }

const DAY = /^\d{4}-\d{2}-\d{2}$/

function validIdx(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < TOTAL
}

/** Turns anything read from the store into a safe Progress. */
export function sanitize(raw: unknown): Progress {
  const out: Progress = { done: {}, today: null }
  if (typeof raw !== 'object' || raw === null) return out
  const r = raw as { done?: unknown; today?: unknown }
  if (typeof r.done === 'object' && r.done !== null) {
    for (const [k, v] of Object.entries(r.done as Record<string, unknown>)) {
      const idx = Number(k)
      if (validIdx(idx) && typeof v === 'string' && DAY.test(v)) out.done[String(idx)] = v
    }
  }
  if (typeof r.today === 'object' && r.today !== null) {
    const t = r.today as { day?: unknown; idx?: unknown }
    if (typeof t.day === 'string' && DAY.test(t.day) && validIdx(t.idx)) {
      out.today = { day: t.day, idx: t.idx }
    }
  }
  return out
}

export function dayKey(ms: number): string {
  const d = new Date(ms)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number)
  return [y ?? 1970, m ?? 1, d ?? 1]
}

export function shiftDay(key: string, by: number): string {
  const [y, m, d] = parts(key)
  const t = new Date(Date.UTC(y, m - 1, d + by))
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(t.getUTCDate()).padStart(2, '0')
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${mm}-${dd}`
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const WEEKDAYS_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function weekday(key: string): string {
  const [y, m, d] = parts(key)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!
}

export function prettyDay(key: string): string {
  const [y, m, d] = parts(key)
  const t = new Date(Date.UTC(y, m - 1, d))
  return `${WEEKDAYS_LONG[t.getUTCDay()]} ${d} ${MONTHS[m - 1]}`
}

export function doneCount(p: Progress): number {
  return Object.keys(p.done).length
}

export function isFinished(p: Progress): boolean {
  return doneCount(p) >= TOTAL
}

export function isDone(p: Progress, idx: number): boolean {
  return p.done[String(idx)] !== undefined
}

/** The lowest challenge never completed, or null when all are done. */
export function nextInOrder(p: Progress): number | null {
  for (let i = 0; i < TOTAL; i++) if (!isDone(p, i)) return i
  return null
}

export function remaining(p: Progress): number[] {
  const out: number[] = []
  for (let i = 0; i < TOTAL; i++) if (!isDone(p, i)) out.push(i)
  return out
}

/** The challenge for `day`: the remembered one, else the next in order. Never writes. */
export function todayIdx(p: Progress, day: string): number | null {
  const t = p.today
  if (t !== null && t.day === day) {
    const when = p.done[String(t.idx)]
    if (when === undefined || when === day) return t.idx
  }
  return nextInOrder(p)
}

/** Remembers today's pick. Returns the same object when nothing changes. */
export function ensureToday(p: Progress, day: string): Progress {
  const idx = todayIdx(p, day)
  if (idx === null) return p.today === null ? p : { ...p, today: null }
  if (p.today !== null && p.today.day === day && p.today.idx === idx) return p
  return { ...p, today: { day, idx } }
}

export function isTodayDone(p: Progress, day: string): boolean {
  const idx = todayIdx(p, day)
  return idx !== null && p.done[String(idx)] === day
}

export function complete(p: Progress, day: string): Progress {
  const q = ensureToday(p, day)
  if (q.today === null) return q
  if (isDone(q, q.today.idx)) return q
  return { ...q, done: { ...q.done, [String(q.today.idx)]: day } }
}

export function undo(p: Progress, day: string): Progress {
  const idx = todayIdx(p, day)
  if (idx === null || p.done[String(idx)] !== day) return p
  const done = { ...p.done }
  delete done[String(idx)]
  return { ...p, done, today: { day, idx } }
}

export function canSwap(p: Progress, day: string): boolean {
  const idx = todayIdx(p, day)
  if (idx === null || isDone(p, idx)) return false
  return remaining(p).some(i => i !== idx)
}

/** Swaps today's challenge for a random never-completed one, remembered for the day. */
export function swap(p: Progress, day: string, rand: () => number): Progress {
  const q = ensureToday(p, day)
  if (!canSwap(q, day) || q.today === null) return q
  const pool = remaining(q).filter(i => i !== q.today!.idx)
  const pick = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!
  return { ...q, today: { day, idx: pick } }
}

function completedDays(p: Progress): Set<string> {
  return new Set(Object.values(p.done))
}

/** Days in a row with a completion, ending today (or yesterday if today is not done yet). */
export function currentStreak(p: Progress, day: string): number {
  const days = completedDays(p)
  let cursor = days.has(day) ? day : shiftDay(day, -1)
  let n = 0
  while (days.has(cursor)) {
    n++
    cursor = shiftDay(cursor, -1)
  }
  return n
}

export function bestStreak(p: Progress): number {
  const days = [...completedDays(p)].sort()
  let best = 0
  let run = 0
  let prev = ''
  for (const d of days) {
    run = prev !== '' && shiftDay(prev, 1) === d ? run + 1 : 1
    if (run > best) best = run
    prev = d
  }
  return best
}

export type DaySquare = { day: string; isDone: boolean; label: string; isToday: boolean }

export function lastDays(p: Progress, day: string, count: number): DaySquare[] {
  const days = completedDays(p)
  const out: DaySquare[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = shiftDay(day, -i)
    out.push({ day: d, isDone: days.has(d), label: weekday(d), isToday: i === 0 })
  }
  return out
}

/** Word-wraps to `width` cells; words longer than the width are cut. */
export function wrap(text: string, width: number): string[] {
  const w = Math.max(1, width)
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const piece = word.length > w ? word.slice(0, w) : word
    if (line === '') line = piece
    else if (line.length + 1 + piece.length <= w) line += ' ' + piece
    else {
      lines.push(line)
      line = piece
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

export function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length)
}

export function center(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  const left = Math.floor((width - text.length) / 2)
  return ' '.repeat(left) + text + ' '.repeat(width - text.length - left)
}

const DIGITS: Record<string, readonly [string, string, string]> = {
  '0': ['┏━┓', '┃ ┃', '┗━┛'],
  '1': ['╺┓ ', ' ┃ ', '╺┻╸'],
  '2': ['╺━┓', '┏━┛', '┗━╸'],
  '3': ['╺━┓', ' ━┫', '╺━┛'],
  '4': ['╻ ╻', '┗━┫', '  ╹'],
  '5': ['┏━╸', '┗━┓', '╺━┛'],
  '6': ['┏━╸', '┣━┓', '┗━┛'],
  '7': ['╺━┓', '  ┃', '  ╹'],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '╺━┛'],
}

/** A number drawn three rows tall in heavy box-drawing characters. */
export function bigNumber(n: number): [string, string, string] {
  const rows: [string, string, string] = ['', '', '']
  const chars = String(Math.max(0, Math.floor(n))).split('')
  chars.forEach((c, i) => {
    const glyph = DIGITS[c] ?? DIGITS['0']!
    for (let r = 0; r < 3; r++) rows[r] += (i > 0 ? ' ' : '') + glyph[r]!
  })
  return rows
}

export function coachRequest(title: string, task: string): string {
  return `Please walk me through today's challenge one step at a time, and wait for me after each step. The challenge is "${title}": ${task}`
}

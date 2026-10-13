import type { CvChecklist, CvTask } from '../types'

export const EMPTY_CHECKLIST: CvChecklist = {
  title: '',
  phase: 'idle',
  tasks: [],
  needsYouReason: '',
  stuckReason: '',
  startedAt: 0,
  finishedAt: 0,
  isCollapsed: false,
}

export const MAX_NAME = 40
export const METER = 10
export const FALLBACK_NAME = 'Working on it'

export const NEEDS_OK = 'Claude needs your OK to continue'
export const HAS_QUESTION = 'Claude has a question for you'
export const WAITING_REPLY = 'Claude is waiting for your reply'
export const SAID_NO = 'You said no to a step, so Claude paused'
export const KEEPS_FAILING = 'A step keeps failing, Claude is trying another way'
export const REFUSED = "Claude couldn't help with that request"

const CODE_EXT =
  /\.(tsx?|jsx?|mjs|cjs|mts|cts|java|kt|kts|py|rb|go|rs|cs|cpp|cc|hpp|c|h|swift|php|lua|json|jsonc|ya?ml|toml|xml|html?|css|scss|less|vue|svelte|md|mdx|sh|bash|bat|cmd|ps1|gradle|sql|lock|ini|env|cfg|conf|properties|txt|log|csv)$/i

/** The one cleaner every name passes through: no code, no paths, no file names, at most 40 characters. */
export function cleanName(raw: unknown): string {
  const stripped = String(raw ?? '')
    .replace(/`[^`]*`/g, ' ')
    .replace(/`/g, ' ')
  const words = stripped
    .split(/\s+/)
    .filter(w => w !== '' && !/[\\/]/.test(w) && !CODE_EXT.test(w.replace(/[.,;:!?)"'\]]+$/, '')))
  let s = words.join(' ').trim()
  if (s === '') return FALLBACK_NAME
  s = s[0]!.toUpperCase() + s.slice(1)
  if (s.length > MAX_NAME) {
    let cut = s.slice(0, MAX_NAME - 1)
    if (s[MAX_NAME - 1] !== ' ') {
      const space = cut.lastIndexOf(' ')
      if (space > 0) cut = cut.slice(0, space)
    }
    s = `${cut.trimEnd().replace(/[,;:.\-–]+$/, '')}…`
  }
  return s
}

/** A stand-in job name from the prompt, until Haiku's arrives. */
export function titleFrom(text: string): string {
  const clause = text.split(/[.!?\n,;:]/).find(part => part.trim() !== '') ?? ''
  const words = cleanName(clause).split(' ')
  return words.length > 6 ? `${words.slice(0, 6).join(' ')}…` : words.join(' ')
}

/** Haiku's reply as a job name: its first line, quotes and a full stop taken off. */
export function titleFromReply(reply: string): string {
  const line = (reply.split('\n').find(l => l.trim() !== '') ?? '').trim()
  return cleanName(line.replace(/^["'*\s]+|["'*.\s]+$/g, ''))
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function clampPercent(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}

export const isLive = (cl: CvChecklist): boolean =>
  cl.phase === 'working' || cl.phase === 'needs-you' || cl.phase === 'stuck'

const isPlaceholder = (t: CvTask): boolean => t.id.startsWith('ph-')

/** A live job with steps Claude laid out itself, not the placeholders. */
export const hasRealPlan = (cl: CvChecklist): boolean =>
  isLive(cl) && cl.tasks.some(t => !isPlaceholder(t))

function task(id: string, name: string, status: CvTask['status']): CvTask {
  return { id, name, status, percent: status === 'done' ? 100 : 0, hasReported: false }
}

export function startJob(title: string, now: number): CvChecklist {
  return {
    ...EMPTY_CHECKLIST,
    title,
    phase: 'working',
    startedAt: now,
    tasks: [task('ph-0', 'Understand your request', 'active'), task('ph-1', 'Plan the steps', 'upcoming')],
  }
}

/** The job as it stands, or a fresh one when nothing is running. */
export function ensureJob(cl: CvChecklist, now: number): CvChecklist {
  if (isLive(cl)) return cl
  return { ...EMPTY_CHECKLIST, title: FALLBACK_NAME, phase: 'working', startedAt: now }
}

/** At most one active step: the first not done, when none is. */
function settle(tasks: CvTask[]): CvTask[] {
  if (!tasks.some(t => t.status === 'active')) {
    const first = tasks.find(t => t.status === 'upcoming')
    if (first) first.status = 'active'
  }
  return tasks
}

export function planSteps(cl: CvChecklist, names: unknown[], now: number): CvChecklist {
  const cleaned = names.map(cleanName).slice(0, 8)
  if (cleaned.length === 0) return cl
  const base = ensureJob(cl, now)
  return {
    ...base,
    phase: 'working',
    needsYouReason: '',
    stuckReason: '',
    isCollapsed: false,
    finishedAt: 0,
    tasks: cleaned.map((n, i) => task(`p${i}`, n, i === 0 ? 'active' : 'upcoming')),
  }
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/…$/, '')
    .replace(/[^a-z0-9 ]+/g, '')
    .trim()

function findTask(tasks: CvTask[], name: string): number {
  const n = norm(name)
  const exact = tasks.findIndex(t => norm(t.name) === n)
  if (exact >= 0 || n.length < 6) return exact
  return tasks.findIndex(t => {
    const m = norm(t.name)
    return m.length >= 6 && (m.startsWith(n) || n.startsWith(m))
  })
}

export function reportProgress(cl: CvChecklist, rawTask: unknown, rawPercent: unknown): CvChecklist {
  const percent = clampPercent(rawPercent)
  const name = cleanName(rawTask)
  let tasks = cl.tasks.filter(t => !isPlaceholder(t)).map(t => ({ ...t }))
  let idx = findTask(tasks, name)
  if (idx < 0) {
    // Something unplanned: it becomes the current step, ahead of the one it interrupted.
    const at = tasks.findIndex(t => t.status !== 'done')
    idx = at < 0 ? tasks.length : at
    tasks.splice(idx, 0, task(`n${tasks.length}-${norm(name).slice(0, 12)}`, name, 'upcoming'))
  }
  for (let i = 0; i < idx; i++) {
    tasks[i]!.status = 'done'
    tasks[i]!.percent = 100
  }
  for (const t of tasks.slice(idx + 1)) if (t.status === 'active') t.status = 'upcoming'
  const cur = tasks[idx]!
  cur.hasReported = true
  cur.percent = percent
  cur.status = percent >= 100 ? 'done' : 'active'
  tasks = settle(tasks)
  return { ...cl, tasks }
}

export type TodoItem = { content?: string; subject?: string; status?: string }

export function fromTodos(cl: CvChecklist, todos: readonly TodoItem[]): CvChecklist {
  const old = new Map(cl.tasks.map(t => [norm(t.name), t]))
  const tasks: CvTask[] = todos.slice(0, 12).map((t, i) => {
    const name = cleanName(t.content ?? t.subject ?? '')
    const prev = old.get(norm(name))
    const status: CvTask['status'] =
      t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : 'upcoming'
    return {
      id: `t${i}`,
      name,
      status,
      percent: status === 'done' ? 100 : status === 'active' ? (prev?.percent ?? 0) : 0,
      hasReported: status === 'active' ? (prev?.hasReported ?? false) : false,
    }
  })
  if (tasks.length === 0) return cl
  return { ...cl, tasks: settle(tasks) }
}

export function addTask(cl: CvChecklist, subject: unknown, key: string): CvChecklist {
  const tasks = cl.tasks.filter(t => !isPlaceholder(t))
  tasks.push(task(key, cleanName(subject), 'upcoming'))
  return { ...cl, tasks: settle(tasks) }
}

export function updateTask(cl: CvChecklist, key: string, status: string): CvChecklist {
  if (status === 'deleted') return { ...cl, tasks: settle(cl.tasks.filter(t => t.id !== key).map(t => ({ ...t }))) }
  const tasks = cl.tasks.map(t => {
    if (status === 'in_progress' && t.id !== key && t.status === 'active') return { ...t, status: 'upcoming' as const }
    if (t.id !== key) return { ...t }
    if (status === 'completed') return { ...t, status: 'done' as const, percent: 100 }
    if (status === 'in_progress') return { ...t, status: 'active' as const }
    return { ...t, status: 'upcoming' as const, percent: 0, hasReported: false }
  })
  return { ...cl, tasks: settle(tasks) }
}

export const unfinished = (cl: CvChecklist): boolean =>
  cl.tasks.some(t => t.status !== 'done' && !isPlaceholder(t))

export function rowLabel(tasks: readonly CvTask[], i: number): string {
  const t = tasks[i]!
  if (t.status === 'done') return 'Done'
  if (t.status === 'active') return t.hasReported ? `${t.percent}%` : 'Working'
  return tasks.findIndex(x => x.status === 'upcoming') === i ? 'Next' : 'Up next'
}

/** The whole job's progress: done steps, plus the current step's share. */
export function overall(cl: CvChecklist): { done: number; total: number; step: number; percent: number } {
  const tasks = cl.tasks
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  const active = tasks.find(t => t.status === 'active')
  const part = active ? active.percent / 100 : 0
  const percent = total === 0 ? 0 : Math.round(((done + part) / total) * 100)
  const step = active ? tasks.indexOf(active) + 1 : Math.min(total, done + 1)
  return { done, total, step, percent: cl.phase === 'done' ? 100 : Math.min(percent, 100) }
}

/** An API error as one calm sentence. */
export function classifyError(text: string): string {
  const t = text.toLowerCase()
  if (/usage limit|rate.?limit|429|quota|too many requests/.test(t)) return 'You hit your usage limit, try again a little later'
  if (/overload|529|busy|503|capacity/.test(t)) return "Claude's servers are busy, try again in a minute"
  if (/too long|context|maximum.*tokens|prompt is too/.test(t)) return 'Type /compact and try again'
  if (/auth|401|403|api key|log ?in|credential|token.*(expired|invalid)/.test(t)) return 'Type /login'
  if (/network|econn|enotfound|fetch failed|connection|timed? ?out|offline|socket/.test(t)) return 'The internet connection dropped'
  return 'Something went wrong, try again'
}

export const USER_DENIED =
  /doesn't want to proceed|user rejected|user denied|user declined|rejected by the user|denied by the user|permission.*denied/i

/** Exactly as wide as `width`: cut with an ellipsis, or padded. */
export function padTo(text: string, width: number): string {
  const chars = [...text]
  if (width <= 0) return ''
  if (chars.length > width) return `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
  return text + ' '.repeat(width - chars.length)
}

export const PLAN_RULES = [
  '# Clean View',
  'Clean View is on: the person sees a plain checklist of your steps above the prompt, never your tool calls.',
  '- Write every step name in plain English a non-technical person understands. Keep it under 40 characters and start it with a verb, like "Build the pricing section".',
  '- Never put file paths, file names, commands, code or tool names in a step name.',
  '- For every request, even a quick question, call plan_steps (mcp__clean-view__plan_steps) first with 2 to 8 step names in order; load it with ToolSearch if it is deferred. Then call report_progress (mcp__clean-view__report_progress) as real progress happens, and with percent 100 the moment a step finishes.',
  '- If this session has TodoWrite or TaskCreate, you may use that to-do list as the plan instead.',
].join('\n')

export const PLAN_FIRST =
  'Clean View: call plan_steps first (mcp__clean-view__plan_steps; load it with ToolSearch if it is deferred) with 2 to 8 short plain-English step names, then carry on.'

// ---- colour ----------------------------------------------------------------

export type Palette = {
  text: string
  dim: string
  faint: string
  track: string
  badgeText: string
  warmFrom: string
  warmTo: string
  titleTo: string
  goodFrom: string
  goodTo: string
  good: string
  accent: string
  warn: string
  bad: string
  border: string
  idle: string
  /** What a lit pixel brightens toward: light on a dark theme, dark on a light one. */
  tint: string
}

// Claude's warm coral and sage, kept soft.
export const DARK: Palette = {
  text: '#E8E3D9',
  dim: '#9A948A',
  faint: '#6A655D',
  track: '#3A3531',
  badgeText: '#1C1A17',
  warmFrom: '#E8A06A',
  warmTo: '#D9667F',
  titleTo: '#A99BE0',
  goodFrom: '#5E9A6A',
  goodTo: '#A9D6AE',
  good: '#9CC5A1',
  accent: '#E07A7F',
  warn: '#E5C07B',
  bad: '#E08A8A',
  border: '#C96A7C',
  idle: '#5A554E',
  tint: '#FFF6EC',
}

export const LIGHT: Palette = {
  text: '#3D3929',
  dim: '#7A756C',
  faint: '#A8A297',
  track: '#E4DED3',
  badgeText: '#FFFFFF',
  warmFrom: '#C9722F',
  warmTo: '#B8435F',
  titleTo: '#6A58B8',
  goodFrom: '#3E7A4A',
  goodTo: '#6FAE7A',
  good: '#4E7D57',
  accent: '#B8435F',
  warn: '#9A6B10',
  bad: '#B3474A',
  border: '#C77C8A',
  idle: '#C9C3B8',
  tint: '#3A1E26',
}

export const paletteFor = (theme: unknown): Palette =>
  typeof theme === 'string' && theme.startsWith('light') ? LIGHT : DARK

const hex = (c: string): number[] => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const toHex = (n: number[]): string => `#${n.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`

export function mix(a: string, b: string, t: number): string {
  const x = hex(a)
  const y = hex(b)
  const k = Math.max(0, Math.min(1, t))
  return toHex(x.map((v, i) => v + (y[i]! - v) * k))
}

/** A colour along a gradient of stops, at `t` from 0 to 1, in 12 steps so neighbours share runs. */
export function along(stops: readonly string[], t: number): string {
  const q = Math.round(Math.max(0, Math.min(1, t)) * 12) / 12
  if (stops.length === 1) return stops[0]!
  const span = q * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(span))
  return mix(stops[i]!, stops[i + 1]!, span - i)
}

export type Run = { text: string; color: string }

/** Neighbouring cells of one colour joined into one run. */
export function joinRuns(cells: readonly Run[]): Run[] {
  const out: Run[] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    if (last && last.color === c.color) last.text += c.text
    else out.push({ ...c })
  }
  return out
}

/** `text`, its characters coloured along `stops`. */
export const gradientText = (text: string, stops: readonly string[]): Run[] => {
  const chars = [...text]
  return joinRuns(chars.map((ch, i) => ({ text: ch, color: along(stops, chars.length <= 1 ? 0 : i / (chars.length - 1)) })))
}

// ---- pixel meters ------------------------------------------------------------

/** One terminal cell of a pixel meter: a braille glyph and its colour. */
export type Pixel = { ch: string; color: string }

// A meter lights only the middle two dot rows of each braille cell (2 dots across, 2 down),
// so it reads as a thin line of pixels with a gap above and below it.
const THIN_BITS = [
  [0x02, 0x04],
  [0x10, 0x20],
] as const

export const BLANK = '⠀'
export const THIN_FULL = String.fromCharCode(0x2800 + 0x02 + 0x04 + 0x10 + 0x20)

/** A steady pseudo-random 0..1 for a pixel on a frame, so pixels twinkle without real randomness. */
export function noise(i: number, tick: number, seed = 0): number {
  let h = (i * 374761393 + tick * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

/** The pixels' twinkle changes every other frame, half a second, so it shimmers rather than flickers. */
const frame = (tick: number) => Math.floor(tick / 2)

export type MeterLook = { stops: readonly string[]; track: string; tint: string; tick: number; seed?: number }

/**
 * A thin band of pixels `width` cells wide, lit between `from` and `to` (fractions 0..1).
 * Each pixel has its own random threshold, so the lit part rises through scattered pixels
 * rather than a straight edge; the newest pixels glow toward `tint`, a few lit ones blink
 * off and on, and the unlit track keeps a sparse, shimmering scatter of dim pixels.
 */
function pixelBand(width: number, from: number, to: number, look: MeterLook): Pixel[] {
  // A finished meter is solid: every pixel lit, steady colour, no twinkle.
  if (from <= 0 && to >= 1) {
    return Array.from({ length: width }, (_, i) => ({ ch: THIN_FULL, color: along(look.stops, width <= 1 ? 0 : i / (width - 1)) }))
  }
  const across = width * 2
  const spread = Math.min(0.3, 5 / across)
  const edge = Math.min(0.15, 2.5 / across)
  const seed = look.seed ?? 0
  const t = frame(look.tick)
  const out: Pixel[] = []
  for (let i = 0; i < width; i++) {
    let lit = 0
    let trackBits = 0
    let filled = 0
    let glowing = 0
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        const x = i * 2 + dx
        const bit = THIN_BITS[dx]![dy]!
        const at = (x + 0.5) / across + (noise(x * 13 + dy * 7, 0, seed + 11) - 0.5) * spread
        const isOn = (to >= 1 || at < to) && (from <= 0 || at >= from)
        if (isOn) {
          filled++
          if (to < 1 && to - at < edge) {
            glowing++
            lit |= bit
          } else if (noise(x * 5 + dy * 3, t, seed + 3) > 0.1) {
            lit |= bit
          }
        } else if (noise(x * 3 + dy * 11, Math.floor(t / 2), seed + 5) < 0.2) {
          trackBits |= bit
        }
      }
    }
    const base = along(look.stops, width <= 1 ? 0 : i / (width - 1))
    if (glowing > 0) {
      out.push({ ch: String.fromCharCode(0x2800 + lit), color: mix(base, look.tint, 0.55) })
    } else if (filled > 0) {
      out.push({ ch: String.fromCharCode(0x2800 + lit), color: mix(base, look.tint, 0.03 + noise(i, t, seed) * 0.22) })
    } else {
      out.push({ ch: String.fromCharCode(0x2800 + trackBits), color: mix(look.track, look.tint, 0.12 + noise(i, t, seed + 7) * 0.12) })
    }
  }
  return out
}

/** A meter `width` cells wide with `fraction` (0..1) of it lit. */
export const pixelMeter = (width: number, fraction: number, look: MeterLook): Pixel[] =>
  pixelBand(width, 0, Math.max(0, Math.min(1, fraction)), look)

/** A step with no percent yet: a short scatter of lit pixels running along the track. */
export function pixelSweep(width: number, look: MeterLook): Pixel[] {
  const span = 0.3
  const steps = width + 4
  const front = ((look.tick % steps) / (steps - 1)) * (1 + span)
  return pixelBand(width, front - span, Math.min(front, 0.999), look)
}

/** Pixels as runs of one colour, for a surface that draws text. */
export const pixelRuns = (pixels: readonly Pixel[]): Run[] => joinRuns(pixels.map(p => ({ text: p.ch, color: p.color })))

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += b === undefined ? '=' : B64[(n >> 6) & 63]!
    out += c === undefined ? '=' : B64[n & 63]!
  }
  return out
}

const DEFAULT_COLOUR = 0x01000000

/** Pixels as a terminal Raster's cells: little-endian `[codePoint, foreground, background]` per cell. */
export function rasterCells(pixels: readonly Pixel[]): string {
  const words = new Uint32Array(pixels.length * 3)
  pixels.forEach((p, i) => {
    words[i * 3] = p.ch.charCodeAt(0)
    words[i * 3 + 1] = parseInt(p.color.slice(1), 16)
    words[i * 3 + 2] = DEFAULT_COLOUR
  })
  return base64(new Uint8Array(words.buffer))
}

/** Eases a shown fraction toward its target over `ms`, so a meter builds up rather than jumps. */
export function easeToward(from: number, to: number, elapsed: number, ms = 900): number {
  const k = Math.max(0, Math.min(1, elapsed / ms))
  return k >= 1 ? to : from + (to - from) * (1 - (1 - k) ** 3)
}

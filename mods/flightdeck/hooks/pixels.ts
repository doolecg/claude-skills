// Clean View's pixel meters, copied so the two mods' bars look the same.

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

/** One terminal cell of a pixel meter: a braille glyph and its colour. */
export type Pixel = { ch: string; color: string }

// A meter lights only the middle two dot rows of each braille cell (2 dots across, 2 down),
// so it reads as a thin line of pixels with a gap above and below it.
const THIN_BITS = [
  [0x02, 0x04],
  [0x10, 0x20],
] as const

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
  pixelBand(Math.max(0, width), 0, Math.max(0, Math.min(1, fraction)), look)

/** Work with no percent yet: a short scatter of lit pixels running along the track. */
export function pixelSweep(width: number, look: MeterLook): Pixel[] {
  const span = 0.3
  const steps = width + 4
  const front = ((look.tick % steps) / (steps - 1)) * (1 + span)
  return pixelBand(Math.max(0, width), front - span, Math.min(front, 0.999), look)
}

/** Pixels as runs of one colour, for a surface that draws text. */
export const pixelRuns = (pixels: readonly Pixel[]): Run[] => joinRuns(pixels.map(p => ({ text: p.ch, color: p.color })))

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64(bytes: Uint8Array): string {
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

/** The Raster word for the terminal's own colour. */
export const DEFAULT_COLOUR = 0x01000000

/** A `#RRGGBB` as a Raster colour word; the terminal's own colour for anything else. */
export const colourWord = (c: string | undefined): number =>
  c && /^#[0-9a-fA-F]{6}$/.test(c) ? parseInt(c.slice(1), 16) : DEFAULT_COLOUR

/** Pixels as a terminal Raster's cells: little-endian `[codePoint, foreground, background]` per cell. */
export function rasterCells(pixels: readonly Pixel[], background?: string): string {
  const bg = colourWord(background)
  const words = new Uint32Array(pixels.length * 3)
  pixels.forEach((p, i) => {
    words[i * 3] = p.ch.charCodeAt(0)
    words[i * 3 + 1] = parseInt(p.color.slice(1), 16)
    words[i * 3 + 2] = bg
  })
  return base64(new Uint8Array(words.buffer))
}

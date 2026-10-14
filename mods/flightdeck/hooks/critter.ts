// The 12x12 pixel critter each subagent carries (from the old Agents Panel mod): a hat,
// a tint and a nickname picked by an FNV-1a hash of the agent id, so one agent always
// looks the same.

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

/** The Raster word for the terminal's own colour. */
const DEFAULT_COLOUR = 0x01000000

/** A `#RRGGBB` as a Raster colour word; the terminal's own colour for anything else. */
const colourWord = (c: string | undefined): number => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? parseInt(c.slice(1), 16) : DEFAULT_COLOUR)

export const HATS = ['cap', 'hardhat', 'beanie', 'chef', 'headphones', 'flag', 'bow', 'crown'] as const
export const TINTS = ['coral', 'peach', 'butter'] as const

export type Hat = (typeof HATS)[number]
export type Tint = (typeof TINTS)[number]

export const NAMES = [
  'Mango', 'Chewie', 'Biscuit', 'Pickle', 'Nugget', 'Pepper', 'Waffles', 'Noodle',
  'Pip', 'Mochi', 'Tofu', 'Bean', 'Ziggy', 'Juniper', 'Olive', 'Sprout',
  'Pudding', 'Toffee', 'Basil', 'Fig', 'Maple', 'Pebble', 'Clover', 'Rocket',
]

/** 32-bit FNV-1a over the UTF-16 code units of `text`. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

export type Critter = { hat: Hat; tint: Tint; name: string }

export function critterOf(agentId: string): Critter {
  const h = fnv1a(agentId)
  return {
    hat: HATS[h % HATS.length]!,
    tint: TINTS[Math.floor(h / HATS.length) % TINTS.length]!,
    name: NAMES[(h >>> 8) % NAMES.length]!,
  }
}

const BODY: Record<Tint, { body: number; shade: number }> = {
  coral: { body: 0xe8735a, shade: 0xb9533f },
  peach: { body: 0xf4a983, shade: 0xc98262 },
  butter: { body: 0xf2d27a, shade: 0xc4a650 },
}
const EYE = 0x2b2420
const LEG = 0x5a4a42

// Rows 0-3 hold the hat, 4-10 the body, 11 is free so the critter can bob down a pixel.
const BODY_ROWS = [
  '..BBBBBBBB..',
  '.BBBBBBBBBB.',
  '.BBEBBBBEBB.',
  '.BBEBBBBEBB.',
  '.BBBBBBBBBB.',
  '..SSSSSSSS..',
  '..L.L..L.L..',
]

const HAT_ART: Record<Hat, { rows: string[]; main: number; accent: number }> = {
  cap: { rows: ['............', '...HHHHHH...', '..HHHHHHHH..', '..HHHHHHHHAA'], main: 0x3b6fd4, accent: 0x274b94 },
  hardhat: { rows: ['....HHHH....', '..HHHHHHHH..', '.HHHHAAHHHH.', 'HHHHHHHHHHHH'], main: 0xf5c518, accent: 0xc99a00 },
  beanie: { rows: ['.....AA.....', '...HHHHHH...', '..HHHHHHHH..', '..AAAAAAAA..'], main: 0x2f9e6e, accent: 0xe8e8e8 },
  chef: { rows: ['..HHH.HHH...', '..HHHHHHHH..', '...HHHHHH...', '...AAAAAA...'], main: 0xf7f7f2, accent: 0xd0d0c8 },
  headphones: { rows: ['............', '...HHHHHH...', '..H......H..', '.AA......AA.'], main: 0x444a55, accent: 0xd94a4a },
  flag: { rows: ['.....HHHH...', '.....HHH....', '.....A......', '.....A......'], main: 0xd94a4a, accent: 0x6b5a4e },
  bow: { rows: ['............', '............', '...HH.HH....', '....HAH.....'], main: 0xe05aa0, accent: 0xa83a76 },
  crown: { rows: ['..A..A..A...', '..HAHHHAH...', '..HHHHHHH...', '............'], main: 0xf2b416, accent: 0xd94a4a },
}

/** The critter as 12 rows of 12 colours (`0x00RRGGBB`), `-1` where nothing is drawn; `isDown` bobs it a pixel. */
export function critterPixels(agentId: string, isDown = false): number[][] {
  const { hat, tint } = critterOf(agentId)
  const art = HAT_ART[hat]
  const tone = BODY[tint]
  const grid: number[][] = Array.from({ length: 12 }, () => Array<number>(12).fill(-1))
  BODY_ROWS.forEach((row, r) => {
    for (let c = 0; c < 12; c++) {
      const ch = row[c]
      const color = ch === 'B' ? tone.body : ch === 'S' ? tone.shade : ch === 'E' ? EYE : ch === 'L' ? LEG : -1
      if (color >= 0) grid[r + 4]![c] = color
    }
  })
  art.rows.forEach((row, r) => {
    for (let c = 0; c < 12; c++) {
      const ch = row[c]
      if (ch === 'H') grid[r]![c] = art.main
      else if (ch === 'A') grid[r]![c] = art.accent
    }
  })
  return isDown ? [Array<number>(12).fill(-1), ...grid.slice(0, 11)] : grid
}

/** The 12x12 pixels as 6x6: each 2x2 block becomes its eye colour if it has one, else its most common colour, else empty. */
export function smallPixels(pixels: number[][]): number[][] {
  return Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => {
      const block = [pixels[r * 2]![c * 2]!, pixels[r * 2]![c * 2 + 1]!, pixels[r * 2 + 1]![c * 2]!, pixels[r * 2 + 1]![c * 2 + 1]!].filter(p => p >= 0)
      if (block.includes(EYE)) return EYE
      let best = -1
      let most = 0
      for (const p of block) {
        const n = block.filter(q => q === p).length
        if (n > most) {
          best = p
          most = n
        }
      }
      return best
    }),
  )
}

const UPPER = 0x2580
const LOWER = 0x2584

/** A terminal Raster of the pixels, two per cell (upper and lower half): 12x12 is 12 columns by 6 rows. */
export function rasterOf(pixels: number[][], background?: string): { columns: number; rows: number; cells: string } {
  const bg = colourWord(background)
  const width = pixels[0]?.length ?? 0
  const words: number[] = []
  for (let r = 0; r < pixels.length; r += 2) {
    for (let c = 0; c < width; c++) {
      const top = pixels[r]![c]!
      const bottom = pixels[r + 1]?.[c] ?? -1
      if (top < 0 && bottom < 0) words.push(0x20, bg, bg)
      else if (top < 0) words.push(LOWER, bottom, bg)
      else words.push(UPPER, top, bottom < 0 ? bg : bottom)
    }
  }
  return { columns: width, rows: Math.ceil(pixels.length / 2), cells: base64(new Uint8Array(Uint32Array.from(words).buffer)) }
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/** An SVG of the critter, 2 CSS pixels per pixel; a running agent bobs by one pixel (SMIL). */
export function svgOf(agentId: string, isBobbing: boolean): string {
  const pixels = critterPixels(agentId)
  const bob = isBobbing
    ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 1;0 0" dur="0.9s" repeatCount="indefinite"/>'
    : ''
  let rects = ''
  pixels.forEach((row, r) =>
    row.forEach((color, c) => {
      if (color >= 0) rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="${hex(color)}"/>`
    }),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges"><g>${bob}${rects}</g></svg>`
}

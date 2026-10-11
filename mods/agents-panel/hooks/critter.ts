// The 12x12 pixel critter each sub-agent row carries: a hat and a tint picked by an
// FNV-1a hash of the agent id, so one agent always looks the same.

export const HATS = ['cap', 'hardhat', 'beanie', 'chef', 'headphones', 'flag', 'bow', 'crown'] as const
export const TINTS = ['coral', 'peach', 'butter'] as const

export type Hat = (typeof HATS)[number]
export type Tint = (typeof TINTS)[number]

const ADJECTIVES = [
  'Brisk', 'Calm', 'Clever', 'Cosy', 'Dapper', 'Eager', 'Fuzzy', 'Gentle',
  'Happy', 'Jolly', 'Keen', 'Lucky', 'Merry', 'Nimble', 'Plucky', 'Quiet',
  'Rusty', 'Snappy', 'Sunny', 'Swift', 'Tidy', 'Witty', 'Zesty', 'Bouncy',
]
const NOUNS = [
  'Otter', 'Badger', 'Finch', 'Hedgehog', 'Lynx', 'Marmot', 'Newt', 'Puffin',
  'Quokka', 'Robin', 'Stoat', 'Tapir', 'Vole', 'Wombat', 'Yak', 'Gecko',
  'Heron', 'Koala', 'Lemur', 'Mole', 'Panda', 'Raven', 'Seal', 'Wren',
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
    name: `${ADJECTIVES[(h >>> 8) % ADJECTIVES.length]} ${NOUNS[(h >>> 16) % NOUNS.length]}`,
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

/** The critter as 12 rows of 12 colours (`0x00RRGGBB`), `-1` where nothing is drawn. */
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

export function toBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0
    const n = (a << 16) | (b << 8) | c
    out += chars[(n >> 18) & 63]! + chars[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? chars[n & 63]! : '='
  }
  return out
}

const DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584

/** A terminal Raster of the pixels, two pixels per cell (upper and lower half): 12x12 is 12 columns by 6 rows. */
export function rasterOf(pixels: number[][]): { columns: number; rows: number; cells: string } {
  const width = pixels[0]?.length ?? 0
  const words: number[] = []
  for (let r = 0; r < pixels.length; r += 2) {
    for (let c = 0; c < width; c++) {
      const top = pixels[r]![c]!
      const bottom = pixels[r + 1]?.[c] ?? -1
      if (top < 0 && bottom < 0) words.push(0x20, DEFAULT, DEFAULT)
      else if (top < 0) words.push(LOWER, bottom, DEFAULT)
      else words.push(UPPER, top, bottom < 0 ? DEFAULT : bottom)
    }
  }
  return { columns: width, rows: Math.ceil(pixels.length / 2), cells: toBase64(new Uint8Array(Uint32Array.from(words).buffer)) }
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

function svgPixels(pixels: number[][], scale: number, animation = ''): string {
  const w = pixels[0]?.length ?? 0
  const h = pixels.length
  let rects = ''
  pixels.forEach((row, r) =>
    row.forEach((color, c) => {
      if (color >= 0) rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="${hex(color)}"/>`
    }),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges"><g>${animation}${rects}</g></svg>`
}

/** An SVG of the critter, 2 CSS pixels per pixel; a running agent bobs by one pixel (SMIL). */
export function svgOf(agentId: string, isBobbing: boolean): string {
  const bob = isBobbing
    ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 1;0 0" dur="0.9s" repeatCount="indefinite"/>'
    : ''
  return svgPixels(critterPixels(agentId), 2, bob)
}

const BRAIN_ROWS = ['.PPPP.', 'PpPPpP', 'PPpPPP', '.PPPP.']

/** A small brain, 6 by 4 pixels, for the memory row. */
export function brainPixels(): number[][] {
  return BRAIN_ROWS.map(row => [...row].map(ch => (ch === 'P' ? 0xe98fae : ch === 'p' ? 0xb85f80 : -1)))
}

export function brainSvg(): string {
  return svgPixels(brainPixels(), 3)
}

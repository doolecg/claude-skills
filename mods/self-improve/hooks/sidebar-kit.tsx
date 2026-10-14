// The Sidebar's shared look: the tab strip, title rows, cards, settings rows and the dense pixel meter.
// Every mod that draws a sidebar tab keeps a copy of this file as hooks/sidebar-kit.tsx.
// Edit it in mods/sidebar/hooks and run `python mods/sidebar/copy-kit.py` so the copies stay the same.

export const KIT_VERSION = 2

/** The pane id every sidebar tab is drawn under its own plugin, and the width they all open at. */
export const SIDEBAR_COLUMNS = 56

// ---- colours ----------------------------------------------------------------

export type SbPalette = {
  text: string
  dim: string
  faint: string
  sep: string
  border: string
  accent: string
  good: string
  warn: string
  bad: string
  info: string
  pillBg: string
  pillFg: string
  panel: string
  ink: string
  track: string
  tint: string
  warmFrom: string
  warmTo: string
  titleTo: string
  goodFrom: string
  goodTo: string
}

// The Bottom Bar's colours, with Clean View's meter colours beside them.
export const SB_DARK: SbPalette = {
  text: '#E8E3D9',
  dim: '#8C877E',
  faint: '#6A655D',
  sep: '#55514A',
  border: '#4E4943',
  accent: '#D97757',
  good: '#9CC5A1',
  warn: '#E5C07B',
  bad: '#E08A8A',
  info: '#B9B4E8',
  pillBg: '#1F2C3D',
  pillFg: '#C9D3E0',
  panel: '#24201D',
  ink: '#1A1714',
  track: '#3A3531',
  tint: '#FFF6EC',
  warmFrom: '#E8A06A',
  warmTo: '#D9667F',
  titleTo: '#A99BE0',
  goodFrom: '#5E9A6A',
  goodTo: '#A9D6AE',
}

export const SB_LIGHT: SbPalette = {
  text: '#3D3929',
  dim: '#8A857C',
  faint: '#A8A297',
  sep: '#C9C3B8',
  border: '#D3CCC0',
  accent: '#C15F3C',
  good: '#4E7D57',
  warn: '#9A6B10',
  bad: '#B3474A',
  info: '#5A62B8',
  pillBg: '#E3E9F1',
  pillFg: '#2B3A4C',
  panel: '#FBF8F3',
  ink: '#FBF8F3',
  track: '#E4DED3',
  tint: '#3A1E26',
  warmFrom: '#C9722F',
  warmTo: '#B8435F',
  titleTo: '#6A58B8',
  goodFrom: '#3E7A4A',
  goodTo: '#6FAE7A',
}

/** The Bottom Bar's accent colours (dark, light), so the sidebar follows the bar's Colour setting. */
export const SB_ACCENTS: Record<string, readonly [string, string]> = {
  Coral: ['#D97757', '#C15F3C'],
  Amber: ['#E5A84B', '#9A6B10'],
  Sage: ['#8FBF8F', '#4E7D57'],
  Sky: ['#6FB3E0', '#2F6FA3'],
  Lilac: ['#B39DDB', '#6A4FB0'],
  Rose: ['#E07A9A', '#B0446A'],
}

export function sbPalette(theme: unknown, colour?: string): SbPalette {
  const isLight = typeof theme === 'string' && theme.startsWith('light')
  const base = isLight ? SB_LIGHT : SB_DARK
  const accent = colour ? SB_ACCENTS[colour]?.[isLight ? 1 : 0] : undefined
  return accent ? { ...base, accent } : base
}

// ---- the dense pixel meter ----------------------------------------------------

const hex = (c: string): number[] => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const toHex = (n: number[]): string => `#${n.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`

export function sbMix(a: string, b: string, t: number): string {
  const x = hex(a)
  const y = hex(b)
  const k = Math.max(0, Math.min(1, t))
  return toHex(x.map((v, i) => v + (y[i]! - v) * k))
}

/** A colour along a gradient of stops, at `t` from 0 to 1, in 12 steps so neighbours share runs. */
export function sbAlong(stops: readonly string[], t: number): string {
  const q = Math.round(Math.max(0, Math.min(1, t)) * 12) / 12
  if (stops.length === 1) return stops[0]!
  const span = q * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(span))
  return sbMix(stops[i]!, stops[i + 1]!, span - i)
}

export type SbPixel = { ch: string; color: string }
export type SbRun = { text: string; color: string }
export type SbLook = { stops: readonly string[]; track: string; tint: string; tick: number; seed?: number }

// Clean View's meter, made denser: every one of a braille cell's four dot rows is lit (2 dots across, 4 down).
const DENSE_BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
] as const

export const DENSE_FULL = String.fromCharCode(0x28ff)

/** A steady pseudo-random 0..1 for a pixel on a frame, so pixels twinkle without real randomness. */
export function sbNoise(i: number, tick: number, seed = 0): number {
  let h = (i * 374761393 + tick * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

/**
 * A dot-matrix band `width` cells wide, lit between `from` and `to` (fractions 0..1). Each cell is a
 * braille glyph: 2 dots across, 4 down. The lit part fades in from its tail: dim and sparse there,
 * brighter and fuller toward the front, which ends in a solid, bright head. A few dots blink each
 * frame, and the empty track keeps a sparse scatter of faint specks.
 */
function band(width: number, from: number, to: number, look: SbLook): SbPixel[] {
  if (from <= 0 && to >= 1) {
    return Array.from({ length: width }, (_, i) => ({ ch: DENSE_FULL, color: sbAlong(look.stops, width <= 1 ? 0 : i / (width - 1)) }))
  }
  const seed = look.seed ?? 0
  const t = Math.floor(look.tick / 2)
  const start = Math.max(0, from)
  const span = Math.max(1e-6, Math.min(1, to) - start)
  const head = Math.min(width - 1, Math.floor(Math.min(1, to) * width - 1e-6))
  const out: SbPixel[] = []
  for (let i = 0; i < width; i++) {
    const mid = (i + 0.5) / width
    const isLit = mid >= start && mid < to
    let bits = 0
    if (to > 0 && i === head && to < 1) {
      out.push({ ch: DENSE_FULL, color: sbMix(sbAlong(look.stops, 1), look.tint, 0.7) })
      continue
    }
    if (isLit) {
      // 0 at the tail, 1 just behind the head.
      const b = Math.max(0, Math.min(1, (mid - start) / span))
      const fill = 0.35 + 0.62 * b
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 4; dy++) {
          if (sbNoise(i * 8 + dx * 4 + dy, t, seed + 3) < fill) bits |= DENSE_BITS[dx]![dy]!
        }
      }
      const base = sbAlong(look.stops, width <= 1 ? 0 : i / (width - 1))
      const shade = sbMix(look.track, base, 0.35 + 0.65 * b)
      out.push({ ch: String.fromCharCode(0x2800 + bits), color: sbMix(shade, look.tint, b * b * 0.35 + sbNoise(i, t, seed) * 0.08) })
    } else {
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 4; dy++) {
          if (sbNoise(i * 8 + dx * 4 + dy, Math.floor(t / 2), seed + 5) < 0.14) bits |= DENSE_BITS[dx]![dy]!
        }
      }
      out.push({ ch: String.fromCharCode(0x2800 + bits), color: sbMix(look.track, look.tint, 0.1 + sbNoise(i, t, seed + 7) * 0.14) })
    }
  }
  return out
}

/** A meter `width` cells wide with `fraction` (0..1) of it lit. */
export const sbMeter = (width: number, fraction: number, look: SbLook): SbPixel[] =>
  band(Math.max(0, width), 0, Math.max(0, Math.min(1, fraction)), look)

/** Work with no percent yet: a short scatter of lit pixels running along the track. */
export function sbSweep(width: number, look: SbLook): SbPixel[] {
  const span = 0.3
  const steps = width + 4
  const front = ((look.tick % steps) / (steps - 1)) * (1 + span)
  return band(Math.max(0, width), front - span, Math.min(front, 0.999), look)
}

export function sbRuns(pixels: readonly SbPixel[]): SbRun[] {
  const out: SbRun[] = []
  for (const p of pixels) {
    const last = out[out.length - 1]
    if (last && last.color === p.color) last.text += p.ch
    else out.push({ text: p.ch, color: p.color })
  }
  return out
}

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

/** Pixels as a terminal Raster's cells: little-endian `[codePoint, foreground, background]` per cell. */
export function sbRasterCells(pixels: readonly SbPixel[], background?: string): string {
  const bg = background && /^#[0-9a-fA-F]{6}$/.test(background) ? parseInt(background.slice(1), 16) : 0x01000000
  const words = new Uint32Array(pixels.length * 3)
  pixels.forEach((p, i) => {
    words[i * 3] = p.ch.charCodeAt(0)
    words[i * 3 + 1] = parseInt(p.color.slice(1), 16)
    words[i * 3 + 2] = bg
  })
  return base64(new Uint8Array(words.buffer))
}

// ---- the strip the Sidebar publishes ------------------------------------------

/** One tab in the strip. `id` is the mod's plugin name; `label` the one word the strip shows (`name` without one). */
export type SbTab = { id: string; icon: string; name: string; label?: string; badge: number }

/** The Sidebar's `strip` state: which tabs show, which one is open, and whether the sidebar is up. */
export type SbStrip = { isOn: boolean; active: string; tabs: SbTab[]; theme: string; colour: string; isSettings?: boolean }

export const EMPTY_STRIP: SbStrip = { isOn: false, active: '', tabs: [], theme: 'dark', colour: 'Coral' }

/** Whether `id`'s pane should draw itself as a sidebar tab right now. */
export const isSidebarTab = (strip: SbStrip | undefined, id: string): boolean =>
  !!strip && strip.isOn && strip.active === id && strip.tabs.some(t => t.id === id)

/** Clips `text` to `n` cells with an ellipsis. */
export const sbClip = (text: string, n: number): string => {
  const chars = [...text]
  return chars.length <= n ? text : n <= 1 ? chars.slice(0, n).join('') : `${chars.slice(0, n - 1).join('')}…`
}

export const sbPad = (text: string, n: number): string => {
  const c = sbClip(text, n)
  return c + ' '.repeat(Math.max(0, n - [...c].length))
}

// ---- drawing ------------------------------------------------------------------

type Els = Record<string, any>

/** What a tab's pane draws with: the elements, the colours, its width and the frame clock. */
export type SbKit = {
  els: Els
  pal: SbPalette
  /** Cells across the pane's body. */
  columns: number
  tick: number
  isTerminal: boolean
}

export const sbKit = (els: Els, surface: string, pal: SbPalette, columns: number, tick: number): SbKit => ({
  els,
  pal,
  columns,
  tick,
  isTerminal: surface === 'terminal',
})

/** A meter as one Raster of braille pixels on `bg` in the terminal, coloured text elsewhere. */
export function sbBar(k: SbKit, key: string, pixels: SbPixel[], bg?: string) {
  const { Text } = k.els
  if (pixels.length === 0) return null
  if (k.isTerminal && 'Raster' in k.els) {
    const Raster = k.els.Raster
    return <Raster key={key} columns={pixels.length} rows={1} cells={sbRasterCells(pixels, bg ?? k.pal.panel)} />
  }
  return sbRuns(pixels).map((r, i) => (
    <Text key={`${key}-${i}`} color={r.color}>
      {r.text}
    </Text>
  ))
}

/** The warm look a working meter takes, the green one a finished meter takes. */
export const sbWarm = (k: SbKit, seed = 0): SbLook => ({ stops: [k.pal.warmFrom, k.pal.warmTo], track: k.pal.track, tint: k.pal.tint, tick: k.tick, seed })
export const sbGood = (k: SbKit, seed = 0): SbLook => ({ stops: [k.pal.goodFrom, k.pal.goodTo], track: k.pal.track, tint: k.pal.tint, tick: k.tick, seed })
/** Green below 60%, amber below 80%, red above: for context and limits. */
export const sbLevel = (k: SbKit, pct: number, seed = 0): SbLook => ({
  stops: pct >= 80 ? [k.pal.bad, k.pal.bad] : pct >= 60 ? [k.pal.warn, k.pal.warn] : [k.pal.goodFrom, k.pal.goodTo],
  track: k.pal.track,
  tint: k.pal.tint,
  tick: k.tick,
  seed,
})

/** A rounded card on the panel colour. */
export function sbCard(k: SbKit, key: string, children: unknown, opts: { direction?: 'row' | 'column'; border?: string } = {}) {
  const { Box } = k.els
  const direction = opts.direction ?? 'column'
  return (
    <Box
      key={key}
      flexDirection={direction}
      columnGap={direction === 'row' ? 1 : undefined}
      borderStyle="round"
      borderColor={opts.border ?? k.pal.border}
      backgroundColor={k.pal.panel}
      paddingX={1}
      width="100%"
    >
      {children}
    </Box>
  )
}

/** A row with a left part that clips and a right part that stays whole. */
export function sbSplit(k: SbKit, key: string, left: unknown, right?: unknown) {
  const { Box } = k.els
  return (
    <Box key={key} width="100%">
      <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden">
        {left}
      </Box>
      {right ? (
        <Box flexShrink={0} marginLeft={1}>
          {right}
        </Box>
      ) : null}
    </Box>
  )
}

/** A dim capitals heading with a rule to the edge. */
export function sbSection(k: SbKit, key: string, text: string, width = k.columns) {
  const { Box, Text } = k.els
  const label = text.toUpperCase()
  return (
    <Box key={key} height={1} overflow="hidden" marginTop={1}>
      <Text color={k.pal.dim} bold>
        {label}
      </Text>
      <Text color={k.pal.sep}>{` ${'─'.repeat(Math.max(0, width - [...label].length - 1))}`}</Text>
    </Box>
  )
}

/** A small filled button: `primary` in the accent colour, the rest on the pill colour. */
export function sbButton(k: SbKit, key: string, label: string, onPress: () => void, primary = false) {
  const { Button, Text } = k.els
  return (
    <Button key={key} plain onPress={onPress}>
      <Text backgroundColor={primary ? k.pal.accent : k.pal.pillBg} color={primary ? k.pal.ink : k.pal.pillFg} bold={primary}>
        {` ${label} `}
      </Text>
    </Button>
  )
}

export function sbToggle(k: SbKit, key: string, isOn: boolean, onPress: () => void) {
  const { Button, Text } = k.els
  return (
    <Button key={key} plain onPress={onPress}>
      {isOn ? (
        <Text backgroundColor={k.pal.good} color={k.pal.ink} bold>
          {' ● On  '}
        </Text>
      ) : (
        <Text backgroundColor={k.pal.pillBg} color={k.pal.dim}>
          {' ○ Off '}
        </Text>
      )}
    </Button>
  )
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/** A tab's count as one superscript cell (⁺ above 9), or a blank cell for none. */
export const sbBadge = (n: number): string => (n <= 0 ? ' ' : n > 9 ? '⁺' : SUPERSCRIPT[n]!)

/** The count a tab carries after its word: one superscript cell, or nothing for none. */
const tabBadge = (n: number): string => (n <= 0 ? '' : sbBadge(n))

export type SbStripActions = {
  /** Opens a tab by its id. */
  onTab: (id: string) => void
  /** The ⋯: the sidebar's own settings. */
  onMenu: () => void
  /** The ✕: closes the sidebar. */
  onClose: () => void
}

/** What a tab shows in the strip: its icon and one word. */
export const sbTabText = (t: SbTab): string => `${t.icon} ${t.label ?? t.name}`

/** Cells a tab takes: a space either side of its text and its count. */
const tabCells = (t: SbTab): number => [...sbTabText(t)].length + 2 + tabBadge(t.badge).length

/** The cells across the strip's card, inside its border and padding. */
export const sbStripWidth = (k: SbKit): number => Math.max(8, k.columns - 4)

/**
 * The tabs in rows that fill `width`: as many to a row as fit (each tab's own padding parts them), and on
 * every row the spare cells spread between them, so the strip reaches both edges. `gaps[i]` is
 * the extra space before tab i.
 */
export function sbTabRows(tabs: readonly SbTab[], width: number): { tabs: SbTab[]; gaps: number[] }[] {
  const rows: SbTab[][] = []
  let row: SbTab[] = []
  let used = 0
  for (const t of tabs) {
    const w = tabCells(t)
    if (row.length > 0 && used + w > width) {
      rows.push(row)
      row = []
      used = 0
    }
    used += w
    row.push(t)
  }
  if (row.length > 0) rows.push(row)
  return rows.map(r => {
    const slots = r.length - 1
    const spare = width - r.reduce((n, t) => n + tabCells(t), 0)
    const gaps = r.map((_, i) => {
      if (i === 0) return 0
      if (slots === 0) return 0
      return Math.floor(spare / slots) + (i <= spare % slots ? 1 : 0)
    })
    return { tabs: r, gaps }
  })
}

/** The rows the strip's card takes: its border, the name row and the tab rows. */
export const sbStripRows = (k: SbKit, strip: SbStrip): number => 3 + Math.max(1, sbTabRows(strip.tabs, sbStripWidth(k)).length)

/** The top card: the sidebar's name, ⋯ and ✕, then every tab as its icon and word, the open one filled in the accent colour. */
export function sbStrip(k: SbKit, strip: SbStrip, a: SbStripActions) {
  const { Box, Text, Button } = k.els
  const { pal } = k
  const rows = sbTabRows(strip.tabs, sbStripWidth(k)).map((r, ri) => (
    <Box key={`sb-tabs:${ri}`} height={1} overflow="hidden">
      {r.tabs.map((t, i) => {
        const isOpen = t.id === strip.active
        return [
          r.gaps[i]! > 0 ? <Text key={`sb-gap:${t.id}`}>{' '.repeat(r.gaps[i]!)}</Text> : null,
          <Button key={`sb-tab:${t.id}`} plain onPress={() => a.onTab(t.id)}>
            <Text backgroundColor={isOpen ? pal.accent : undefined} color={isOpen ? pal.ink : pal.dim} bold={isOpen}>
              {` ${sbTabText(t)}`}
            </Text>
            {t.badge > 0 ? (
              <Text backgroundColor={isOpen ? pal.accent : undefined} color={isOpen ? pal.ink : pal.accent}>
                {tabBadge(t.badge)}
              </Text>
            ) : null}
            <Text backgroundColor={isOpen ? pal.accent : undefined}> </Text>
          </Button>,
        ]
      })}
    </Box>
  ))
  return sbCard(k, 'sb-strip', [
    sbSplit(
      k,
      'sb-head',
      <Text color={pal.accent} bold>
        ◆ DOOLE'S SIDEBAR
      </Text>,
      <Box>
        <Button key="sb-menu" plain onPress={a.onMenu}>
          <Text color={strip.active === 'sidebar' ? pal.accent : pal.dim}>⋯</Text>
        </Button>
        <Text>{'  '}</Text>
        <Button key="sb-close" plain onPress={a.onClose}>
          <Text color={pal.dim}>✕</Text>
        </Button>
      </Box>,
    ),
    ...(rows.length > 0 ? rows : [<Box key="sb-tabs:0" height={1} />]),
  ])
}

// ---- outlined bars ----------------------------------------------------------------

/** A run of text in a frame's edge; one with `onPress` is a button. */
export type SbSeg = { text: string; color: string; bold?: boolean; onPress?: () => void; key?: string }

const segCells = (segs: readonly SbSeg[]): number => segs.reduce((n, s) => n + [...s.text].length, 0)

/** `segs` cut to `room` cells, the one that overflows ending in an ellipsis. */
function clipSegs(segs: readonly SbSeg[], room: number): SbSeg[] {
  const out: SbSeg[] = []
  let left = room
  for (const s of segs) {
    if (left <= 0) break
    const n = [...s.text].length
    out.push(n <= left ? s : { ...s, text: sbClip(s.text, left) })
    left -= Math.min(n, left)
  }
  return out
}

function drawSegs(k: SbKit, key: string, segs: readonly SbSeg[]) {
  const { Text, Button } = k.els
  return segs.map((s, i) => {
    const text = (
      <Text key={`${key}:${i}`} color={s.color} bold={s.bold}>
        {s.text}
      </Text>
    )
    return s.onPress ? (
      <Button key={s.key ?? `${key}:b${i}`} plain onPress={s.onPress}>
        {text}
      </Button>
    ) : (
      text
    )
  })
}

/** One edge of a frame `width` cells across: a corner, ` left `, a rule to fill, ` right `, a corner. */
function frameEdge(k: SbKit, key: string, width: number, corners: [string, string], left: readonly SbSeg[], right: readonly SbSeg[], color: string) {
  const { Box, Text } = k.els
  const inner = Math.max(0, width - 2)
  // The left label keeps at least two fifths of the edge; the right one is cut to what is left.
  const keep = left.length > 0 ? Math.min(segCells(left) + 2, Math.floor(inner * 0.4)) : 0
  const r = right.length > 0 ? clipSegs(right, Math.max(0, inner - keep - 3)) : []
  const rightCells = r.length > 0 ? segCells(r) + 2 : 0
  const room = Math.max(0, inner - rightCells - 3)
  const l = left.length > 0 && room > 0 ? clipSegs(left, room) : []
  const leftCells = l.length > 0 ? segCells(l) + 2 : 0
  const rule = Math.max(0, inner - leftCells - rightCells)
  return (
    <Box key={key} height={1} overflow="hidden">
      <Text color={color}>{corners[0]}</Text>
      {l.length > 0 ? <Text color={color}> </Text> : null}
      {drawSegs(k, `${key}-l`, l)}
      {l.length > 0 ? <Text color={color}> </Text> : null}
      <Text color={color}>{'─'.repeat(rule)}</Text>
      {r.length > 0 ? <Text color={color}> </Text> : null}
      {drawSegs(k, `${key}-r`, r)}
      {r.length > 0 ? <Text color={color}> </Text> : null}
      <Text color={color}>{corners[1]}</Text>
    </Box>
  )
}

export type SbFramed = {
  /** Cells across, the outline included. */
  width: number
  /** The bar's pixels for the cells inside the outline (`width - 2`). */
  bar: (cells: number) => SbPixel[]
  top?: SbSeg[]
  topRight?: SbSeg[]
  bottom?: SbSeg[]
  bottomRight?: SbSeg[]
  /** The outline's colour; the dim text colour by default, so the bar's edge shows. */
  color?: string
}

/** A bar inside a rounded outline, three rows tall, with labels set into the top and bottom edges. */
export function sbFramedBar(k: SbKit, key: string, f: SbFramed) {
  const { Box, Text } = k.els
  const color = f.color ?? k.pal.dim
  const cells = Math.max(1, f.width - 2)
  return (
    <Box key={key} flexDirection="column" width={f.width} flexShrink={0} backgroundColor={k.pal.panel}>
      {frameEdge(k, `${key}-top`, f.width, ['╭', '╮'], f.top ?? [], f.topRight ?? [], color)}
      <Box key={`${key}-mid`} height={1} overflow="hidden">
        <Text color={color}>│</Text>
        {sbBar(k, `${key}-bar`, f.bar(cells))}
        <Text color={color}>│</Text>
      </Box>
      {frameEdge(k, `${key}-bot`, f.width, ['╰', '╯'], f.bottom ?? [], f.bottomRight ?? [], color)}
    </Box>
  )
}

/** A one-row bar with thin outline caps either side (`▕bar▏`), for bars that sit in a line of text. */
export function sbCappedBar(k: SbKit, key: string, pixels: SbPixel[], bg?: string) {
  const { Text } = k.els
  return [
    <Text key={`${key}-l`} color={k.pal.dim}>
      ▕
    </Text>,
    sbBar(k, key, pixels, bg),
    <Text key={`${key}-r`} color={k.pal.dim}>
      ▏
    </Text>,
  ]
}

/** A tab's title row: its icon and NAME in the accent colour, a dim status, and ⚙ Settings or ‹ Back on the right. */
export function sbTitle(
  k: SbKit,
  t: { icon: string; name: string; status?: string },
  right?: { label: 'Settings' | 'Back'; onPress: () => void },
) {
  const { Text, Button } = k.els
  const { pal } = k
  return sbSplit(
    k,
    'sb-title',
    <Text wrap="truncate-end">
      <Text color={pal.accent} bold>
        {`${t.icon} ${t.name.toUpperCase()}`}
      </Text>
      <Text color={pal.dim}>{t.status ? ` · ${t.status}` : ''}</Text>
    </Text>,
    right ? (
      <Button key={right.label === 'Settings' ? 'sb-settings' : 'sb-back'} plain onPress={right.onPress}>
        <Text color={pal.accent}>{right.label === 'Settings' ? '⚙ ' : '‹ '}</Text>
        <Text color={pal.text}>{right.label}</Text>
      </Button>
    ) : undefined,
  )
}

/** One of a mod's options, as `$.config.list()` reports it. */
export type SbSetting = {
  key: string
  label: string
  description: string
  kind: 'boolean' | 'choice' | 'text' | 'number'
  value: string | number | boolean
  options: string[]
  isLocked: boolean
}

/** The option after `value`, round to the first. */
export function sbNextOption(options: readonly string[], value: unknown): string | undefined {
  if (options.length === 0) return undefined
  const at = options.indexOf(String(value))
  return options[(at + 1) % options.length]
}

/** A settings row: the label, a dim line about it, and its control on the right. */
export function sbSettingRow(k: SbKit, s: SbSetting, onSet: (value: string | number | boolean) => void) {
  const { Box, Text, Button, Input } = k.els
  const { pal } = k
  const control = s.isLocked ? (
    <Text color={pal.dim}>{`${String(s.value)} (locked)`}</Text>
  ) : s.kind === 'boolean' ? (
    sbToggle(k, `sb-set:${s.key}`, s.value === true, () => onSet(s.value !== true))
  ) : s.kind === 'choice' && s.options.length > 0 ? (
    <Button key={`sb-set:${s.key}`} plain onPress={() => onSet(sbNextOption(s.options, s.value) ?? '')}>
      <Text backgroundColor={pal.pillBg} color={pal.pillFg}>{` ${String(s.value)} ▸ `}</Text>
    </Button>
  ) : (
    <Box width={18}>
      {Input ? (
        <Input key={`sb-set:${s.key}`} value={String(s.value)} onSubmit={(v: string) => onSet(s.kind === 'number' ? Number(v) || 0 : v.trim())} />
      ) : (
        <Text color={pal.text}>{String(s.value)}</Text>
      )}
    </Box>
  )
  return sbSplit(
    k,
    `sb-row:${s.key}`,
    <Text wrap="truncate-end">
      <Text color={pal.text}>{sbPad(s.label, 17)}</Text>
      <Text color={pal.dim}>{` ${s.description}`}</Text>
    </Text>,
    control,
  )
}

/** The whole tab: the strip on top, then the tab's own rows. */
export function sbFrame(k: SbKit, strip: SbStrip, a: SbStripActions, body: unknown[]) {
  const { Box } = k.els
  return (
    <Box flexDirection="column" width="100%">
      {sbStrip(k, strip, a)}
      {body}
    </Box>
  )
}

/** The strip's actions as every mod wires them: each asks the Sidebar for what was pressed (see `sbAsker`). */
export const sbActions = (ask: (args: string) => void): SbStripActions => ({
  onTab: id => ask(`tab ${id}`),
  onMenu: () => ask('tab sidebar'),
  onClose: () => ask('close'),
})

/**
 * What a mod's strip presses call. `send` is the mod's own write of its `sidebarAsk` state (`{ args, n }`, `n`
 * counting up so a repeat is a new value): no command, nothing queued behind a running turn. A press that leaves
 * the mod's own tab closes its pane first: the Sidebar's answer runs beneath this press, so this mod's strip
 * hook may be skipped as already in the chain.
 */
export const sbAsker =
  (send: (args: string) => Promise<unknown>, plugin: string, closeOwnPane: () => Promise<unknown>) =>
  (args: string): void =>
    void (async () => {
      if (args !== `tab ${plugin}`) await closeOwnPane().catch(() => {})
      await send(args)
    })().catch(() => {})

/**
 * What a pane mod does when the Sidebar's strip changes: `open` when its tab turns up, `close` when its tab
 * was showing and now is not. A mod opened by its own command with the sidebar off is never closed by this.
 */
export function sbPaneMove(id: string, strip: unknown, previous: unknown): 'open' | 'close' | undefined {
  const shows = (s: unknown) => {
    const v = s as Partial<SbStrip> | null | undefined
    return !!v && v.isOn === true && v.active === id && v.isSettings !== true
  }
  const isNow = shows(strip)
  const was = shows(previous)
  return isNow && !was ? 'open' : was && !isNow ? 'close' : undefined
}

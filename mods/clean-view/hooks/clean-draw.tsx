import type { CvTask } from '../types'
import { summary } from './clean-logic'
import { sbBar, sbGood, sbKit, sbMeter, sbMix, sbSweep, sbWarm, type SbKit, type SbLook, type SbPalette } from './sidebar-kit'

type Els = Record<string, any>

/** Task View's terminal meters: pixels in the accent colour (the Colour setting), scattered more than the kit's. */
const accentLook = (k: SbKit, seed = 0): SbLook => ({
  ...sbWarm(k, seed),
  stops: [sbMix(k.pal.track, k.pal.accent, 0.55), k.pal.accent],
  jitter: 0.8,
})

/** Bar sizes: SVG bars in pixels (desktop), pixel bars in cells (terminal). */
export const MAIN_PX = 360
export const ITEM_PX = 160
export const MAIN_CELLS = 36
export const ITEM_CELLS = 16

/** The marker in front of a to-do: done, in progress and still to do. */
export const markerOf = (status: CvTask['status']): string => (status === 'done' ? '✓' : status === 'active' ? '▶' : '○')

// A steady pseudo-random 0..1 per pixel, so a bar looks the same each time it is drawn.
function grain(i: number, seed: number): number {
  let h = (i * 374761393 + seed * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

/**
 * A pixel progress bar as SVG, drawn like the terminal's meter: a dark rounded track of small dots,
 * `fraction` of them lit in `to`'s colour. Which dots are lit, and how bright, is picked at random
 * again each frame (`tick`), so they flicker the way the terminal's do: sparse and dim at the tail,
 * fuller and brighter toward the front, where the last column is bright and glows. The empty track
 * keeps a faint scatter that shifts too. With no percent yet, a lit patch runs along the track.
 */
export function barSvg(width: number, fraction: number, from: string, to: string, track: string, isSweep = false, tint = '#FFFFFF', tick = 0): string {
  const tall = 9
  const pitch = 3
  const rows = 3
  const cols = Math.max(1, Math.floor(width / pitch))
  const t = Math.floor(tick / 2)
  const lit = Math.max(0, Math.min(1, fraction))
  // The lit span: [start, end) in columns. A sweep is a patch 30% wide moving along with the frames.
  const span = Math.max(4, Math.round(cols * 0.3))
  const sweepEnd = (t % (cols + span)) + 1
  const start = isSweep ? sweepEnd - span : 0
  const end = isSweep ? sweepEnd : Math.round(cols * lit)
  const dots: string[] = []
  const dot = (c: number, r: number, color: string, o: number, glow = false) =>
    dots.push(`<rect x="${c * pitch + 0.5}" y="${r * pitch + 0.5}" width="2" height="2" rx="0.4" fill="${color}" opacity="${o.toFixed(2)}"${glow ? ' filter="url(#glow)"' : ''}/>`)
  for (let c = 0; c < cols; c++) {
    const isLit = c >= start && c < end
    const isHead = isLit && c === end - 1 && (isSweep || lit < 1)
    const b = end - start <= 1 ? 1 : (c - start) / (end - start - 1)
    for (let r = 0; r < rows; r++) {
      const i = c * rows + r
      if (isHead) {
        dot(c, r, tint, 0.75 + 0.25 * grain(i, t + 3), true)
      } else if (isLit && c >= end - 5) {
        // The few columns behind the front: dense and bright, some glowing.
        if (grain(i, t * 7 + 11) > 0.92) continue
        const near = (c - (end - 5)) / 4
        const hot = grain(i, t * 13 + 5) > 0.55 - 0.3 * near
        dot(c, r, hot ? tint : to, 0.7 + 0.3 * grain(i, t + 19), hot && near > 0.4)
      } else if (isLit) {
        // Fuller toward the front, and a fresh draw each frame.
        if (grain(i, t * 7 + 11) > 0.3 + 0.65 * b) continue
        const o = 0.2 + 0.75 * b * (0.35 + 0.65 * grain(i, t * 13 + 5))
        dot(c, r, grain(i, t + 17) > 0.85 ? from : to, o)
      } else if (grain(i, Math.floor(t / 2) * 3 + 23) > 0.84) {
        dot(c, r, tint, 0.05 + 0.12 * grain(i, t + 29))
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${tall}" viewBox="0 0 ${width} ${tall}">` +
    `<desc>${isSweep ? 0 : end} of ${cols} lit</desc>` +
    `<defs><filter id="glow" x="-2" y="-2" width="5" height="5"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<clipPath id="c"><rect width="${width}" height="${tall}" rx="${tall / 2}"/></clipPath></defs>` +
    `<rect width="${width}" height="${tall}" rx="${tall / 2}" fill="${track}"/><g clip-path="url(#c)">${dots.join('')}</g></svg>`
  )
}


export type TodoDraw = {
  pal: SbPalette
  /** The row is the latest list and a turn is running: in-progress bars move. */
  isLive: boolean
  /** The frame clock. */
  tick: number
  /** Cells across the terminal; the bars take what fits. */
  columns?: number
}

/** The header: "To-do" and how far along, or "All done" when every item is. */
function header(els: Els, pal: SbPalette, tasks: readonly CvTask[]) {
  const { Box, Text } = els
  const s = summary(tasks)
  return (
    <Box key="head" justifyContent="space-between" columnGap={2}>
      <Text color={pal.text} bold>
        {'To-do'}
      </Text>
      {s.isAllDone ? (
        <Text color={pal.good}>{`All done · ${s.total} of ${s.total}`}</Text>
      ) : (
        <Text color={pal.dim}>{`${s.done} of ${s.total} done · ${s.percent}%`}</Text>
      )}
    </Box>
  )
}

const nameColor = (pal: SbPalette, t: CvTask) => (t.status === 'done' ? pal.dim : t.status === 'active' ? pal.text : pal.faint)
const markColor = (pal: SbPalette, t: CvTask) => (t.status === 'done' ? pal.good : t.status === 'active' ? pal.accent : pal.faint)

/** A to-do list in the terminal: header, a main pixel bar, then a line and a bar for each item. */
export function drawTodoTerminal(els: Els, d: TodoDraw, tasks: readonly CvTask[]) {
  const { Box, Text } = els
  const { pal } = d
  const k = sbKit(els, 'terminal', pal, d.columns ?? 80, d.isLive ? d.tick : 0)
  const still = sbKit(els, 'terminal', pal, d.columns ?? 80, 0)
  const s = summary(tasks)
  const room = Math.max(8, (d.columns ?? 80) - 2)
  const main = Math.min(MAIN_CELLS, room)
  const item = Math.max(6, Math.min(ITEM_CELLS, Math.floor(room / 3)))
  const rows = tasks.map((t, i) => {
    const look = t.status === 'done' ? sbGood(still, i + 1) : t.status === 'active' ? accentLook(k, i + 1) : accentLook(still, i + 1)
    const pixels =
      t.status === 'active'
        ? d.isLive
          ? sbSweep(item, look)
          : sbMeter(item, 0.5, look)
        : sbMeter(item, t.status === 'done' ? 1 : 0, look)
    return (
      <Box key={t.id} height={1} columnGap={1}>
        <Text color={markColor(pal, t)}>{markerOf(t.status)}</Text>
        <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden">
          <Text wrap="truncate-end" color={nameColor(pal, t)} bold={t.status === 'active'}>
            {t.name}
          </Text>
        </Box>
        <Box flexShrink={0}>{sbBar(k, `${t.id}-bar`, pixels)}</Box>
      </Box>
    )
  })
  return (
    <Box key="todo" flexDirection="column" flexShrink={0}>
      {header(els, pal, tasks)}
      <Box key="main-bar" height={1}>
        {sbBar(k, 'main-bar', sbMeter(main, s.done / Math.max(1, s.total), s.isAllDone ? sbGood(still) : accentLook(k)))}
      </Box>
      {rows}
    </Box>
  )
}

/** A to-do list in the desktop app: a rounded card with SVG pixel bars, each drawn at its real width. */
export function drawTodoDesktop(els: Els, d: TodoDraw, tasks: readonly CvTask[]) {
  const { Box, Text, Svg } = els
  const { pal } = d
  const s = summary(tasks)
  const tick = d.isLive ? d.tick : 0
  const warm = { from: sbMix(pal.track, pal.accent, 0.55), to: pal.accent }
  const good = { from: sbMix(pal.track, pal.good, 0.55), to: pal.good }
  const svg = (key: string, width: number, fraction: number, c: { from: string; to: string }, isSweep: boolean, t: number, alt: string) => (
    <Svg key={key} source={barSvg(width, fraction, c.from, c.to, pal.track, isSweep, pal.tint, t)} alt={alt} width={width} height={9} />
  )
  const rows = tasks.map(t => {
    const bar =
      t.status === 'done'
        ? svg(`${t.id}-bar`, ITEM_PX, 1, good, false, 0, `${t.name}: done`)
        : t.status === 'active'
          ? d.isLive
            ? svg(`${t.id}-bar`, ITEM_PX, 0, warm, true, tick, `${t.name}: in progress`)
            : svg(`${t.id}-bar`, ITEM_PX, 0.5, warm, false, 0, `${t.name}: in progress`)
          : svg(`${t.id}-bar`, ITEM_PX, 0, warm, false, 0, `${t.name}: not started`)
    return (
      <Box key={t.id} alignItems="center" columnGap={1}>
        <Text color={markColor(pal, t)}>{markerOf(t.status)}</Text>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text color={nameColor(pal, t)} bold={t.status === 'active'}>
            {t.name}
          </Text>
        </Box>
        <Box flexShrink={0}>{bar}</Box>
      </Box>
    )
  })
  return (
    <Box key="todo" flexDirection="column" flexShrink={0} borderStyle="round" borderColor={pal.sep} paddingX={1} gap={1}>
      {header(els, pal, tasks)}
      <Box key="main-bar" flexShrink={0}>
        {svg('main-bar', MAIN_PX, s.done / Math.max(1, s.total), s.isAllDone ? good : warm, false, s.isAllDone ? 0 : tick, `${s.done} of ${s.total} done, ${s.percent}%`)}
      </Box>
      <Box flexDirection="column">{rows}</Box>
    </Box>
  )
}

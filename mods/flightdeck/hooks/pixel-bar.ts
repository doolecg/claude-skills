// Task View's pixel bar as an SVG (copied from clean-view's clean-draw.tsx), for the desktop app's agent cards.

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

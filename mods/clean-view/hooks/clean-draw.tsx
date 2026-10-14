import type { CvAsk, CvChecklist } from '../types'
import { OTHER_HINT, rowLabel } from './clean-logic'
import type { SbPalette, SbSeg } from './sidebar-kit'

type Els = Record<string, any>

/** The marker in front of a step: done, current (or paused) and still to do. */
export function stepMarker(status: string, isPaused: boolean): string {
  return status === 'done' ? '✓' : status === 'active' ? (isPaused ? '‖' : '▶') : '○'
}

function segTexts(Text: any, list: readonly SbSeg[], prefix: string) {
  return list.map((s, i) => (
    <Text key={`${prefix}${i}`} color={s.color} bold={s.bold}>
      {s.text}
    </Text>
  ))
}

/** The right-hand bits of a header: plain text, or a quiet button when it has a press. */
function rightBits(els: Els, list: readonly SbSeg[]) {
  const { Text, Button } = els
  return list.map((s, i) =>
    s.onPress ? (
      <Button key={s.key ?? `r${i}`} plain dimColor onPress={s.onPress}>
        {s.text}
      </Button>
    ) : (
      <Text key={s.key ?? `r${i}`} color={s.color}>
        {s.text}
      </Text>
    ),
  )
}

// ---- Steps only: one calm line per step, on any surface ------------------------------

/** The smaller checklist: a header line and one line per step, no outlined bars. */
export function drawCompact(
  els: Els,
  pal: SbPalette,
  cl: CvChecklist,
  o: { header: SbSeg[]; right: SbSeg[]; outline: string; isPaused: boolean; summary: string; width: number; isDesktop: boolean },
) {
  const { Box, Text } = els
  const d = o.isDesktop
  const steps = cl.tasks.map((t, i) => {
    const isDone = t.status === 'done'
    const isActive = t.status === 'active'
    const label = rowLabel(cl.tasks, i)
    return (
      <Box key={t.id} height={d ? undefined : 1} overflow={d ? undefined : 'hidden'}>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">
            <Text color={isDone ? pal.good : isActive ? (o.isPaused ? pal.warn : pal.accent) : pal.faint}>{`${stepMarker(t.status, o.isPaused)} `}</Text>
            <Text color={isDone ? pal.dim : isActive ? pal.text : pal.faint} bold={isActive}>
              {t.name}
            </Text>
          </Text>
        </Box>
        {label ? (
          <Box flexShrink={0} marginLeft={1}>
            <Text color={isActive ? pal.accent : pal.dim}>{label}</Text>
          </Box>
        ) : null}
      </Box>
    )
  })
  const right = rightBits(els, o.right)
  return (
    <Box
      key="checklist"
      flexDirection="column"
      width={d ? '100%' : o.width}
      flexShrink={0}
      {...(d ? { borderStyle: 'round', borderColor: o.outline, paddingX: 1 } : {})}
    >
      <Box height={d ? undefined : 1}>
        <Box flexGrow={1} flexShrink={1} height={d ? undefined : 1} overflow={d ? undefined : 'hidden'}>
          <Text wrap="truncate-end">{segTexts(Text, o.header, 'h')}</Text>
        </Box>
        {o.summary ? (
          <Box flexShrink={0} marginLeft={1}>
            <Text color={pal.dim}>{o.summary}</Text>
          </Box>
        ) : null}
        {right.length > 0 ? (
          <Box flexShrink={0} marginLeft={1} columnGap={1}>
            {right}
          </Box>
        ) : null}
      </Box>
      {steps}
    </Box>
  )
}

// ---- the Claude desktop app: native boxes, buttons and SVG meters --------------------

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
  const h = 9
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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" preserveAspectRatio="none">` +
    `<desc>${isSweep ? 0 : end} of ${cols} lit</desc>` +
    `<defs><filter id="glow" x="-2" y="-2" width="5" height="5"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<clipPath id="c"><rect width="${width}" height="${h}" rx="${h / 2}"/></clipPath></defs>` +
    `<rect width="${width}" height="${h}" rx="${h / 2}" fill="${track}"/><g clip-path="url(#c)">${dots.join('')}</g></svg>`
  )
}

export type DesktopBar = { fraction: number; from: string; to: string; tint?: string; isSweep?: boolean; tick?: number }

/** The full checklist drawn for the desktop app. */
export function drawDesktop(
  els: Els,
  pal: SbPalette,
  cl: CvChecklist,
  o: {
    header: SbSeg[]
    right: SbSeg[]
    outline: string
    isPaused: boolean
    stepsText: string
    percentText: string
    isDone: boolean
    bar: DesktopBar | null
    stepBar: (i: number) => DesktopBar
  },
) {
  const { Box, Text, Svg } = els
  // `fit`: drawn `width` wide at most and narrowed to the room it is given, so it fills it.
  const meter = (key: string, b: DesktopBar, width: number, label: string, fit = false) => (
    <Svg
      key={key}
      source={barSvg(width, b.fraction, b.from, b.to, pal.track, b.isSweep, b.tint, b.tick)}
      alt={label}
      width={fit ? undefined : width}
      height={9}
    />
  )
  const steps = cl.tasks.map((t, i) => {
    const isDone = t.status === 'done'
    const isActive = t.status === 'active'
    const label = rowLabel(cl.tasks, i)
    return (
      <Box key={t.id} alignItems="center" columnGap={1}>
        <Text color={isDone ? pal.good : isActive ? (o.isPaused ? pal.warn : pal.accent) : pal.faint}>{stepMarker(t.status, o.isPaused)}</Text>
        <Box flexGrow={1} flexShrink={1}>
          <Text color={isDone ? pal.dim : isActive ? pal.text : pal.faint} bold={isActive}>
            {t.name}
          </Text>
        </Box>
        {meter(`${t.id}-bar`, o.stepBar(i), 220, `${t.name}: ${label || 'not started'}`)}
        <Box width={6} justifyContent="flex-end">
          <Text color={isActive ? pal.accent : pal.dim} bold={isActive && t.hasReported}>
            {label}
          </Text>
        </Box>
      </Box>
    )
  })
  return (
    <Box key="checklist" flexDirection="column" width="100%" flexShrink={0} borderStyle="round" borderColor={o.outline} paddingX={1} gap={1}>
      <Box justifyContent="space-between" alignItems="center">
        <Text>{segTexts(Text, o.header, 'h')}</Text>
        <Box columnGap={1}>{rightBits(els, o.right)}</Box>
      </Box>
      {o.bar ? (
        <Box alignItems="center" columnGap={1}>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>{meter('job-bar', o.bar, 600, `${o.stepsText}, ${o.percentText}`, true)}</Box>
          <Text color={pal.dim}>{o.stepsText}</Text>
          <Text color={o.isDone ? pal.good : pal.accent} bold>
            {o.percentText}
          </Text>
        </Box>
      ) : null}
      <Box flexDirection="column">{steps}</Box>
    </Box>
  )
}

/** The questions for the desktop app: a rounded card, native buttons for the options, an Other field. */
export function drawDesktopAsk(
  els: Els,
  pal: SbPalette,
  ask: CvAsk,
  acts: {
    title: string
    onSkip: () => void
    onClose: () => void
    onTab: (i: number) => void
    onOption: (label: string) => void
    onOther: (value: string) => void
    onDone: () => void
  },
) {
  const { Box, Text, Button, Input } = els
  const q = ask.questions[ask.current]!
  const ticked = ask.picks[ask.current] ?? []
  const given = ask.answers[ask.current]
  return (
    <Box flexDirection="column" width="100%" flexShrink={0} borderStyle="round" borderColor={pal.warn} paddingX={1} gap={1}>
      <Box justifyContent="space-between" alignItems="center">
        <Text>
          <Text color={pal.warn} bold>
            ‖ Needs you
          </Text>
          <Text color={pal.dim}>{acts.title}</Text>
        </Text>
        <Box columnGap={2}>
          <Button key="skip" plain dimColor onPress={acts.onSkip}>
            Skip
          </Button>
          <Button key="close" plain dimColor onPress={acts.onClose}>
            ✕
          </Button>
        </Box>
      </Box>
      {ask.questions.length > 1 ? (
        <Box columnGap={2}>
          {ask.questions.map((t, i) => {
            const isNow = i === ask.current
            const isDone = ask.answers[i] !== null
            return (
              <Button key={`q${i}`} plain onPress={() => acts.onTab(i)}>
                <Text color={isDone ? pal.good : isNow ? pal.text : pal.dim} bold={isNow}>
                  {`${isDone ? '✓' : isNow ? '▶' : '○'} ${t.header}`}
                </Text>
              </Button>
            )
          })}
        </Box>
      ) : null}
      <Text color={pal.text} bold>
        {q.question}
      </Text>
      <Box flexDirection="column">
        {q.options.map((o, i) => {
          const isOn = q.multiSelect ? ticked.includes(o.label) : given === o.label
          const mark = q.multiSelect ? (isOn ? '◼' : '◻') : isOn ? '●' : '○'
          return (
            <Box key={`ow${i}`} flexDirection="column">
              <Button key={`o${i}`} plain hotkey={String(i + 1)} onPress={() => acts.onOption(o.label)}>
                <Text color={pal.faint}>{`${i + 1} `}</Text>
                <Text color={isOn ? pal.good : pal.accent}>{`${mark} `}</Text>
                <Text color={isOn ? pal.good : pal.text} bold>
                  {o.label}
                </Text>
              </Button>
              {o.description !== '' && o.description !== o.label ? <Text color={pal.dim}>{o.description}</Text> : null}
            </Box>
          )
        })}
      </Box>
      {Input ? <Input key="other" placeholder={OTHER_HINT} submitLabel="answer" onSubmit={(value: string) => acts.onOther(value)} /> : null}
      {q.multiSelect ? (
        <Box>
          <Button key="done" plain hotkey="d" onPress={acts.onDone}>
            <Text color={ticked.length > 0 ? pal.good : pal.faint} bold>
              d: Done
            </Text>
          </Button>
        </Box>
      ) : null}
    </Box>
  )
}

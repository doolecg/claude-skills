import type { Elements } from 'claude-code'

import type { BarFigures, BarMod, BarMode, BarTodo, BarTool } from '../types'
import { EFFORTS, clip, modelChoiceLabel, toolLabel, usedLabel } from './bar-logic'
import type { Palette, Segment } from './bar-logic'
import { barSvg, mixHex } from './pixel-bar'
import { currentAlias, effortName, modLines, quickLaunch } from './toolbox-logic'

/** The elements the app draws with; the phone's table is the same less Input, Select and Client. */
export type AppEls = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Svg'>

const level = (pct: number, pal: Palette): string => (pct >= 80 ? pal.bad : pct >= 60 ? pal.warn : pal.good)

// A steady pseudo-random 0..1 per dot, so the meter looks the same each time it is drawn.
function grain(i: number, seed: number): number {
  let h = (i * 374761393 + seed * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

/**
 * A pixel meter, Task View's look: small dots on a dark rounded track, `pct` of them lit in the level's
 * colour, scattered and fading in from the tail, the front dots bright and pulsing, some twinkling.
 */
function meter(els: AppEls, pal: Palette, pct: number, width: number, key: string, alt: string): JSX.Element {
  return pixelBar(els, pal, pct, level(pct, pal), width, key, alt)
}

/** A pixel bar `pct` full in `color`. */
function pixelBar(els: AppEls, pal: Palette, pct: number, color: string, width: number, key: string, alt: string): JSX.Element {
  const { Svg } = els
  const tall = 9
  const pitch = 3
  const rows = 3
  const cols = Math.max(1, Math.floor(width / pitch))
  const lit = Math.min(Math.max(pct, 0), 100) / 100
  const front = Math.round(cols * lit)
  const dots: string[] = []
  const rect = (c: number, r: number, fill: string, o: number, anim = '', glow = false) =>
    dots.push(
      `<rect x="${c * pitch + 0.5}" y="${r * pitch + 0.5}" width="2" height="2" rx="0.4" fill="${fill}" opacity="${o.toFixed(2)}"${glow ? ' filter="url(#glow)"' : ''}>${anim}</rect>`,
    )
  const blink = (o: number, hi: number, n: number) =>
    `<animate attributeName="opacity" values="${o.toFixed(2)};${hi.toFixed(2)};${o.toFixed(2)}" dur="${(1.6 + n * 2).toFixed(1)}s" begin="${(n * 2).toFixed(1)}s" repeatCount="indefinite"/>`
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const i = c * rows + r
      const n = grain(i, 7)
      if (c < front) {
        if (lit < 1 && c >= front - 1) {
          rect(c, r, pal.text, 0.95, blink(0.95, 0.55, grain(i, 37)), true)
          continue
        }
        const b = front <= 1 ? 1 : c / (front - 1)
        if (n < 0.35 * (1 - b)) continue
        const o = 0.2 + 0.7 * b * b * (0.45 + 0.55 * grain(i, 13))
        rect(c, r, color, o, grain(i, 19) > 0.65 ? blink(o, Math.min(1, o + 0.45), n) : '')
      } else if (n > 0.8) {
        const o = 0.06 + 0.08 * grain(i, 23)
        rect(c, r, pal.text, o, blink(o, o + 0.18, grain(i, 41)))
      }
    }
  }
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${tall}" viewBox="0 0 ${width} ${tall}">` +
    `<defs><filter id="glow" x="-2" y="-2" width="5" height="5"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<clipPath id="c"><rect width="${width}" height="${tall}" rx="${tall / 2}"/></clipPath></defs>` +
    `<rect width="${width}" height="${tall}" rx="${tall / 2}" fill="${pal.sep}" fill-opacity="0.45"/><g clip-path="url(#c)">${dots.join('')}</g></svg>`
  return <Svg key={key} source={source} alt={alt} width={width} height={tall} isInteractive />
}

/** About how many CSS pixels a column of the band is, to size the bar from `bodyColumns`. */
const COLUMN_PX = 7.2
/** Room kept for "To-do" before the bar and the counts after it. */
const TODO_LABELS_PX = 160

/**
 * Task View's to-do list as one line: "To-do", the main pixel bar on Task View's frame clock (`tick`), and
 * the step counts at its end. Claude's chat already lists the steps, so they are not repeated here. Green
 * and still once every step is done.
 */
export function todoCard(els: AppEls, pal: Palette, todo: BarTodo, tick: number, columns = 0): JSX.Element {
  const { Box, Text, Svg } = els
  const total = todo.items.length
  const done = todo.items.filter(t => t.status === 'done').length
  const isAllDone = total > 0 && done === total
  const track = mixHex(pal.panel, pal.sep, 0.5)
  const c = isAllDone ? { from: mixHex(track, pal.good, 0.55), to: pal.good } : { from: mixHex(track, pal.accent, 0.55), to: pal.accent }
  const width = columns > 0 ? Math.max(120, Math.round(columns * COLUMN_PX) - TODO_LABELS_PX) : 360
  const alt = isAllDone ? `All ${total} steps done` : `${done} of ${total} steps done`
  return (
    <Box key="todo" flexDirection="row" alignItems="center" columnGap={1} width="100%">
      <Text color={pal.dim}>{'To-do'}</Text>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Svg key="todo-main-bar" source={barSvg(width, isAllDone ? 1 : done / Math.max(1, total), c.from, c.to, track, false, pal.text, isAllDone ? 0 : tick, !isAllDone)} alt={alt} width={width} height={9} />
      </Box>
      <Text color={isAllDone ? pal.good : pal.text}>{isAllDone ? `All done · ${total} of ${total}` : `${done} of ${total}`}</Text>
    </Box>
  )
}

export type DesktopBarArgs = {
  els: AppEls
  pal: Palette
  title: string
  figures: BarFigures
  /** Other mods' published segments (Enhance Prompt), drawn first as buttons. */
  published: Segment[]
  runCommand: (command: string) => void
  openToolbox: () => void
  /** Task View's list, drawn above the bar while it is open. */
  todo?: BarTodo
  /** Task View's frame clock, so the list's pixels flicker with it. */
  todoTick?: number
  /** The band's width in columns, so the list's bar spans it. */
  columns?: number
}

/**
 * The bar above the prompt in the app (its slot below the prompt holds about two items): other mods'
 * buttons, the context meter, usage and agents, with the toolbox button at the right end.
 */
export function desktopBar(a: DesktopBarArgs): JSX.Element {
  const { Box, Text, Button } = a.els
  const { pal, figures: f } = a
  const pct = f.ctx ?? 0
  const used = usedLabel(f.tokens, f.window)
  const figure = (key: string, name: string, value: string, color: string) => (
    <Box key={key} flexDirection="row" alignItems="center" gap={1}>
      <Text color={pal.dim}>{name}</Text>
      <Text color={color}>{value}</Text>
    </Box>
  )
  const bar = (
    <Box key="bottom-bar" flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={2} width="100%">
      <Box key="bottom-bar-segments" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2} rowGap={1}>
        {a.published.map(seg => {
          const [name, ...rest] = seg.parts
          const detail = rest.length > 0 ? rest[rest.length - 1]! : undefined
          return (
            <Box key={`${seg.key}:row`} flexDirection="row" alignItems="center" gap={1}>
              <Button key={seg.key} label={name?.text ?? ''} variant="primary" onPress={() => a.runCommand(seg.command!)} />
              {detail ? <Text color={name?.color === pal.text ? pal.dim : name?.color}>{detail.text}</Text> : null}
              {(seg.actions ?? []).map(act => (
                <Button key={act.key} label={act.label} variant="secondary" onPress={() => a.runCommand(act.command)} />
              ))}
            </Box>
          )
        })}
        <Box key="ctx" flexDirection="row" alignItems="center" gap={1}>
          <Text color={pal.dim}>context</Text>
          {meter(a.els, pal, pct, 72, 'ctx-meter', `Context ${Math.round(pct)}% full`)}
          <Text color={level(pct, pal)}>{`${Math.round(pct)}%`}</Text>
          {used ? <Text color={pal.dim}>{used}</Text> : null}
        </Box>
        {f.fiveHour !== null ? figure('fiveHour', '5h', `${Math.round(f.fiveHour)}%`, level(f.fiveHour, pal)) : null}
        {f.sevenDay !== null ? figure('sevenDay', '7d', `${Math.round(f.sevenDay)}%`, level(f.sevenDay, pal)) : null}
        <Text key="agents" color={f.agents > 0 ? pal.text : pal.dim}>{`${f.agents} agent${f.agents === 1 ? '' : 's'}`}</Text>
      </Box>
      <Button key="pill" label={a.title} variant="primary" onPress={a.openToolbox} />
    </Box>
  )
  if (!a.todo) return bar
  return (
    <Box key="bottom-bar-stack" flexDirection="column" gap={1} width="100%">
      {todoCard(a.els, pal, a.todo, a.todoTick ?? 0, a.columns ?? 0)}
      {bar}
    </Box>
  )
}

export type DesktopToolboxArgs = {
  els: AppEls
  pal: Palette
  title: string
  figures: BarFigures
  models: string[]
  modes: Record<string, BarMode>
  mods: BarMod[]
  choices: BarTool[]
  /** The commands picked for Quick Launch, listed first there. */
  chosen: string[]
  pickModel: (alias: string) => void
  pickEffort: (level: string) => void
  flip: (command: string) => void
  toggleMod: (mod: BarMod) => void
  launch: (command: string) => void
  choosePills: () => void
  /** The panel's columns, to cut text to; 44 when not given. */
  columns?: number
}

/** The toolbox pane in the app: one rounded panel with Model, Effort, Mods and Quick Launch sections. */
export function desktopToolbox(a: DesktopToolboxArgs): JSX.Element {
  const { Box, Text, Button } = a.els
  const { pal } = a
  // Text that can hold a name or a path is cut in code to the panel: the app does not always clip a long
  // word without spaces, so it would run past the card's edge.
  const room = Math.max(16, (a.columns ?? 44) - 10)
  const fit = (text: string, n: number) => text.split(/(\s+)/).map(w => clip(w, Math.max(8, n))).join('')
  const heading = (name: string) => (
    <Text key={`h:${name}`} color={pal.dim} bold>
      {name}
    </Text>
  )
  const section = (name: string, children: JSX.Element | JSX.Element[]) => (
    <Box key={`sec:${name}`} flexDirection="column" gap={1}>
      {heading(name)}
      {children}
    </Box>
  )
  const choice = (key: string, text: string, isOn: boolean, onPress: () => void) => (
    <Button key={key} label={text} variant={isOn ? 'primary' : 'secondary'} onPress={onPress} />
  )
  const activeModel = currentAlias(a.models, a.figures.model)
  const lines = modLines(a.mods, a.modes)
  return (
    <Box
      flexDirection="column"
      gap={2}
      padding={1}
      borderStyle="round"
      borderColor={pal.border}
      backgroundColor={pal.panel}
    >
      <Text color={pal.accent} bold>
        {clip(a.title, room)}
      </Text>
      {section(
        'Model',
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {a.models.map(alias =>
            choice(`tb-model:${alias}`, modelChoiceLabel(alias, a.figures.model), alias === activeModel, () => a.pickModel(alias)),
          )}
        </Box>,
      )}
      {section(
        'Effort',
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {EFFORTS.map(l => choice(`tb-effort:${l}`, effortName(l), l === a.figures.effort, () => a.pickEffort(l)))}
        </Box>,
      )}
      {section(
        'Mods',
        <Box flexDirection="column" gap={1}>
          {lines.length === 0 ? <Text color={pal.dim}>No mods installed.</Text> : null}
          {lines.map(l => (
            <Box key={`mod:${l.key}`} flexDirection="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Box flexDirection="column" flexShrink={1} minWidth={0}>
                <Text color={pal.text}>{fit(l.label, room - 12)}</Text>
                {l.about ? <Text color={pal.dim}>{fit(l.about, room - 12)}</Text> : null}
              </Box>
              <Box flexShrink={0}>
                <Button
                  key={l.key}
                  label={l.isOn ? 'On' : 'Off'}
                  variant={l.isOn ? 'primary' : 'secondary'}
                  onPress={() => (l.command !== undefined ? a.flip(l.command) : a.toggleMod(l.mod!))}
                />
              </Box>
            </Box>
          ))}
        </Box>,
      )}
      {section(
        'Quick Launch',
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Button key="tb-choose" label="Choose pills" variant="secondary" onPress={a.choosePills} />
          {quickLaunch(a.choices, a.chosen, a.modes).map(c => (
            <Button key={`tb-launch:${c.name}`} label={clip(toolLabel(c.name), room - 6)} variant="secondary" onPress={() => a.launch(c.name)} />
          ))}
        </Box>,
      )}
    </Box>
  )
}

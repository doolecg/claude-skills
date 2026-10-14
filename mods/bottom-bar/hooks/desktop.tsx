import type { Elements } from 'claude-code'

import type { BarFigures, BarMod, BarMode, BarTodo, BarTodoItem, BarTool } from '../types'
import { EFFORTS, modelChoiceLabel, toolLabel, usedLabel } from './bar-logic'
import type { Palette, Segment } from './bar-logic'
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

/** A pixel bar `pct` full in `color`; still, it has no twinkle and no bright front. */
function pixelBar(els: AppEls, pal: Palette, pct: number, color: string, width: number, key: string, alt: string, isStill = false): JSX.Element {
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
    isStill ? '' :
    `<animate attributeName="opacity" values="${o.toFixed(2)};${hi.toFixed(2)};${o.toFixed(2)}" dur="${(1.6 + n * 2).toFixed(1)}s" begin="${(n * 2).toFixed(1)}s" repeatCount="indefinite"/>`
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const i = c * rows + r
      const n = grain(i, 7)
      if (c < front) {
        if (!isStill && lit < 1 && c >= front - 1) {
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

/**
 * A pixel bar with no percent yet: a lit patch, brightest at its front, runs along the track over and
 * over, its dots twinkling as it goes.
 */
function sweepBar(els: AppEls, pal: Palette, color: string, width: number, key: string, alt: string): JSX.Element {
  const { Svg } = els
  const tall = 9
  const pitch = 3
  const rows = 3
  const cols = Math.max(1, Math.floor(width / pitch))
  const span = Math.max(4, Math.round(cols * 0.3))
  const dots: string[] = []
  for (let c = 0; c < span; c++) {
    const b = c / (span - 1)
    for (let r = 0; r < rows; r++) {
      const i = c * rows + r
      const isFront = c === span - 1
      if (!isFront && grain(i, 5) < 0.35 * (1 - b)) continue
      const o = isFront ? 0.95 : 0.2 + 0.7 * b * b * (0.45 + 0.55 * grain(i, 13))
      const anim = grain(i, 19) > 0.6 ? `<animate attributeName="opacity" values="${o.toFixed(2)};${Math.min(1, o + 0.4).toFixed(2)};${o.toFixed(2)}" dur="${(0.8 + grain(i, 29)).toFixed(1)}s" repeatCount="indefinite"/>` : ''
      dots.push(`<rect x="${c * pitch + 0.5}" y="${r * pitch + 0.5}" width="2" height="2" rx="0.4" fill="${isFront ? pal.text : color}" opacity="${o.toFixed(2)}"${isFront ? ' filter="url(#glow)"' : ''}>${anim}</rect>`)
    }
  }
  const run = span * pitch
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${tall}" viewBox="0 0 ${width} ${tall}">` +
    `<defs><filter id="glow" x="-2" y="-2" width="5" height="5"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<clipPath id="c"><rect width="${width}" height="${tall}" rx="${tall / 2}"/></clipPath></defs>` +
    `<rect width="${width}" height="${tall}" rx="${tall / 2}" fill="${pal.sep}" fill-opacity="0.45"/>` +
    `<g clip-path="url(#c)"><g>${dots.join('')}<animateTransform attributeName="transform" type="translate" from="${-run} 0" to="${width} 0" dur="${(width / 110).toFixed(1)}s" repeatCount="indefinite"/></g></g></svg>`
  return <Svg key={key} source={source} alt={alt} width={width} height={tall} isInteractive />
}

const MAIN_PX = 360
const ITEM_PX = 160
const mark = (s: BarTodoItem['status']) => (s === 'done' ? '✓' : s === 'active' ? '▶' : '○')

/** Task View's to-do list: a header, a main bar, then a line and a bar for each item; green and still once all are done. */
export function todoCard(els: AppEls, pal: Palette, todo: BarTodo): JSX.Element {
  const { Box, Text } = els
  const total = todo.items.length
  const done = todo.items.filter(t => t.status === 'done').length
  const isAllDone = total > 0 && done === total
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const rows = todo.items.map((t, i) => {
    const key = `todo-${i}`
    const bar =
      t.status === 'done'
        ? pixelBar(els, pal, 100, pal.good, ITEM_PX, `${key}-bar`, `${t.name}: done`, true)
        : t.status === 'active'
          ? sweepBar(els, pal, pal.accent, ITEM_PX, `${key}-bar`, `${t.name}: in progress`)
          : pixelBar(els, pal, 0, pal.accent, ITEM_PX, `${key}-bar`, `${t.name}: not started`, true)
    return (
      <Box key={key} flexDirection="row" alignItems="center" columnGap={1}>
        <Text color={t.status === 'done' ? pal.good : t.status === 'active' ? pal.accent : pal.dim}>{mark(t.status)}</Text>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text color={t.status === 'active' ? pal.text : pal.dim} bold={t.status === 'active'}>
            {t.name}
          </Text>
        </Box>
        <Box flexShrink={0}>{bar}</Box>
      </Box>
    )
  })
  return (
    <Box key="todo" flexDirection="column" borderStyle="round" borderColor={pal.sep} paddingX={1} gap={1}>
      <Box key="todo-head" flexDirection="row" justifyContent="space-between" columnGap={2}>
        <Text color={pal.text} bold>
          {'To-do'}
        </Text>
        {isAllDone ? <Text color={pal.good}>{`All done · ${total} of ${total}`}</Text> : <Text color={pal.dim}>{`${done} of ${total} done · ${percent}%`}</Text>}
      </Box>
      <Box key="todo-main" flexShrink={0}>
        {isAllDone
          ? pixelBar(els, pal, 100, pal.good, MAIN_PX, 'todo-main-bar', `All ${total} done`, true)
          : pixelBar(els, pal, percent, pal.accent, MAIN_PX, 'todo-main-bar', `${done} of ${total} done, ${percent}%`)}
      </Box>
      <Box key="todo-rows" flexDirection="column">{rows}</Box>
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
      {todoCard(a.els, pal, a.todo)}
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
}

/** The toolbox pane in the app: one rounded panel with Model, Effort, Mods and Quick Launch sections. */
export function desktopToolbox(a: DesktopToolboxArgs): JSX.Element {
  const { Box, Text, Button } = a.els
  const { pal } = a
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
        {a.title}
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
              <Box flexDirection="column" flexShrink={1}>
                <Text color={pal.text}>{l.label}</Text>
                {l.about ? <Text color={pal.dim}>{l.about}</Text> : null}
              </Box>
              <Button
                key={l.key}
                label={l.isOn ? 'On' : 'Off'}
                variant={l.isOn ? 'primary' : 'secondary'}
                onPress={() => (l.command !== undefined ? a.flip(l.command) : a.toggleMod(l.mod!))}
              />
            </Box>
          ))}
        </Box>,
      )}
      {section(
        'Quick Launch',
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Button key="tb-choose" label="Choose pills" variant="secondary" onPress={a.choosePills} />
          {quickLaunch(a.choices, a.chosen, a.modes).map(c => (
            <Button key={`tb-launch:${c.name}`} label={toolLabel(c.name)} variant="secondary" onPress={() => a.launch(c.name)} />
          ))}
        </Box>,
      )}
    </Box>
  )
}

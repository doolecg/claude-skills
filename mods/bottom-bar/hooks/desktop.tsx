import type { Elements } from 'claude-code'

import type { BarFigures, BarMod, BarMode, BarTool } from '../types'
import { EFFORTS, modelChoiceLabel, toolLabel, usedLabel } from './bar-logic'
import type { Palette, Segment } from './bar-logic'
import { currentAlias, effortName, modLines, quickLaunch } from './toolbox-logic'

/** The elements the app draws with; the phone's table is the same less Input, Select and Client. */
export type AppEls = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Svg'>

const level = (pct: number, pal: Palette): string => (pct >= 80 ? pal.bad : pct >= 60 ? pal.warn : pal.good)

/** A rounded-end meter: a themed track with a fill `pct` of `width` wide. */
function meter(els: AppEls, pal: Palette, pct: number, width: number, key: string, alt: string): JSX.Element {
  const { Svg } = els
  const clamped = Math.min(Math.max(pct, 0), 100)
  const bar = 6
  const fill = Math.round((clamped / 100) * width)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${bar}" viewBox="0 0 ${width} ${bar}">` +
    `<rect width="${width}" height="${bar}" rx="${bar / 2}" fill="${pal.sep}" fill-opacity="0.45"/>` +
    (fill > 0 ? `<rect width="${Math.max(fill, bar)}" height="${bar}" rx="${bar / 2}" fill="${level(clamped, pal)}"/>` : '') +
    `</svg>`
  return <Svg key={key} source={source} alt={alt} width={width} height={bar} />
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
  return (
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
          {meter(a.els, pal, pct, 56, 'ctx-meter', `Context ${Math.round(pct)}% full`)}
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

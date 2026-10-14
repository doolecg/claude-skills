import type { Elements } from 'claude-code'

import type { BarFigures, BarMod, BarMode, BarTool } from '../types'
import { EFFORTS, modelChoiceLabel, toolLabel } from './bar-logic'
import type { Palette } from './bar-logic'
import { currentAlias, effortName, launchList, modLines } from './toolbox-logic'

/** The elements the app draws with; the phone's table is the same less Input, Select and Client. */
export type AppEls = Pick<Elements['desktop'], 'Box' | 'Text' | 'Button' | 'Svg'>

const level = (pct: number, pal: Palette): string => (pct >= 80 ? pal.bad : pct >= 60 ? pal.warn : pal.good)

/** The context meter: a rounded track with a fill, drawn small. */
function meter(els: AppEls, pal: Palette, pct: number): JSX.Element {
  const { Svg } = els
  const clamped = Math.min(Math.max(pct, 0), 100)
  const fill = Math.round((clamped / 100) * 48)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="8" viewBox="0 0 48 8">` +
    `<rect width="48" height="8" rx="4" fill="${pal.sep}"/>` +
    (fill > 0 ? `<rect width="${Math.max(fill, 8)}" height="8" rx="4" fill="${level(clamped, pal)}"/>` : '') +
    `</svg>`
  return <Svg key="ctx-meter" source={source} alt={`Context ${Math.round(clamped)}% full`} width={48} height={8} />
}

export type DesktopBarArgs = {
  els: AppEls
  pal: Palette
  title: string
  figures: BarFigures
  modes: string
  chosen: string[]
  states: Record<string, string>
  onOff: Record<string, BarMode>
  runTool: (name: string) => void
  openToolbox: () => void
}

/** The bar under the prompt in the app: one wrapping row of figures, the chosen pills, the toolbox button. */
export function desktopBar(a: DesktopBarArgs): JSX.Element {
  const { Box, Text, Button } = a.els
  const { pal, figures: f } = a
  const pct = f.ctx ?? 0
  const figure = (key: string, name: string, value: string, color: string) => (
    <Box key={key} gap={1}>
      <Text color={pal.dim}>{name}</Text>
      <Text color={color}>{value}</Text>
    </Box>
  )
  return (
    <Box key="bottom-bar" flexDirection="row" flexWrap="wrap" alignItems="center" gap={2} width="100%">
      {f.model ? (
        <Button key="model" plain onPress={a.openToolbox}>
          <Text color={pal.text} bold>
            {f.model}
          </Text>
        </Button>
      ) : null}
      {f.effort ? (
        <Button key="effort" plain onPress={a.openToolbox}>
          <Text color={pal.dim}>effort </Text>
          <Text color={pal.info} bold>
            {f.effort}
          </Text>
        </Button>
      ) : null}
      <Box key="ctx" gap={1} alignItems="center">
        <Text color={pal.dim}>context</Text>
        {meter(a.els, pal, pct)}
        <Text color={level(pct, pal)}>{`${Math.round(pct)}%`}</Text>
      </Box>
      {f.fiveHour !== null ? figure('fiveHour', '5h', `${Math.round(f.fiveHour)}%`, level(f.fiveHour, pal)) : null}
      {f.sevenDay !== null ? figure('sevenDay', '7d', `${Math.round(f.sevenDay)}%`, level(f.sevenDay, pal)) : null}
      <Text key="agents" color={f.agents > 0 ? pal.text : pal.dim}>{`${f.agents} agent${f.agents === 1 ? '' : 's'}`}</Text>
      {a.modes ? <Text color={pal.dim}>{a.modes}</Text> : null}
      {a.chosen.map(name => {
        const mode = a.onOff[name]
        const state = mode ? (mode.isOn ? 'on' : 'off') : a.states[name]
        const text = mode?.label ?? toolLabel(name)
        return (
          <Button key={`tool:${name}`} onPress={() => a.runTool(name)}>
            {state === 'on' ? '● ' : state === 'off' ? '○ ' : ''}
            {text}
          </Button>
        )
      })}
      <Button key="pill" variant="primary" onPress={a.openToolbox}>
        {a.title}
      </Button>
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
  pickModel: (alias: string) => void
  pickEffort: (level: string) => void
  flip: (command: string) => void
  toggleMod: (mod: BarMod) => void
  launch: (command: string) => void
  choosePills: () => void
}

/** The toolbox pane in the app: the same sections as the terminal's, in Box, Text and Button. */
export function desktopToolbox(a: DesktopToolboxArgs): JSX.Element {
  const { Box, Text, Button } = a.els
  const { pal } = a
  const heading = (text: string) => (
    <Text key={`h:${text}`} color={pal.dim} bold>
      {text}
    </Text>
  )
  const choice = (key: string, text: string, isOn: boolean, onPress: () => void) => (
    <Button key={key} variant={isOn ? 'primary' : undefined} onPress={onPress}>
      {text}
    </Button>
  )
  const activeModel = currentAlias(a.models, a.figures.model)
  const lines = modLines(a.mods, a.modes)
  return (
    <Box flexDirection="column" gap={1}>
      <Text color={pal.accent} bold>
        {a.title}
      </Text>
      {heading('Model')}
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {a.models.map(alias =>
          choice(`tb-model:${alias}`, modelChoiceLabel(alias, a.figures.model), alias === activeModel, () => a.pickModel(alias)),
        )}
      </Box>
      {heading('Effort')}
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {EFFORTS.map(l => choice(`tb-effort:${l}`, effortName(l), l === a.figures.effort, () => a.pickEffort(l)))}
      </Box>
      {heading('Mods')}
      {lines.length === 0 ? <Text color={pal.dim}>No mods installed.</Text> : null}
      {lines.map(l => (
        <Box key={`mod:${l.key}`} flexDirection="row" alignItems="center" justifyContent="space-between" gap={2}>
          <Box flexDirection="column" flexShrink={1}>
            <Text color={pal.text}>{l.label}</Text>
            {l.about ? <Text color={pal.dim}>{l.about}</Text> : null}
          </Box>
          <Button
            key={l.key}
            variant={l.isOn ? 'primary' : undefined}
            onPress={() => (l.command !== undefined ? a.flip(l.command) : a.toggleMod(l.mod!))}
          >
            {l.isOn ? 'On' : 'Off'}
          </Button>
        </Box>
      ))}
      {heading('Launch')}
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        <Button key="tb-choose" onPress={a.choosePills}>
          Choose pills
        </Button>
        {launchList(a.choices, a.modes).map(c => (
          <Button key={`tb-launch:${c.name}`} onPress={() => a.launch(c.name)}>
            {toolLabel(c.name)}
          </Button>
        ))}
      </Box>
    </Box>
  )
}

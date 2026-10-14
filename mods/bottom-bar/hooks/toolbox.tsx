import type { Elements } from 'claude-code'

import type { BarFigures, BarMod, BarMode, BarTool } from '../types'
import { EFFORTS, clip, modelChoiceLabel, toolLabel } from './bar-logic'
import type { Palette } from './bar-logic'
import { ICONS, currentAlias, effortName, iconColor, modLines, pad, quickLaunch, spaced } from './toolbox-logic'
import type { ModLine } from './toolbox-logic'

/** The box's width on a terminal `columns` wide: room for the rows, never past the edge. */
export const toolboxWidth = (columns: number): number => Math.max(40, Math.min(68, columns - 4))

export type ToolboxArgs = {
  els: Elements['terminal']
  pal: Palette
  /** The columns inside the box's border and padding. */
  width: number
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
  close: () => void
  /** False where the frame has a close mark of its own (the docked pane). */
  hasClose?: boolean
  launch: (command: string) => void
  choosePills: () => void
}

const LABEL_WIDTH = 10

/** The toolbox the tools pill opens, one element per row so the box above the bar knows its height. */
export function toolboxRows(a: ToolboxArgs): JSX.Element[] {
  const { Box, Text, Button } = a.els
  const { pal, width } = a

  const row = (key: string, children: JSX.Element | JSX.Element[], justify?: 'space-between') => (
    <Box key={key} width={width} height={1} overflow="hidden" justifyContent={justify}>
      {children}
    </Box>
  )
  const section = (text: string) =>
    row(`h:${text}`, [
      <Text key="t" color={pal.dim} bold>
        {text.toUpperCase()}
      </Text>,
      <Text key="r" color={pal.sep}>
        {` ${'─'.repeat(Math.max(0, width - text.length - 1))}`}
      </Text>,
    ])
  const link = (key: string, mark: string, text: string, onPress: () => void) => (
    <Button key={key} plain onPress={onPress}>
      <Text color={pal.accent}>{`${mark} `}</Text>
      <Text color={pal.text}>{text}</Text>
    </Button>
  )
  const closeButton = (
    <Button key="tb-close" plain onPress={a.close}>
      <Text color={pal.dim}>{'  ✕'}</Text>
    </Button>
  )
  const head = (name: string) =>
    row(
      'head',
      [
        <Text key="name" color={pal.accent} bold>
          {name}
        </Text>,
        <Box key="right" flexShrink={0}>
          {a.hasClose === false ? null : closeButton}
        </Box>,
      ],
      'space-between',
    )
  const chip = (key: string, text: string, isOn: boolean, fill: string, onPress: () => void) => (
    <Button key={key} plain onPress={onPress}>
      {isOn ? (
        <Text backgroundColor={fill} color={pal.ink} bold>
          {` ${text} `}
        </Text>
      ) : (
        <Text color={pal.text}>{` ${text} `}</Text>
      )}
    </Button>
  )
  const toggle = (key: string, isOn: boolean, onPress: () => void) => (
    <Button key={key} plain onPress={onPress}>
      {isOn ? (
        <Text backgroundColor={pal.good} color={pal.ink} bold>
          {' ● On  '}
        </Text>
      ) : (
        <Text backgroundColor={pal.pillBg} color={pal.dim}>
          {' ○ Off '}
        </Text>
      )}
    </Button>
  )
  // A label, a dim line about it, and its control on the right.
  const line = (key: string, label: string, about: string, control: JSX.Element, room: number, mark?: boolean) =>
    row(
      key,
      [
        <Box key="l" flexShrink={1} overflow="hidden">
          {mark === undefined ? null : <Text color={mark ? pal.good : pal.sep}>{mark ? '● ' : '○ '}</Text>}
          <Text color={pal.text}>{pad(clip(label, 17), 18)}</Text>
          <Text color={pal.dim}>{clip(about, width - 18 - room - (mark === undefined ? 1 : 3))}</Text>
        </Box>,
        <Box key="c" flexShrink={0} marginLeft={1}>
          {control}
        </Box>,
      ],
      'space-between',
    )

  const activeModel = currentAlias(a.models, a.figures.model)
  const rows: JSX.Element[] = [
    head(`◆ ${spaced(a.title, width - 16)}`),
    row('models', [
      <Text key="t" color={pal.dim}>
        {pad('Model', LABEL_WIDTH)}
      </Text>,
      ...a.models.map(alias =>
        chip(`tb-model:${alias}`, modelChoiceLabel(alias, a.figures.model), alias === activeModel, pal.accent, () =>
          a.pickModel(alias),
        ),
      ),
    ]),
    row('efforts', [
      <Text key="t" color={pal.dim}>
        {pad('Effort', LABEL_WIDTH)}
      </Text>,
      ...EFFORTS.map(level =>
        chip(`tb-effort:${level}`, effortName(level), level === a.figures.effort, pal.info, () => a.pickEffort(level)),
      ),
    ]),
    section('Mods'),
  ]

  const lines: ModLine[] = modLines(a.mods, a.modes)
  if (lines.length === 0) rows.push(row('no-mods', <Text color={pal.dim}>No mods installed.</Text>))
  for (const l of lines) {
    const press = l.command !== undefined ? () => a.flip(l.command!) : () => a.toggleMod(l.mod!)
    rows.push(line(`mod:${l.key}`, l.label, l.about, toggle(l.key, l.isOn, press), 7, l.isOn))
  }

  rows.push(section('Quick Launch'))
  const third = Math.floor(width / 3)
  const cells: JSX.Element[] = [
    link('tb-choose', '✎', 'Choose pills', a.choosePills),
    ...quickLaunch(a.choices, a.chosen, a.modes).map((c, i) => (
      <Button key={`tb-launch:${c.name}`} plain onPress={() => a.launch(c.name)}>
        <Text color={iconColor(i, pal)}>{`${ICONS[i % ICONS.length]} `}</Text>
        <Text color={pal.text}>{clip(toolLabel(c.name), third - 3)}</Text>
      </Button>
    )),
  ]
  for (let i = 0; i < cells.length; i += 3) {
    rows.push(
      row(
        `launch:${i}`,
        cells.slice(i, i + 3).map((cell, j) => (
          <Box key={`c${j}`} width={third}>
            {cell}
          </Box>
        )),
      ),
    )
  }
  return rows
}

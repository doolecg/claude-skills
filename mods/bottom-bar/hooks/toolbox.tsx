import type { Elements } from 'claude-code'

import type { BarFigures, BarMode, BarSetting, BarTool } from '../types'
import { EFFORTS, clip, modelChoiceLabel, toolLabel } from './bar-logic'
import type { Palette } from './bar-logic'
import { ICONS, currentAlias, effortName, iconColor, launchList, nextOption, pad, spaced } from './toolbox-logic'

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
  choices: BarTool[]
  settings: BarSetting[]
  pickModel: (alias: string) => void
  pickEffort: (level: string) => void
  flip: (command: string) => void
  setOption: (s: BarSetting, value: string | number | boolean) => void
  launch: (command: string) => void
  choosePills: () => void
}

/** The toolbox the tools pill opens, one element per row so the box above the bar knows its height. */
export function toolboxRows(a: ToolboxArgs): JSX.Element[] {
  const { Box, Text, Button, Input } = a.els
  const { pal, width } = a
  const activeModel = currentAlias(a.models, a.figures.model)
  const summary = [a.figures.model, effortName(a.figures.effort)].filter(Boolean).join(' · ')

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
  const row = (key: string, children: JSX.Element | JSX.Element[], justify?: 'space-between') => (
    <Box key={key} width={width} height={1} overflow="hidden" justifyContent={justify}>
      {children}
    </Box>
  )
  const heading = (text: string) => row(`h:${text}`, <Text color={pal.dim}>{spaced(text, width)}</Text>)
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

  const rows: JSX.Element[] = [
    row(
      'head',
      [
        <Text key="name" color={pal.accent} bold>
          {`◆ ${spaced(a.title, width - [...summary].length - 3)}`}
        </Text>,
        <Text key="now" color={pal.dim}>
          {summary}
        </Text>,
      ],
      'space-between',
    ),
    row('models', [
      <Text key="t" color={pal.dim}>
        {pad('MODEL', 7)}
      </Text>,
      ...a.models.map(alias =>
        chip(`tb-model:${alias}`, modelChoiceLabel(alias, a.figures.model), alias === activeModel, pal.accent, () =>
          a.pickModel(alias),
        ),
      ),
    ]),
    row('efforts', [
      <Text key="t" color={pal.dim}>
        {pad('EFFORT', 7)}
      </Text>,
      ...EFFORTS.map(level =>
        chip(`tb-effort:${level}`, effortName(level), level === a.figures.effort, pal.info, () => a.pickEffort(level)),
      ),
    ]),
    heading('Settings'),
  ]

  // On/off modes first, then the plugins' own options, each with its control on the right.
  type Line = { key: string; label: string; about: string; isOn?: boolean; control: JSX.Element; room: number }
  const about = new Map(a.choices.map(c => [c.name, c.description]))
  const lines: Line[] = Object.entries(a.modes).map(([command, mode]) => ({
    key: command,
    label: mode.label,
    about: about.get(command) ?? '',
    isOn: mode.isOn,
    control: toggle(`tb-mode:${command}`, mode.isOn, () => a.flip(command)),
    room: 7,
  }))
  for (const s of a.settings) {
    const shown = [...String(s.value)].length
    const control = s.isLocked ? (
      <Text color={pal.dim}>{`${String(s.value)} (locked)`}</Text>
    ) : s.kind === 'boolean' ? (
      toggle(`tb-set:${s.key}`, s.value === true, () => a.setOption(s, s.value !== true))
    ) : s.kind === 'choice' && s.options.length > 0 ? (
      <Button key={`tb-set:${s.key}`} plain onPress={() => a.setOption(s, nextOption(s.options, s.value) ?? '')}>
        <Text backgroundColor={pal.pillBg} color={pal.text}>{` ${String(s.value)} ▸ `}</Text>
      </Button>
    ) : (
      <Box width={20}>
        <Input
          key={`tb-set:${s.key}`}
          value={String(s.value)}
          onSubmit={(value: string) => a.setOption(s, s.kind === 'number' ? Number(value) || 0 : value.trim())}
        />
      </Box>
    )
    lines.push({
      key: s.key,
      label: s.label,
      about: s.description,
      isOn: s.kind === 'boolean' ? s.value === true : undefined,
      control,
      room: s.isLocked ? shown + 9 : s.kind === 'boolean' ? 7 : s.kind === 'choice' ? shown + 4 : 20,
    })
  }
  const labelWidth = Math.min(16, Math.max(0, ...lines.map(l => [...l.label].length)) + 2)
  if (lines.length === 0) rows.push(row('no-settings', <Text color={pal.dim}>No mod has a setting yet.</Text>))
  for (const l of lines) {
    rows.push(
      row(
        `set:${l.key}`,
        [
          <Box key="l" flexShrink={1} overflow="hidden">
            <Text color={l.isOn === undefined ? pal.sep : l.isOn ? pal.good : pal.dim}>{l.isOn ? '● ' : '○ '}</Text>
            <Text color={pal.text}>{pad(clip(l.label, labelWidth - 1), labelWidth)}</Text>
            <Text color={pal.dim}>{clip(l.about, width - labelWidth - l.room - 4)}</Text>
          </Box>,
          <Box key="c" flexShrink={0} marginLeft={1}>
            {l.control}
          </Box>,
        ],
        'space-between',
      ),
    )
  }

  rows.push(heading('Launch'))
  const half = Math.floor(width / 2)
  const cells: JSX.Element[] = [
    <Button key="tb-choose" plain onPress={a.choosePills}>
      <Text color={pal.accent}>{'✎ '}</Text>
      <Text color={pal.text}>Choose pills</Text>
    </Button>,
    ...launchList(a.choices, a.modes).map((c, i) => (
      <Button key={`tb-launch:${c.name}`} plain onPress={() => a.launch(c.name)}>
        <Text color={iconColor(i, pal)}>{`${ICONS[i % ICONS.length]} `}</Text>
        <Text color={pal.text}>{clip(toolLabel(c.name), half - 3)}</Text>
      </Button>
    )),
  ]
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(
      row(`launch:${i}`, [
        <Box key="a" width={half}>
          {cells[i]!}
        </Box>,
        ...(cells[i + 1] ? [<Box key="b">{cells[i + 1]!}</Box>] : []),
      ]),
    )
  }
  return rows
}

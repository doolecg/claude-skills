import type { Elements } from 'claude-code'

import type { BarFigures, BarMod, BarMode, BarSetting, BarTool } from '../types'
import { ACCENTS, EFFORTS, clip, modelChoiceLabel, toolLabel } from './bar-logic'
import type { Palette } from './bar-logic'
import { ICONS, currentAlias, effortName, iconColor, launchList, modLines, nextOption, pad, spaced } from './toolbox-logic'
import type { ModLine } from './toolbox-logic'

/** The box's width on a terminal `columns` wide: room for the rows, never past the edge. */
export const toolboxWidth = (columns: number): number => Math.max(40, Math.min(68, columns - 4))

export type ToolboxArgs = {
  els: Elements['terminal']
  pal: Palette
  /** The columns inside the box's border and padding. */
  width: number
  title: string
  /** `home` or `settings`. */
  view: string
  colour: string
  figures: BarFigures
  models: string[]
  modes: Record<string, BarMode>
  mods: BarMod[]
  choices: BarTool[]
  settings: BarSetting[]
  pickModel: (alias: string) => void
  pickEffort: (level: string) => void
  flip: (command: string) => void
  toggleMod: (mod: BarMod) => void
  setOption: (s: BarSetting, value: string | number | boolean) => void
  setName: (name: string) => void
  setColour: (colour: string) => void
  setView: (view: string) => void
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
  const head = (name: string, right: JSX.Element) =>
    row(
      'head',
      [
        <Text key="name" color={pal.accent} bold>
          {name}
        </Text>,
        <Box key="right" flexShrink={0}>
          {right}
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

  if (a.view === 'settings') return settingsRows(a, { row, section, head, link, line, toggle, chip })

  const activeModel = currentAlias(a.models, a.figures.model)
  const rows: JSX.Element[] = [
    head(`◆ ${spaced(a.title, width - 16)}`, link('tb-settings', '⚙', 'Settings', () => a.setView('settings'))),
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

  rows.push(section('Launch'))
  const third = Math.floor(width / 3)
  const cells: JSX.Element[] = [
    link('tb-choose', '✎', 'Choose pills', a.choosePills),
    ...launchList(a.choices, a.modes).map((c, i) => (
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

type Parts = {
  row: (key: string, children: JSX.Element | JSX.Element[], justify?: 'space-between') => JSX.Element
  section: (text: string) => JSX.Element
  head: (name: string, right: JSX.Element) => JSX.Element
  link: (key: string, mark: string, text: string, onPress: () => void) => JSX.Element
  line: (key: string, label: string, about: string, control: JSX.Element, room: number, mark?: boolean) => JSX.Element
  toggle: (key: string, isOn: boolean, onPress: () => void) => JSX.Element
  chip: (key: string, text: string, isOn: boolean, fill: string, onPress: () => void) => JSX.Element
}

/** The Settings page: the bar's own look first, then every other mod's options. */
function settingsRows(a: ToolboxArgs, p: Parts): JSX.Element[] {
  const { Box, Text, Button, Input } = a.els
  const { pal, width } = a
  const rows: JSX.Element[] = [
    p.head(`◆ ${spaced('Settings', width - 14)}`, p.link('tb-back', '‹', 'Back', () => a.setView('home'))),
    p.section('Look'),
    p.row('name', [
      <Text key="t" color={pal.dim}>
        {pad('Name', LABEL_WIDTH)}
      </Text>,
      <Box key="i" width={Math.min(28, width - LABEL_WIDTH)}>
        <Input key="tb-name" value={a.title} onSubmit={(value: string) => a.setName(value.trim())} />
      </Box>,
    ]),
    p.row('colour', [
      <Text key="t" color={pal.dim}>
        {pad('Colour', LABEL_WIDTH)}
      </Text>,
      ...Object.entries(ACCENTS).map(([name, [dark]]) => {
        const isOn = name === a.colour
        const swatch = name === 'Coral' ? pal.accent : dark
        return (
          <Button key={`tb-colour:${name}`} plain onPress={() => a.setColour(name)}>
            <Text color={swatch} backgroundColor={isOn ? pal.pillBg : undefined}>
              {'■ '}
            </Text>
            <Text color={isOn ? pal.text : pal.dim} backgroundColor={isOn ? pal.pillBg : undefined} bold={isOn}>
              {`${name} `}
            </Text>
          </Button>
        )
      }),
    ]),
    p.section('Mod options'),
  ]

  const options = a.settings.filter(s => !s.key.startsWith('bottom-bar.'))
  if (options.length === 0) rows.push(p.row('no-settings', <Text color={pal.dim}>No mod has options yet.</Text>))
  for (const s of options) {
    const shown = [...String(s.value)].length
    const control = s.isLocked ? (
      <Text color={pal.dim}>{`${String(s.value)} (locked)`}</Text>
    ) : s.kind === 'boolean' ? (
      p.toggle(`tb-set:${s.key}`, s.value === true, () => a.setOption(s, s.value !== true))
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
    const room = s.isLocked ? shown + 9 : s.kind === 'boolean' ? 7 : s.kind === 'choice' ? shown + 4 : 20
    rows.push(p.line(`set:${s.key}`, s.label, s.description, control, room))
  }
  return rows
}

import type { SbBlock, SbJob, SbMode, SbTab } from '../types'
import { CATALOG, SETTINGS_PREFIX, SIDEBAR_TAB, entryOf, fmtAgo, fmtElapsed, progressOf } from './logic'
import {
  sbButton,
  sbCappedBar,
  sbCard,
  sbFramedBar,
  sbGood,
  sbMeter,
  sbPad,
  sbSection,
  sbSettingRow,
  sbSplit,
  sbSweep,
  sbTitle,
  sbToggle,
  sbWarm,
  type SbKit,
  type SbSetting,
} from './sidebar-kit'

/** What the sidebar's own pane draws from, and what its buttons do. */
export type ViewData = {
  view: string
  settings: SbSetting[]
  modes: Record<string, Record<string, SbMode>>
  job: SbJob | null
  enhance: { counts: string; ok: boolean } | null
  /** Rule Guard's stops this session, newest first. */
  blocks: SbBlock[]
  /** The installed catalog mods, footer ones included. */
  installed: string[]
  /** Every installed catalog mod with a tab, in the person's order, hidden ones included. */
  all: string[]
  hidden: string[]
  tabs: SbTab[]
  now: number
  setOption: (s: SbSetting, value: string | number | boolean) => void
  flipMode: (command: string) => void
  openTab: (id: string) => void
  openSettings: (id: string) => void
  setHidden: (id: string, isHidden: boolean) => void
  moveTab: (id: string, by: -1 | 1) => void
}

/** The options of one mod, by its plugin name. */
const optionsOf = (d: ViewData, id: string) => d.settings.filter(s => s.key.startsWith(`${id}.`))

function modeRows(k: SbKit, d: ViewData, id: string) {
  const { Text } = k.els
  return Object.entries(d.modes[id] ?? {}).map(([command, m]) =>
    sbSplit(k, `mode:${command}`, <Text color={k.pal.text}>{sbPad(m.label, 17)}</Text>, sbToggle(k, `sb-mode:${command}`, m.isOn, () => d.flipMode(command))),
  )
}

function optionRows(k: SbKit, d: ViewData, id: string) {
  const { Text } = k.els
  const options = optionsOf(d, id)
  if (options.length === 0) return [<Text key="no-options" color={k.pal.dim}>No options to set.</Text>]
  return options.map(s => sbSettingRow(k, s, value => d.setOption(s, value)))
}

/** A mod's settings: its on/off modes, then its options. A mod drawn in its own pane has no mode here: its tab is it. */
function settingsBody(k: SbKit, d: ViewData, id: string) {
  const modes = entryOf(id)?.pane ? [] : modeRows(k, d, id)
  return [
    ...(modes.length > 0 ? [sbSection(k, `s-mode:${id}`, 'Mode'), ...modes] : []),
    sbSection(k, `s-opt:${id}`, 'Options'),
    ...optionRows(k, d, id),
  ]
}

function aboutCard(k: SbKit, id: string, extra: unknown[] = []) {
  const { Text } = k.els
  const entry = entryOf(id)
  return sbCard(k, `about:${id}`, [
    <Text key="about" color={k.pal.dim} wrap="wrap">
      {entry?.about ?? ''}
    </Text>,
    ...extra,
  ])
}

/** A settings page the ⚙ of a mod's own tab opens. A footer mod has no tab, so its Back goes to the first tab. */
function settingsPage(k: SbKit, d: ViewData, id: string) {
  const entry = entryOf(id)
  const back = entry?.footer ? (d.tabs[0]?.id ?? SIDEBAR_TAB) : id
  return [
    sbTitle(k, { icon: entry?.icon ?? '◆', name: entry?.name ?? id, status: 'settings' }, { label: 'Back', onPress: () => d.openTab(back) }),
    aboutCard(k, id),
    ...settingsBody(k, d, id),
  ]
}

/** Clean View's tab: the job on screen now, mirrored, then its settings. */
function cleanView(k: SbKit, d: ViewData) {
  const { Box, Text } = k.els
  const { pal } = k
  const isOn = Object.values(d.modes['clean-view'] ?? {}).some(m => m.isOn)
  const job = d.job
  const state = !job ? 'no job running' : job.phase === 'done' ? 'all done' : job.phase === 'working' ? 'job running' : job.phase.replace('-', ' ')
  const parts: unknown[] = [sbTitle(k, { icon: '✶', name: 'Clean View', status: `${isOn ? 'on' : 'off'} · ${state}` })]
  if (job) {
    const sum = progressOf(job)
    const isDone = job.phase === 'done'
    const took = fmtElapsed((job.finishedAt > 0 ? job.finishedAt : d.now) - job.startedAt)
    const label = isDone ? `${sum.total} of ${sum.total} steps` : `Step ${sum.step} of ${sum.total}`
    const pctText = `${sum.percent}%`.padStart(4)
    const inner = k.columns - 4
    const nameWidth = Math.max(8, Math.min(26, inner - 2 - 12 - 7))
    const rows = job.tasks.map((t, i) => {
      const done = t.status === 'done'
      const active = t.status === 'active'
      const look = done ? sbGood(k, i + 1) : sbWarm(k, i + 1)
      const pixels = active && !t.hasReported && !isDone ? sbSweep(10, look) : sbMeter(10, done ? 1 : active ? t.percent / 100 : 0, look)
      return (
        <Box key={`step:${t.id}`} height={1} overflow="hidden">
          <Text color={done ? pal.good : active ? pal.accent : pal.faint}>{`${done ? '✓' : active ? '▶' : '○'} `}</Text>
          <Text color={done ? pal.dim : active ? pal.text : pal.faint} bold={active}>
            {sbPad(t.name, nameWidth)}
          </Text>
          <Text> </Text>
          {sbCappedBar(k, `step-bar:${t.id}`, pixels)}
          <Text color={active ? pal.accent : pal.dim}>{done ? '  done' : active ? (t.hasReported ? `  ${t.percent}%` : '  …') : ''}</Text>
        </Box>
      )
    })
    parts.push(
      sbCard(
        k,
        'job',
        [
          sbSplit(
            k,
            'job-head',
            <Text wrap="truncate-end">
              <Text color={isDone ? pal.good : pal.warmFrom}>{isDone ? '✓ ' : '✶ '}</Text>
              <Text color={isDone ? pal.good : pal.text} bold>
                {job.title}
              </Text>
            </Text>,
            <Text color={pal.dim}>{isDone ? `took ${took}` : took}</Text>,
          ),
          sum.total > 0
            ? sbFramedBar(k, 'job-bar', {
                width: inner,
                bar: cells => (isDone ? sbMeter(cells, 1, sbGood(k)) : sbMeter(cells, sum.percent / 100, sbWarm(k))),
                top: [{ text: label, color: pal.dim }],
                topRight: [{ text: pctText.trim(), color: isDone ? pal.good : pal.accent, bold: true }],
              })
            : null,
          ...rows,
        ],
        { border: isDone ? pal.good : job.phase === 'needs-you' ? pal.warn : job.phase === 'stuck' ? pal.bad : undefined },
      ),
    )
  } else {
    parts.push(
      sbCard(k, 'no-job', [
        <Text key="t" color={pal.text} bold>
          No job running
        </Text>,
        <Text key="d" color={pal.dim} wrap="wrap">
          The plan shows here and above the prompt while Claude works.
        </Text>,
      ]),
    )
  }
  return [...parts, ...settingsBody(k, d, 'clean-view')]
}

/** A tab for a mod that only has settings: what it does, then its modes and options. */
function configTab(k: SbKit, d: ViewData, id: string) {
  const { Text } = k.els
  const entry = entryOf(id)!
  const extra: unknown[] = []
  if (id === 'prompt-enhancer' && d.enhance) {
    extra.push(
      <Text key="last" wrap="truncate-end">
        <Text color={k.pal.dim}>Last run </Text>
        <Text color={k.pal.text}>{d.enhance.counts || 'no sources'}</Text>
        <Text color={d.enhance.ok ? k.pal.good : k.pal.bad}>{d.enhance.ok ? ' · ✓ rewritten' : ' · ✗ no rewrite'}</Text>
      </Text>,
    )
  }
  if (id === 'rule-guard') return ruleGuard(k, d)
  return [sbTitle(k, { icon: entry.icon, name: entry.name, status: 'settings only' }), aboutCard(k, id, extra), ...settingsBody(k, d, id)]
}

/** Rule Guard's tab: the calls it stopped this session, then its rules as switches. */
function ruleGuard(k: SbKit, d: ViewData) {
  const { Text } = k.els
  const { pal } = k
  const n = d.blocks.length
  const rows = d.blocks.slice(0, 5).flatMap((b, i) => [
    sbSplit(
      k,
      `block:${i}`,
      <Text wrap="truncate-end">
        <Text color={pal.bad}>{'⊘ '}</Text>
        <Text color={pal.text}>{b.label}</Text>
      </Text>,
      <Text color={pal.dim}>{fmtAgo(b.at, d.now)}</Text>,
    ),
    <Text key={`block-what:${i}`} color={pal.faint} wrap="truncate-end">
      {`  ${b.what}`}
    </Text>,
  ])
  return [
    sbTitle(k, { icon: '⊘', name: 'Rule Guard', status: n === 0 ? 'nothing stopped' : `${n} stopped` }),
    aboutCard(k, 'rule-guard'),
    sbSection(k, 'blocks', 'Stopped this session'),
    ...(rows.length > 0 ? rows : [<Text key="no-blocks" color={pal.dim}>Nothing stopped yet.</Text>]),
    sbSection(k, 's-opt:rule-guard', 'Rules'),
    ...optionRows(k, d, 'rule-guard'),
  ]
}

/** The sidebar's own settings (the ⋯): which tabs show and their order. */
function sidebarPage(k: SbKit, d: ViewData) {
  const { Box, Text, Button } = k.els
  const { pal } = k
  const rows = d.all.map((id, i) => {
    const entry = entryOf(id)!
    const isShown = !d.hidden.includes(id)
    return sbSplit(
      k,
      `order:${id}`,
      <Text wrap="truncate-end">
        <Text color={isShown ? pal.accent : pal.faint}>{`${entry.icon} `}</Text>
        <Text color={isShown ? pal.text : pal.dim}>{entry.name}</Text>
      </Text>,
      <Box>
        <Button key={`sb-up:${id}`} plain onPress={() => d.moveTab(id, -1)}>
          <Text color={i === 0 ? pal.faint : pal.accent}>▲</Text>
        </Button>
        <Text> </Text>
        <Button key={`sb-down:${id}`} plain onPress={() => d.moveTab(id, 1)}>
          <Text color={i === d.all.length - 1 ? pal.faint : pal.accent}>▼</Text>
        </Button>
        <Text>{'  '}</Text>
        {sbToggle(k, `sb-show:${id}`, isShown, () => d.setHidden(id, isShown))}
      </Box>,
    )
  })
  const missing = CATALOG.filter(c => !d.installed.includes(c.id)).map(c => c.name)
  const footers = CATALOG.filter(c => c.footer && d.installed.includes(c.id))
  return [
    sbTitle(k, { icon: '◆', name: 'Sidebar', status: 'settings' }, d.tabs[0] ? { label: 'Back', onPress: () => d.openTab(d.tabs[0]!.id) } : undefined),
    sbCard(k, 'about-sidebar', [
      <Text key="a" color={pal.dim} wrap="wrap">
        One tab per mod. It follows your theme and the Bottom Bar's colour. Open it with /sidebar.
      </Text>,
    ]),
    sbSection(k, 'tabs', 'Tabs'),
    ...(rows.length > 0 ? rows : [<Text key="none" color={pal.dim}>No mods with a tab are installed.</Text>]),
    ...(footers.length > 0
      ? [
          sbSection(k, 'footer', 'Footer'),
          ...footers.map(c =>
            sbSplit(
              k,
              `footer:${c.id}`,
              <Text wrap="truncate-end">
                <Text color={pal.accent}>{`${c.icon} `}</Text>
                <Text color={pal.text}>{c.name}</Text>
                <Text color={pal.dim}>{' · at the bottom of every tab'}</Text>
              </Text>,
              sbButton(k, `sb-footer-set:${c.id}`, '⚙ Settings', () => d.openSettings(c.id)),
            ),
          ),
        ]
      : []),
    ...(missing.length > 0
      ? [
          sbSection(k, 'missing', 'Not installed'),
          <Text key="missing-list" color={pal.faint} wrap="wrap">
            {missing.join(' · ')}
          </Text>,
        ]
      : []),
    sbSection(k, 'bar-opts', 'Look'),
    ...d.settings.filter(s => s.key === 'bottom-bar.colour').map(s => sbSettingRow(k, s, value => d.setOption(s, value))),
    <Box key="reload" marginTop={1}>
      {sbButton(k, 'sb-reopen', 'Reload the list', () => d.openTab(SIDEBAR_TAB), false)}
    </Box>,
  ]
}

/** The rows the sidebar's own pane draws under the strip, for its current view. */
export function viewRows(k: SbKit, d: ViewData): unknown[] {
  if (d.view === SIDEBAR_TAB) return sidebarPage(k, d)
  if (d.view.startsWith(SETTINGS_PREFIX)) return settingsPage(k, d, d.view.slice(SETTINGS_PREFIX.length))
  if (d.view === 'clean-view') return cleanView(k, d)
  if (entryOf(d.view)) return configTab(k, d, d.view)
  return sidebarPage(k, d)
}

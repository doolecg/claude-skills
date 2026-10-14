import type { SbBlock, SbJob, SbTab } from '../types'
import { CATALOG, SIDEBAR_TAB, entryOf, fmtAgo, fmtElapsed, progressOf } from './logic'
import {
  sbButton,
  sbCappedBar,
  sbCard,
  sbFramedBar,
  sbGood,
  sbMeter,
  sbPad,
  sbSection,
  sbSplit,
  sbSweep,
  sbTitle,
  sbToggle,
  sbWarm,
  type SbKit,
} from './sidebar-kit'

/** What the sidebar's own pane draws from, and what its buttons do. */
export type ViewData = {
  view: string
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
  openTab: (id: string) => void
  setHidden: (id: string, isHidden: boolean) => void
  moveTab: (id: string, by: -1 | 1) => void
}

/** The dim line that points a mod's options to Claude Code's plugin menu. */
const optionsHint = (k: SbKit, id: string) => (
  <k.els.Text key={`options:${id}`} color={k.pal.dim} wrap="wrap">
    {`Options: /plugin › Installed › ${entryOf(id)?.name ?? id} › Configure`}
  </k.els.Text>
)

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

/** Clean View's tab: the job on screen now, mirrored. */
function cleanView(k: SbKit, d: ViewData) {
  const { Box, Text } = k.els
  const { pal } = k
  const job = d.job
  const state = !job ? 'no job running' : job.phase === 'done' ? 'all done' : job.phase === 'working' ? 'job running' : job.phase.replace('-', ' ')
  const parts: unknown[] = [sbTitle(k, { icon: '✶', name: 'Clean View', status: state })]
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
      if (!k.isTerminal) {
        return (
          <Box key={`step:${t.id}`} alignItems="center" gap="sm">
            <Text color={done ? pal.good : active ? pal.accent : pal.faint}>{done ? '✓' : active ? '▶' : '○'}</Text>
            <Box flexGrow={1} flexShrink={1}>
              <Text color={done ? pal.dim : active ? pal.text : pal.faint} bold={active}>
                {t.name}
              </Text>
            </Box>
            {sbCappedBar(k, `step-bar:${t.id}`, pixels)}
            <Text color={active ? pal.accent : pal.dim}>{done ? 'done' : active ? (t.hasReported ? `${t.percent}%` : '…') : ''}</Text>
          </Box>
        )
      }
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
            <Text wrap={k.isTerminal ? 'truncate-end' : undefined}>
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
  return [...parts, optionsHint(k, 'clean-view')]
}

/** A tab for a mod the sidebar draws: what it does, then where its options are. */
function configTab(k: SbKit, d: ViewData, id: string) {
  const { Text } = k.els
  const entry = entryOf(id)!
  const extra: unknown[] = []
  if (id === 'prompt-enhancer' && d.enhance) {
    extra.push(
      <Text key="last" wrap={k.isTerminal ? 'truncate-end' : undefined}>
        <Text color={k.pal.dim}>Last run </Text>
        <Text color={k.pal.text}>{d.enhance.counts || 'no sources'}</Text>
        <Text color={d.enhance.ok ? k.pal.good : k.pal.bad}>{d.enhance.ok ? ' · ✓ rewritten' : ' · ✗ no rewrite'}</Text>
      </Text>,
    )
  }
  if (id === 'rule-guard') return ruleGuard(k, d)
  return [sbTitle(k, { icon: entry.icon, name: entry.name, status: 'options in /plugin' }), aboutCard(k, id, extra), optionsHint(k, id)]
}

/** Rule Guard's tab: the calls it stopped this session, then where its rules are set. */
function ruleGuard(k: SbKit, d: ViewData) {
  const { Text } = k.els
  const { pal } = k
  const n = d.blocks.length
  const rows = d.blocks.slice(0, 5).flatMap((b, i) => [
    sbSplit(
      k,
      `block:${i}`,
      <Text wrap={k.isTerminal ? 'truncate-end' : undefined}>
        <Text color={pal.bad}>{'⊘ '}</Text>
        <Text color={pal.text}>{b.label}</Text>
      </Text>,
      <Text color={pal.dim}>{fmtAgo(b.at, d.now)}</Text>,
    ),
    <Text key={`block-what:${i}`} color={pal.faint} wrap={k.isTerminal ? 'truncate-end' : undefined}>
      {k.isTerminal ? `  ${b.what}` : b.what}
    </Text>,
  ])
  return [
    sbTitle(k, { icon: '⊘', name: 'Rule Guard', status: n === 0 ? 'nothing stopped' : `${n} stopped` }),
    aboutCard(k, 'rule-guard'),
    sbSection(k, 'blocks', 'Stopped this session'),
    ...(rows.length > 0 ? rows : [<Text key="no-blocks" color={pal.dim}>Nothing stopped yet.</Text>]),
    optionsHint(k, 'rule-guard'),
  ]
}

/** The sidebar's own page (the ⋯): which tabs show and their order. */
function sidebarPage(k: SbKit, d: ViewData) {
  const { Box, Text, Button } = k.els
  const { pal } = k
  const rows = d.all.map((id, i) => {
    const entry = entryOf(id)!
    const isShown = !d.hidden.includes(id)
    return sbSplit(
      k,
      `order:${id}`,
      <Text wrap={k.isTerminal ? 'truncate-end' : undefined}>
        <Text color={isShown ? pal.accent : pal.faint}>{`${entry.icon} `}</Text>
        <Text color={isShown ? pal.text : pal.dim}>{entry.name}</Text>
      </Text>,
      k.isTerminal ? (
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
      </Box>
      ) : (
        <Box gap="xs" alignItems="center">
          <Button key={`sb-up:${id}`} label="▲" variant="secondary" onPress={() => d.moveTab(id, -1)} />
          <Button key={`sb-down:${id}`} label="▼" variant="secondary" onPress={() => d.moveTab(id, 1)} />
          {sbToggle(k, `sb-show:${id}`, isShown, () => d.setHidden(id, isShown))}
        </Box>
      ),
    )
  })
  const missing = CATALOG.filter(c => !d.installed.includes(c.id)).map(c => c.name)
  return [
    sbTitle(k, { icon: '◆', name: 'Sidebar', status: 'tabs' }, d.tabs[0] ? { label: 'Back', onPress: () => d.openTab(d.tabs[0]!.id) } : undefined),
    sbCard(k, 'about-sidebar', [
      <Text key="a" color={pal.dim} wrap="wrap">
        One tab per mod. It follows your theme and the Bottom Bar's colour. Open it with /sidebar.
      </Text>,
    ]),
    sbSection(k, 'tabs', 'Tabs'),
    ...(rows.length > 0 ? rows : [<Text key="none" color={pal.dim}>No mods with a tab are installed.</Text>]),
    ...(missing.length > 0
      ? [
          sbSection(k, 'missing', 'Not installed'),
          <Text key="missing-list" color={pal.faint} wrap="wrap">
            {missing.join(' · ')}
          </Text>,
        ]
      : []),
    <Box key="reload" marginTop={k.isTerminal ? 1 : 'sm'}>
      {sbButton(k, 'sb-reopen', 'Reload the list', () => d.openTab(SIDEBAR_TAB), false)}
    </Box>,
  ]
}

/** The rows the sidebar's own pane draws under the strip, for its current view. */
export function viewRows(k: SbKit, d: ViewData): unknown[] {
  if (d.view === SIDEBAR_TAB) return sidebarPage(k, d)
  if (d.view === 'clean-view') return cleanView(k, d)
  if (entryOf(d.view)) return configTab(k, d, d.view)
  return sidebarPage(k, d)
}

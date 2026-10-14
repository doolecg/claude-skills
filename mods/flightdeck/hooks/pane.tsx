import type { FdAgent, FdMain, FdUsage } from '../types'
import { critterOf } from './critter'
import {
  agentMetrics,
  fmtDuration,
  fmtUsd,
  groupAgents,
  limitLabel,
  modelName,
  summaryOf,
  windowLabel,
  windowOf,
  type Palette,
} from './logic'
import {
  sbFrame,
  sbFramedBar,
  sbKit,
  sbLevel,
  sbMeter,
  sbStripRows,
  sbSweep,
  sbTitle,
  sbWarm,
  sbActions,
  sbPalette,
  type SbLook,
  type SbSeg,
  type SbStrip,
} from './sidebar-kit'

export type PaneData = {
  pal: Palette
  main: FdMain
  usage: FdUsage
  agents: FdAgent[]
  tick: number
  now: number
  columns: number
  /** The rows the pane's body shows at once. */
  bodyRows: number
  /** The first running card and the first finished row the two lists show. */
  runOffset: number
  doneOffset: number
  /** The Sidebar's strip when this pane is its open tab; the pane then draws as a tab. */
  strip?: SbStrip
  theme: unknown
  /** Asks the Sidebar for a tab or its settings (see `sbAsker`). */
  ask: (args: string) => void
  onStop: (id: string) => void
  onStopAll: () => void
  onClear: (id: string) => void
  onClearAll: () => void
}

/** Where the two lists sit in the pane's rows, for the scroll hook: `[first, end)` rows and how far each can scroll. */
export type PaneLayout = { run: [number, number]; done: [number, number]; runMax: number; doneMax: number }

/** Rows a running agent's outlined card takes. */
export const RUN_ROWS = 3

/** How many rows each list gets: both whole when they fit, else the running list first, keeping some for the finished one. */
export function splitRows(avail: number, runNeed: number, doneNeed: number): { run: number; done: number } {
  if (runNeed + doneNeed <= avail) return { run: runNeed, done: doneNeed }
  const doneFloor = Math.min(doneNeed, Math.max(3, Math.floor(avail / 3)))
  let run = Math.min(runNeed, Math.max(RUN_ROWS, avail - doneFloor))
  run -= run % RUN_ROWS
  run = Math.max(Math.min(runNeed, RUN_ROWS), run)
  const done = Math.min(doneNeed, Math.max(Math.min(doneNeed, 3), avail - run))
  return { run, done }
}

/** The thumb of a one-column scrollbar `rows` tall over `total` items, `shown` of them from `offset`. */
export function scrollThumb(rows: number, total: number, shown: number, offset: number): [number, number] {
  if (total <= shown || rows <= 0) return [0, rows]
  const size = Math.max(1, Math.round((rows * shown) / total))
  const top = Math.min(rows - size, Math.round(((rows - size) * offset) / Math.max(1, total - shown)))
  return [top, top + size]
}

/** The sidebar: the main session's outlined meters, then a list of running agents and one of finished agents, each scrolling on its own. */
export function drawPane(els: Record<string, any>, surface: string, d: PaneData): { el: unknown; layout: PaneLayout } {
  const { Box, Text, Button } = els
  const { main, usage, tick, now, strip } = d
  const k = sbKit(els, surface, sbPalette(strip?.theme ?? d.theme, strip?.colour), d.columns, tick)
  const pal = strip ? k.pal : d.pal
  const full = Math.max(16, d.columns)
  const groups = groupAgents(d.agents)
  const working = groups.working.length
  let row = strip ? sbStripRows(k, strip) : 0

  const line = (key: string, children: unknown, w = full) => (
    <Box key={key} height={1} width={w} overflow="hidden">
      {children}
    </Box>
  )
  const split = (key: string, left: unknown, right: unknown, w = full) => (
    <Box key={key} height={1} width={w}>
      <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden">
        {left}
      </Box>
      {right ? (
        <Box flexShrink={0} marginLeft={1}>
          {right}
        </Box>
      ) : null}
    </Box>
  )
  const button = (key: string, label: string, color: string, onPress: () => void) => (
    <Button key={key} plain onPress={onPress}>
      <Text color={color}>{label}</Text>
    </Button>
  )

  // ---- header ----
  const status = working > 0 ? `${working} agent${working === 1 ? '' : 's'} working` : 'no agents working'
  const header = strip
    ? sbTitle(k, { icon: '✈', name: 'Flightdeck', status }, { label: 'Settings', onPress: () => d.ask('settings flightdeck') })
    : split(
        'header',
        <Text wrap="truncate-end">
          <Text color={pal.accent} bold>
            ✈ FLIGHTDECK
          </Text>
          <Text color={pal.dim}>{` · ${status}`}</Text>
        </Text>,
        null,
      )
  row += 1

  // ---- main session: context in an outlined meter, the usage limits beside each other ----
  const model = modelName(main.model) || 'Main session'
  const size = windowLabel(usage.window)
  const pct = usage.ctxPct ?? 0
  const turnMs = main.turnStartedAt > 0 ? (main.turnEndedAt > 0 ? main.turnEndedAt : now) - main.turnStartedAt : 0
  const turnText = main.turnStartedAt > 0 ? `${main.isRunning ? 'turn' : 'last turn'} ${fmtDuration(turnMs)}` : 'no turn yet'
  const ctxFrame = sbFramedBar(k, 'main-ctx', {
    width: full,
    bar: cells => sbMeter(cells, pct / 100, sbLevel(k, pct, 1)),
    top: [
      { text: '◆ ', color: pal.accent },
      { text: model, color: pal.text, bold: true },
      ...(size ? [{ text: ` · ${size}`, color: pal.dim }] : []),
      ...(main.effort ? [{ text: ' · effort ', color: pal.dim }, { text: main.effort, color: pal.info, bold: true }] : []),
    ],
    topRight: [{ text: main.isRunning ? '● working' : '○ idle', color: main.isRunning ? pal.good : pal.dim }],
    bottom: [
      { text: 'ctx ', color: pal.dim },
      { text: usage.ctxPct === null ? '—' : `${Math.round(pct)}%`, color: pal.text },
      ...(usage.costUsd !== null ? [{ text: ` · ${fmtUsd(usage.costUsd)}`, color: pal.text }] : []),
    ],
    bottomRight: [{ text: `${turnText} · ${main.steps} req`, color: pal.dim }],
  })
  row += 3
  const limits = usage.limits.slice(0, 2)
  const half = limits.length > 1 ? Math.floor((full - 1) / 2) : full
  const limitFrames =
    limits.length > 0 ? (
      <Box key="main-limits" columnGap={1}>
        {limits.map((l, i) =>
          sbFramedBar(k, `lim${i}`, {
            width: i === 1 ? full - 1 - half : half,
            bar: cells => sbMeter(cells, l.pct / 100, sbLevel(k, l.pct, 2 + i)),
            top: [{ text: limitLabel(l.kind), color: pal.dim }],
            topRight: [{ text: `${Math.round(l.pct)}%`, color: l.pct >= 80 ? pal.bad : l.pct >= 60 ? pal.warn : pal.text }],
          }),
        )}
      </Box>
    ) : null
  if (limits.length > 0) row += 3

  // ---- the agents' totals and the two lists ----
  const sum = summaryOf(d.agents, now)
  const totals = split(
    'totals',
    <Text wrap="truncate-end">
      <Text color={pal.dim} bold>
        AGENTS
      </Text>
      <Text color={pal.dim}>{d.agents.length > 0 ? `  ${sum.cost} · ${sum.tokens} tokens · ${sum.time}` : '  none yet'}</Text>
    </Text>,
    null,
  )
  row += 1

  const heading = (key: string, label: string, n: number, isLive: boolean, action?: { label: string; color: string; onPress: () => void }) => {
    const text = `${label} · ${n} `
    const right = action ? [` ${action.label}`] : []
    const rule = Math.max(0, full - [...text].length - right.reduce((s, t) => s + [...t].length, 0))
    return line(key, [
      <Text key="t" color={isLive ? pal.text : pal.dim} bold>
        {label}
      </Text>,
      <Text key="n" color={isLive ? pal.accent : pal.dim}>{` · ${n} `}</Text>,
      <Text key="r" color={pal.sep}>
        {'─'.repeat(rule)}
      </Text>,
      action ? button(`${key}-btn`, ` ${action.label}`, action.color, action.onPress) : null,
    ])
  }

  row += 1
  const runNeed = Math.max(1, working * RUN_ROWS)
  const doneNeed = Math.max(1, groups.finished.length)
  const avail = Math.max(0, d.bodyRows - row - 1)
  const rows = splitRows(avail, runNeed, doneNeed)
  const runShown = Math.max(1, Math.floor(rows.run / RUN_ROWS))
  const runMax = Math.max(0, working - runShown)
  const runOffset = Math.max(0, Math.min(runMax, d.runOffset))
  const runTop = row
  row += working > 0 ? Math.min(working, runShown) * RUN_ROWS : 1
  const runEnd = row
  row += 1
  const doneShown = Math.max(1, rows.done)
  const doneMax = Math.max(0, groups.finished.length - doneShown)
  const doneOffset = Math.max(0, Math.min(doneMax, d.doneOffset))
  const doneTop = row
  row += groups.finished.length > 0 ? Math.min(groups.finished.length, doneShown) : 1

  const bar = (key: string, rowsTall: number, total: number, shown: number, offset: number) => {
    const [a, b] = scrollThumb(rowsTall, total, shown, offset)
    return (
      <Box key={key} flexDirection="column" width={1} flexShrink={0}>
        {Array.from({ length: rowsTall }, (_, i) => (
          <Text key={i} color={i >= a && i < b ? pal.accent : pal.sep}>
            {i >= a && i < b ? '┃' : '│'}
          </Text>
        ))}
      </Box>
    )
  }

  const mark = (a: FdAgent): [string, string] =>
    a.status === 'running'
      ? ['✳', pal.accent]
      : a.status === 'waiting'
        ? ['‖', pal.warn]
        : a.status === 'done'
          ? ['✓', pal.good]
          : a.status === 'failed'
            ? ['✗', pal.bad]
            : ['■', pal.dim]
  const flat = (stops: string[], seed = 0): SbLook => ({ stops, track: pal.track, tint: pal.tint, tick, seed })

  const runScrolls = working > runShown
  const cardWidth = full - (runScrolls ? 1 : 0)
  const runCard = (a: FdAgent, i: number) => {
    const [glyph, glyphColor] = mark(a)
    const win = windowOf(a.model, main.model, usage.window)
    const ctx = win && a.ctxTokens > 0 ? Math.min(100, Math.round((a.ctxTokens / win) * 100)) : undefined
    const name = modelName(a.model)
    const metrics = agentMetrics(a, win, now).split('  ')
    const time = metrics.pop() ?? ''
    const stop: SbSeg = { text: '■ stop', color: pal.bad, onPress: () => d.onStop(a.id), key: `stop:${a.id}` }
    return sbFramedBar(k, `agent:${a.id}`, {
      width: cardWidth,
      color: a.status === 'waiting' ? pal.warn : pal.dim,
      bar: cells =>
        a.status === 'running'
          ? sbSweep(cells, sbWarm(k, 10 + i))
          : sbMeter(cells, (ctx ?? 0) / 100, flat([pal.warn, pal.warn], 10 + i)),
      top: [
        { text: `${glyph} `, color: glyphColor },
        { text: a.description || a.type || 'Subagent', color: pal.text, bold: true },
      ],
      topRight: [{ text: `${time} `, color: pal.dim }, stop],
      bottom: [
        { text: critterOf(a.id).name, color: pal.info },
        { text: `${name ? ` · ${name}` : ''}${a.type ? ` · ${a.type}` : ''}`, color: pal.dim },
      ],
      bottomRight: metrics.length > 0 ? [{ text: metrics.join(' '), color: pal.dim }] : [],
    })
  }

  const doneScrolls = groups.finished.length > doneShown
  const doneWidth = full - (doneScrolls ? 1 : 0)
  const doneLine = (a: FdAgent) => {
    const [glyph, glyphColor] = mark(a)
    const metrics = agentMetrics(a, windowOf(a.model, main.model, usage.window), now).split('  ')
    const time = metrics.pop() ?? ''
    return split(
      `done:${a.id}`,
      <Text wrap="truncate-end">
        <Text color={glyphColor}>{`${glyph} `}</Text>
        <Text color={pal.text}>{a.description || a.type || 'Subagent'}</Text>
        <Text color={pal.dim}>{` · ${critterOf(a.id).name}`}</Text>
      </Text>,
      <Box>
        <Text color={pal.dim}>{`${time} `}</Text>
        {button(`clear:${a.id}`, '✕', pal.dim, () => d.onClear(a.id))}
      </Box>,
      doneWidth,
    )
  }

  const runList =
    working === 0 ? (
      line('run-empty', <Text color={pal.dim}>{d.agents.length === 0 ? '  Subagents show here while they work.' : '  None running.'}</Text>)
    ) : (
      <Box key="run-list" width={full}>
        <Box flexDirection="column" width={cardWidth} flexShrink={0}>
          {groups.working.slice(runOffset, runOffset + runShown).map((a, i) => runCard(a, runOffset + i))}
        </Box>
        {runScrolls ? bar('run-scroll', Math.min(working, runShown) * RUN_ROWS, working, runShown, runOffset) : null}
      </Box>
    )
  const doneList =
    groups.finished.length === 0 ? (
      line('done-empty', <Text color={pal.dim}>{'  Nothing finished yet.'}</Text>)
    ) : (
      <Box key="done-list" width={full}>
        <Box flexDirection="column" width={doneWidth} flexShrink={0}>
          {groups.finished.slice(doneOffset, doneOffset + doneShown).map(doneLine)}
        </Box>
        {doneScrolls ? bar('done-scroll', Math.min(groups.finished.length, doneShown), groups.finished.length, doneShown, doneOffset) : null}
      </Box>
    )

  const parts: unknown[] = [
    header,
    ctxFrame,
    limitFrames,
    totals,
    heading('run-head', 'RUNNING', working, working > 0, working > 0 ? { label: '■ Stop all', color: pal.bad, onPress: d.onStopAll } : undefined),
    runList,
    heading('done-head', 'DONE', groups.finished.length, false, groups.finished.length > 0 ? { label: '✕ Clear', color: pal.dim, onPress: d.onClearAll } : undefined),
    doneList,
  ]

  const layout: PaneLayout = { run: [runTop, runEnd], done: [doneTop, row], runMax, doneMax }
  if (strip) return { el: sbFrame(k, strip, sbActions(d.ask), parts), layout }
  return {
    el: (
      <Box flexDirection="column" width="100%">
        {parts}
      </Box>
    ),
    layout,
  }
}


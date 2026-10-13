import type { FdAgent, FdMain, FdUsage } from '../types'
import { critterOf, critterPixels, rasterOf, svgOf } from './critter'
import {
  STATUS_WORD,
  agentMetrics,
  clip,
  fmtDuration,
  fmtUsd,
  groupAgents,
  isFinished,
  levelStops,
  limitLabel,
  modelName,
  summaryOf,
  width,
  windowLabel,
  windowOf,
  type Palette,
} from './logic'
import { pixelMeter, pixelRuns, pixelSweep, rasterCells, type Pixel } from './pixels'

export type PaneData = {
  pal: Palette
  main: FdMain
  usage: FdUsage
  agents: FdAgent[]
  tick: number
  now: number
  columns: number
}

const CRITTER = 12

/** The sidebar: a card for the main session, the subagents' totals, then a card per subagent. */
export function drawPane(els: Record<string, any>, isTerminal: boolean, d: PaneData) {
  const { Box, Text } = els
  const Raster = isTerminal && 'Raster' in els ? els.Raster : undefined
  const Svg = !isTerminal && 'Svg' in els ? els.Svg : undefined
  const { pal, main, usage, tick, now } = d
  const inner = Math.max(16, d.columns - 4)
  const groups = groupAgents(d.agents)

  // The terminal draws a meter as one Raster of braille pixels on the card's colour; other surfaces as coloured text.
  const meter = (key: string, pixels: Pixel[]) =>
    pixels.length === 0 ? null : Raster ? (
      <Raster key={key} columns={pixels.length} rows={1} cells={rasterCells(pixels, pal.panel)} />
    ) : (
      pixelRuns(pixels).map((r, i) => (
        <Text key={`${key}-${i}`} color={r.color}>
          {r.text}
        </Text>
      ))
    )
  const look = (stops: string[], seed = 0) => ({ stops, track: pal.track, tint: pal.tint, tick, seed })

  const card = (key: string, children: unknown, direction: 'row' | 'column' = 'column') => (
    <Box
      key={key}
      flexDirection={direction}
      columnGap={direction === 'row' ? 1 : undefined}
      borderStyle="round"
      borderColor={pal.border}
      backgroundColor={pal.panel}
      paddingX={1}
      width="100%"
    >
      {children}
    </Box>
  )

  // A row with text on the left that clips and text on the right that stays whole.
  const split = (key: string, left: unknown, right: unknown) => (
    <Box key={key} width="100%">
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

  // ---- header ----
  const working = groups.working.length
  const header = split(
    'header',
    <Text wrap="truncate-end">
      <Text color={pal.accent} bold>
        ✈ FLIGHTDECK
      </Text>
      <Text color={pal.dim}>{working > 0 ? ` · ${working} agent${working === 1 ? '' : 's'} working` : ' · no agents working'}</Text>
    </Text>,
    <Text>
      <Text color={pal.accent}>■</Text>
      <Text color={pal.dim}> main </Text>
      <Text color={pal.info}>■</Text>
      <Text color={pal.dim}> agents</Text>
    </Text>,
  )

  // ---- main session ----
  const model = modelName(main.model) || 'Main session'
  const size = windowLabel(usage.window)
  const effort = main.effort
  const stateText = main.isRunning ? '● working' : '○ idle'
  const top = split(
    'main-top',
    <Text wrap="truncate-end">
      <Text color={pal.accent}>◆ </Text>
      <Text color={pal.text} bold>
        {model}
      </Text>
      {size ? <Text color={pal.dim}>{` · ${size}`}</Text> : null}
      {effort ? <Text color={pal.dim}>{'  effort '}</Text> : null}
      {effort ? <Text color={pal.info} bold>{effort}</Text> : null}
    </Text>,
    <Text color={main.isRunning ? pal.good : pal.dim}>{stateText}</Text>,
  )

  const pct = usage.ctxPct ?? 0
  const pctText = usage.ctxPct === null ? '  —' : `${Math.round(pct)}%`.padStart(4)
  const cost = usage.costUsd !== null ? fmtUsd(usage.costUsd) : ''
  const ctxBar = Math.max(4, inner - 4 - 1 - width(pctText) - (cost ? width(cost) + 3 : 0))
  const ctxRow = (
    <Box key="main-ctx">
      <Text color={pal.dim}>ctx </Text>
      {meter('ctx', pixelMeter(ctxBar, pct / 100, look(levelStops(pct, pal), 1)))}
      <Text color={pal.text}>{` ${pctText}`}</Text>
      {cost ? <Text color={pal.dim}>{' · '}</Text> : null}
      {cost ? <Text color={pal.text}>{cost}</Text> : null}
    </Box>
  )

  const limits = usage.limits.slice(0, 2)
  const half = limits.length > 1 ? Math.floor((inner - 3) / 2) : inner
  const limitRow =
    limits.length > 0 ? (
      <Box key="main-limits">
        {limits.map((l, i) => {
          const label = `${limitLabel(l.kind)} `
          const value = ` ${Math.round(l.pct)}%`.padStart(5)
          const bar = Math.max(3, half - width(label) - width(value))
          return [
            i > 0 ? <Text key={`gap${i}`}>{'   '}</Text> : null,
            <Text key={`l${i}`} color={pal.dim}>
              {label}
            </Text>,
            meter(`lim${i}`, pixelMeter(bar, l.pct / 100, look(levelStops(l.pct, pal), 2 + i))),
            <Text key={`v${i}`} color={l.pct >= 80 ? pal.bad : l.pct >= 60 ? pal.warn : pal.text}>
              {value}
            </Text>,
          ]
        })}
      </Box>
    ) : null

  const turnMs = main.turnStartedAt > 0 ? (main.turnEndedAt > 0 ? main.turnEndedAt : now) - main.turnStartedAt : 0
  const turnText =
    main.turnStartedAt > 0 ? `${main.isRunning ? 'turn' : 'last turn'} ${fmtDuration(turnMs)}` : 'no turn yet'
  const footer = split(
    'main-foot',
    <Text color={pal.dim} wrap="truncate-end">
      {`${turnText} · ${main.steps} request${main.steps === 1 ? '' : 's'}`}
    </Text>,
    working > 0 ? <Text color={pal.info}>{`${working} running`}</Text> : null,
  )

  const mainCard = card('main', [top, ctxRow, limitRow, footer])

  // ---- subagents ----
  const textWidth = Math.max(8, inner - (Raster || Svg ? CRITTER + 1 : 0))
  const avatar = (a: FdAgent) => {
    const isBobbing = !isFinished(a)
    if (Raster) {
      const r = rasterOf(critterPixels(a.id, isBobbing && Math.floor(tick / 2) % 2 === 1), pal.panel)
      return <Raster key={`critter:${a.id}`} columns={r.columns} rows={r.rows} cells={r.cells} />
    }
    if (Svg) {
      const c = critterOf(a.id)
      return <Svg key={`critter:${a.id}`} source={svgOf(a.id, isBobbing)} alt={`${c.name}, a ${c.tint} critter in a ${c.hat}`} width={24} height={24} />
    }
    return null
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
  const agentBar = (a: FdAgent, i: number, ctx: number | undefined) =>
    a.status === 'running'
      ? pixelSweep(textWidth, look([pal.warmFrom, pal.warmTo], 10 + i))
      : a.status === 'done'
        ? pixelMeter(textWidth, 1, look([pal.goodFrom, pal.goodTo]))
        : a.status === 'failed'
          ? pixelMeter(textWidth, 1, look([pal.bad, pal.bad]))
          : pixelMeter(textWidth, (ctx ?? 0) / 100, look(a.status === 'waiting' ? [pal.warn, pal.warn] : [pal.sep, pal.dim], 10 + i))

  const agentCard = (a: FdAgent, i: number) => {
    const c = critterOf(a.id)
    const [glyph, glyphColor] = mark(a)
    const win = windowOf(a.model, main.model, usage.window)
    const ctx = win && a.ctxTokens > 0 ? Math.min(100, Math.round((a.ctxTokens / win) * 100)) : undefined
    const name = modelName(a.model)
    const isDone = isFinished(a)
    const body = (
      <Box key={`body:${a.id}`} flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text wrap="truncate-end">
          <Text color={glyphColor}>{`${glyph} `}</Text>
          <Text color={isDone ? pal.dim : pal.text} bold={!isDone}>
            {clip(a.description || a.type || 'Subagent', textWidth - 2)}
          </Text>
        </Text>
        <Text wrap="truncate-end">
          <Text color={pal.info}>{c.name}</Text>
          <Text color={pal.dim}>{a.type ? ` · ${a.type}` : ''}</Text>
        </Text>
        <Text wrap="truncate-end">
          <Text color={pal.text}>{name || '—'}</Text>
          <Text color={glyphColor}>{`  ${STATUS_WORD[a.status]}`}</Text>
        </Text>
        <Box>{meter(`bar:${a.id}`, agentBar(a, i, ctx))}</Box>
        <Text color={pal.dim} wrap="truncate-end">
          {agentMetrics(a, win, now)}
        </Text>
      </Box>
    )
    return card(`agent:${a.id}`, [avatar(a), body], 'row')
  }

  const sum = summaryOf(d.agents, now)
  const tileWidth = Math.max(8, Math.floor((d.columns - 2) / 3))
  const tile = (key: string, label: string, value: string) => (
    <Box key={key} flexDirection="column" width={tileWidth} flexGrow={1} flexShrink={1} borderStyle="round" borderColor={pal.border} backgroundColor={pal.panel} paddingX={1}>
      <Text color={pal.text} bold wrap="truncate-end">
        {value}
      </Text>
      <Text color={pal.dim} wrap="truncate-end">
        {label}
      </Text>
    </Box>
  )
  const tiles = (
    <Box key="tiles" width="100%" columnGap={1}>
      {tile('tile-cost', 'Cost', sum.cost)}
      {tile('tile-tokens', 'Tokens', sum.tokens)}
      {tile('tile-time', 'Time', sum.time)}
    </Box>
  )

  const section = (key: string, label: string, n: number, isLive: boolean) => (
    <Box key={key} marginTop={1}>
      <Text color={isLive ? pal.text : pal.dim} bold>
        {label}
      </Text>
      <Text color={isLive ? pal.accent : pal.dim}>{` · ${n}`}</Text>
    </Box>
  )

  const connector = (key: string) => (
    <Box key={key} marginLeft={2}>
      <Text color={working > 0 ? pal.info : pal.sep}>╎</Text>
    </Box>
  )

  const parts: unknown[] = [header, mainCard]
  if (d.agents.length === 0) {
    parts.push(
      connector('link'),
      card('empty', [
        <Text key="e1" color={pal.text} bold>
          No subagents yet
        </Text>,
        <Text key="e2" color={pal.dim} wrap="wrap">
          They show here while they work, each with its own critter.
        </Text>,
      ]),
    )
  } else {
    parts.push(connector('link'), tiles)
    if (groups.working.length > 0) {
      parts.push(section('working', 'Working', groups.working.length, true))
      groups.working.forEach((a, i) => parts.push(agentCard(a, i)))
    }
    if (groups.finished.length > 0) {
      parts.push(section('finished', 'Finished', groups.finished.length + groups.more, false))
      groups.finished.forEach((a, i) => parts.push(agentCard(a, i)))
      if (groups.more > 0) {
        parts.push(
          <Text key="more" color={pal.dim}>
            {`  +${groups.more} more finished`}
          </Text>,
        )
      }
    }
  }

  return (
    <Box flexDirection="column" width="100%">
      {parts}
    </Box>
  )
}

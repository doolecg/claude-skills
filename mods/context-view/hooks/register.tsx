import { atom, read, update } from 'claude-code'
import type { ContextBreakdownDetail, Register } from 'claude-code'

import {
  LIST_CAP,
  MCP_TOOL_CAP,
  agentRows,
  bandText,
  baseName,
  categoryRows,
  classifySquares,
  emptySquares,
  footerText,
  formatPercent,
  formatTokens,
  gridAlt,
  isEmpty,
  isNarrow,
  lastResponseText,
  layoutGrid,
  legendColor,
  mcpGroups,
  memoryRows,
  meterBar,
  meterOf,
  rasterOf,
  sectionTotal,
  shouldToast,
  shortModel,
  skillOrigin,
  skillRows,
  svgOf,
  themeOf,
} from './logic'
import type { Scheme, Square } from './logic'

export const snapshot = atom({ plugin: 'context-view', key: 'snapshot' } as const, null)
export const error = atom({ plugin: 'context-view', key: 'error' } as const, null)
export const selected = atom({ plugin: 'context-view', key: 'selected' } as const, null)
export const detail = atom({ plugin: 'context-view', key: 'detail' } as const, null)
export const open = atom({ plugin: 'context-view', key: 'open' } as const, {})
export const isCounting = atom({ plugin: 'context-view', key: 'isCounting' } as const, false)
export const bandPick = atom({ plugin: 'context-view', key: 'bandPick' } as const, null)
export const hasToasted = atom({ plugin: 'context-view', key: 'hasToasted' } as const, false)

// Fetches the breakdown and keeps it. Never throws: a failure is kept as a line the pane shows.
export async function refresh($: any, level: ContextBreakdownDetail = 'summary', columns?: number): Promise<void> {
  try {
    const usage = await $.session.usage({ breakdown: level, ...(columns ? { columns } : {}) })
    const breakdown = usage?.context?.breakdown
    if (!breakdown) {
      await update($, error, () => 'Context numbers are not available in this session.')
      return
    }
    await update($, snapshot, () => ({ breakdown, detail: level }))
    await update($, error, () => null)
    const empty = isEmpty(breakdown)
    if (shouldToast(meterOf(breakdown).level, await read($, hasToasted), empty)) {
      await update($, hasToasted, () => true)
      const m = meterOf(breakdown)
      $.ui.toast(`Context is at ${Math.round(m.ratio * 100)}% of ${m.isAutoCompact ? 'the auto-compact point' : 'the window'}. Run /compact to free space.`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, error, () => `Could not read context numbers: ${message}`).catch(() => undefined)
  }
}

export async function resetAll($: any): Promise<void> {
  await update($, snapshot, () => null)
  await update($, error, () => null)
  await update($, selected, () => null)
  await update($, detail, () => null)
  await update($, isCounting, () => false)
  await update($, hasToasted, () => false)
}

const PANE = 'ctx'
const TITLE = 'Context'

let lastColumns: number | undefined

const LEVEL_COLOR = { ok: 'inactive', amber: 'warning', red: 'error' } as const

async function bandIsOn($: any, showBand: boolean): Promise<boolean> {
  const pick = await read($, bandPick)
  return pick && pick.from === showBand ? pick.value : showBand
}

// Writes the plugin's own config row; if that is refused, keeps the choice in the store instead.
async function setBand($: any, showBand: boolean, value: boolean): Promise<void> {
  await update($, bandPick, () => ({ value, from: showBand }))
  let isSaved = false
  try {
    const res = await $.config.set({ key: 'context-view.showBand', value })
    isSaved = res?.deny === undefined
  } catch {}
  try {
    if (isSaved) await $.store.delete('bandPick')
    else await $.store.set('bandPick', { value, from: showBand })
  } catch {}
}

export const register: Register = (on, options) => {
  const showBand = options.showBand === true

  on('session.start', async ($, e, next) => {
    try {
      const saved = (await $.store.get('bandPick')) as { value?: unknown; from?: unknown } | undefined
      if (saved && typeof saved.value === 'boolean') await update($, bandPick, () => ({ value: saved.value, from: saved.from === true }))
    } catch {}
    await $.command.register({
      name: 'ctx',
      description: 'Show the context window, filled the way /context draws it',
      immediate: true,
    })
    await resetAll($)
    await refresh($)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await resetAll($)

    return next(e)
  })

  on('command.run', { command: 'ctx' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words[0] === 'band') {
      if (words[1] === 'on' || words[1] === 'off') {
        await setBand($, showBand, words[1] === 'on')
        return { text: `Context meter above the prompt: ${words[1]}.` }
      }
      if (words.length === 1) return { text: `Context meter above the prompt: ${(await bandIsOn($, showBand)) ? 'on' : 'off'}. Use /ctx band on or /ctx band off.` }
    }
    await refresh($, 'summary', lastColumns)
    const snap = await read($, snapshot)
    const placed = await $.ui.open({ id: PANE, title: TITLE })
    if (placed.isPlaced) return { text: 'Context view opened.' }
    const line = snap && !isEmpty(snap.breakdown) ? bandText(snap.breakdown) : 'No context reported yet'

    return { text: `${line}. Make the window wider to see the context view.` }
  })

  on('session.measure', async ($, e, next) => {
    const out = await next(e)
    if (e.changed.includes('context')) await refresh($, 'summary', lastColumns)

    return out
  })

  on('session.compact', async ($, e, next) => {
    const out = await next(e)
    if (e.trigger !== 'precompute' && e.agentId === undefined) {
      await refresh($, 'summary', lastColumns)
    }

    return out
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || !(await bandIsOn($, showBand))) return below
    const snap = await read($, snapshot)
    if (!snap || isEmpty(snap.breakdown)) return below

    const { Box, Text, Button } = $.ui.resolve(e)
    const m = meterOf(snap.breakdown)
    const color = LEVEL_COLOR[m.level]
    const mine = (
      <Box>
        <Text color={color}>{bandText(snap.breakdown)} </Text>
        <Text color={color}>{meterBar(m.ratio)}</Text>
        {m.level === 'red' && <Text color="error"> nearly full, you can run /compact </Text>}
        <Button key="band-off" plain label="Off" onPress={() => setBand($, showBand, false)} />
      </Box>
    )

    return <Box flexDirection="column">{below ? [mine, below] : [mine]}</Box>
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    lastColumns = e.props.bodyColumns
    const narrow = isNarrow(e.props.bodyColumns)
    const snap = await read($, snapshot)
    const err = await read($, error)
    const selectedName = await read($, selected)
    const detailKey = await read($, detail)
    const opened = await read($, open)
    const counting = await read($, isCounting)
    const isBandOn = await bandIsOn($, showBand)
    const bandToggle = (
      <Button key="band-toggle" label={`Band: ${isBandOn ? 'on' : 'off'}`} onPress={() => setBand($, showBand, !isBandOn)} />
    )
    let scheme: Scheme = 'neutral'
    try {
      scheme = themeOf(await $.config.list())
    } catch {}

    const b = snap?.breakdown
    const empty = !b || isEmpty(b)

    let squares: Square[][]
    if (b && !empty) squares = layoutGrid(classifySquares(b.gridRows, b.categories), narrow)
    else squares = emptySquares(narrow)
    const sel = empty ? null : selectedName

    let gridEl
    if (e.surface === 'terminal') {
      const r = rasterOf(squares, scheme, sel)
      const { Raster } = $.ui.resolve(e)
      gridEl = <Raster key="grid" columns={r.columns} rows={r.rows} cells={r.cells} />
    } else {
      const s = svgOf(squares, scheme, sel)
      const { Svg } = $.ui.resolve(e as Extract<typeof e, { surface: 'desktop' | 'vscode' | 'mobile' }>)
      gridEl = <Svg source={s.source} alt={gridAlt(squares, sel)} width={s.width} height={s.height} />
    }

    if (!b || empty) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Context window</Text>
          {gridEl}
          <Text>No context reported yet</Text>
          <Text dimColor>The numbers appear after the first response.</Text>
          {bandToggle}
          {err && <Text color="error">{err}</Text>}
        </Box>
      )
    }

    const m = meterOf(b)
    const rows = categoryRows(b)
    const nameWidth = Math.max(...rows.map(r => r.name.length))
    const toggle = (key: string) => update($, open, o => ({ ...o, [key]: !o[key] }))
    const pick = (name: string) => update($, selected, s => (s === name ? null : name))
    const show = (key: string) => update($, detail, d => (d === key ? null : key))

    const legend = rows.map(r => {
      const isDeferred = r.kind === 'deferred'
      const mark = r.kind === 'used' ? '■' : r.kind === 'buffer' ? '▒' : '□'
      const text = `${r.name.padEnd(nameWidth)}  ${formatTokens(r.tokens).padStart(6)}  ${isDeferred ? 'on demand' : formatPercent(r.percent).padStart(6)}`
      return (
        <Box flexDirection="column">
          <Button key={`cat:${r.name}`} plain label={`Highlight ${r.name}`} dimColor={isDeferred} onPress={() => pick(r.name)}>
            <Text color={isDeferred || r.kind === 'free' ? 'inactive' : legendColor(r.color, scheme)}>{mark}</Text>
            {` ${selectedName === r.name ? '>' : ' '} ${text}`}
          </Button>
          {isDeferred && <Text dimColor>{'    loaded on demand, not in the window'}</Text>}
        </Box>
      )
    })

    const picked = selectedName ? rows.find(r => r.name === selectedName) : undefined
    const pickedLine = picked
      ? `Highlighted: ${picked.name}, ${formatTokens(picked.tokens)} tokens${picked.kind === 'deferred' ? ' (not drawn in the grid)' : ` (${formatPercent(picked.percent)})`}`
      : null

    const header = (key: string, title: string, count: number, tokens: number) => (
      <Button key={`sec:${key}`} plain label={`${opened[key] ? 'Collapse' : 'Expand'} ${title}`} onPress={() => toggle(key)}>
        {`${opened[key] ? 'v' : '>'} ${title} · ${count} · ${formatTokens(tokens)}`}
      </Button>
    )

    const memory = memoryRows(b.memoryFiles)
    const groups = mcpGroups(b.mcpTools)
    const agents = agentRows(b.agents)
    const skills = skillRows(b.skills?.skillFrontmatter)
    const more = (n: number) => (n > 0 ? <Text dimColor>{`  +${n} more`}</Text> : null)

    const sections = (
      <Box flexDirection="column">
        {header('memory', 'Memory files', memory.length, sectionTotal(memory))}
        {opened.memory &&
          memory.map((f, i) => (
            <Box flexDirection="column">
              <Button key={`mem:${i}`} plain label={`Show path of ${baseName(f.path)}`} onPress={() => show(`mem:${f.path}`)}>
                {`  ${baseName(f.path)}  ${formatTokens(f.tokens)}  ${f.type}`}
              </Button>
              {detailKey === `mem:${f.path}` && <Text>{`    Path: ${f.path}`}</Text>}
            </Box>
          ))}
        {header('mcp', 'MCP tools', b.mcpTools.length, sectionTotal(b.mcpTools))}
        {opened.mcp &&
          groups.map(g => (
            <Box flexDirection="column">
              <Text bold>{`  ${g.server} · ${g.count} tools · ${formatTokens(g.total)}${g.onDemand ? ` · ${g.onDemand} on demand` : ''}`}</Text>
              {g.tools.slice(0, MCP_TOOL_CAP).map(t => (
                <Text dimColor={!t.isLoaded}>{`    ${t.name}  ${formatTokens(t.tokens)}${t.isLoaded ? '' : '  on demand'}`}</Text>
              ))}
              {more(g.tools.length - MCP_TOOL_CAP)}
            </Box>
          ))}
        {header('agents', 'Custom agents', agents.length, sectionTotal(agents))}
        {opened.agents &&
          agents.slice(0, LIST_CAP).map(a => <Text>{`  ${a.agentType}  ${formatTokens(a.tokens)}  ${a.source}`}</Text>)}
        {opened.agents && more(agents.length - LIST_CAP)}
        {header('skills', 'Skills', skills.length, b.skills?.tokens ?? 0)}
        {opened.skills && b.skills && (
          <Text dimColor>{`  ${b.skills.includedSkills} of ${b.skills.totalSkills} skills listed`}</Text>
        )}
        {opened.skills &&
          skills.slice(0, LIST_CAP).map((s, i) => (
            <Box flexDirection="column">
              <Button key={`skill:${i}`} plain label={`Show where ${s.name} comes from`} onPress={() => show(`skill:${s.name}`)}>
                {`  ${s.name}  ${formatTokens(s.tokens)}`}
              </Button>
              {detailKey === `skill:${s.name}` && (
                <Text>{`    ${skillOrigin(s)}. The context report gives no file path for skills.`}</Text>
              )}
            </Box>
          ))}
        {opened.skills && more(skills.length - LIST_CAP)}
        {header('commands', 'Slash commands', b.slashCommands?.totalCommands ?? 0, b.slashCommands?.tokens ?? 0)}
        {opened.commands && b.slashCommands && (
          <Text dimColor>{`  ${b.slashCommands.includedCommands} of ${b.slashCommands.totalCommands} commands listed in ${formatTokens(b.slashCommands.tokens)} tokens`}</Text>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection={narrow ? 'column' : 'row'} gap={narrow ? 1 : 3}>
          {gridEl}
          <Box flexDirection="column">
            <Text bold>{shortModel(b.model)}</Text>
            <Text color={LEVEL_COLOR[m.level]}>{`${formatTokens(m.tokens)} / ${formatTokens(m.window)} tokens (${m.percent}%)`}</Text>
            {legend}
          </Box>
        </Box>
        {pickedLine && <Text>{pickedLine}</Text>}
        {sections}
        <Box flexDirection="column">
          <Text>{footerText(b)}</Text>
          <Text dimColor>{lastResponseText(b.apiUsage)}</Text>
          {m.level === 'red' && <Text color="error">Context is nearly full. You can run /compact to free space.</Text>}
        </Box>
        <Box flexDirection="column">
          {counting ? (
            <Text dimColor>Counting…</Text>
          ) : (
            <Button
              key="exact"
              label="Count exactly"
              onPress={async () => {
                await update($, isCounting, () => true)
                await refresh($, 'full', lastColumns)
                await update($, isCounting, () => false)
              }}
            />
          )}
          <Text dimColor>
            {snap?.detail === 'full'
              ? 'Exact count, made with the token-count API. The next turn goes back to the free estimate.'
              : 'Estimated for free. Count exactly sends one token-count request per tool and memory file.'}
          </Text>
          {bandToggle}
          {err && <Text color="error">{err}</Text>}
        </Box>
      </Box>
    )
  })
}

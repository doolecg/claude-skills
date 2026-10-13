import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { WorkReportTab } from '../types'
import {
  DEFAULT_SETTINGS,
  KINDS,
  KIND_LABEL,
  TABS,
  TAB_LABEL,
  TITLE,
  addTask,
  bigNumber,
  buildChart,
  chartBars,
  classify,
  dateSpan,
  dayKey,
  dollarsFor,
  formatHours,
  hoursFor,
  isTypedOrigin,
  modelName,
  parseSettingsArgs,
  rangeKeys,
  streak,
  sumDays,
  tileCount,
} from './logic'
import type { Days, Settings, Tab, ToolUse } from './logic'

const PANE = 'work-report'
const GOLD = '#F2C46D'
const HAIR = '#262B33'
const MUTED = '#7D8590'
const TEXT = '#E6EDF3'
const GREEN = '#3DD68C'
const AMBER = '#E3B341'
const DARK = '#10141A'
const BAR = '#5B6573'
const KIND_COLOR = {
  emails: '#58A6FF',
  documents: '#BC8CFF',
  media: '#F778BA',
  research: '#39C5CF',
  other: '#7D8590',
} as const

const tabAtom = atom({ plugin: 'work-report', key: 'tab' } as const, 'today' as WorkReportTab)
const revAtom = atom({ plugin: 'work-report', key: 'rev' } as const, 0)

const readDays = async ($: { store: { get: (k: string) => Promise<unknown> } }): Promise<Days> => {
  const raw = await $.store.get('days')
  return raw !== null && typeof raw === 'object' ? (raw as Days) : {}
}
const readSettings = async ($: { store: { get: (k: string) => Promise<unknown> } }): Promise<Settings> => {
  const raw = await $.store.get('settings')
  return { ...DEFAULT_SETTINGS, ...(raw !== null && typeof raw === 'object' ? (raw as Partial<Settings>) : {}) }
}

const fit = (text: string, width: number): string =>
  text.length > width ? text.slice(0, Math.max(0, width)) : text.padEnd(width, ' ')

export const register: Register = on => {
  let current = { isTyped: false, uses: [] as ToolUse[] }
  let writes: Promise<void> = Promise.resolve()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'report',
      description: 'Show what Claude has done for you: tasks, hours saved, value',
      argumentHint: 'settings [rate|emails|documents|images|research|other <number>]',
    })

    return next(e)
  })

  on('command.run', { command: 'report' }, async ($, e) => {
    try {
      const settings = await readSettings($)
      const parsed = parseSettingsArgs(e.args, settings)
      if (parsed.text === '') {
        void $.ui.open({ id: PANE, title: 'Work report' })

        return { text: 'Opening the work report.' }
      }
      if (parsed.settings !== settings) {
        await $.store.set('settings', parsed.settings)
        await update($, revAtom, n => (n ?? 0) + 1)
      }

      return { text: parsed.text }
    } catch {
      return { text: 'Sorry, the work report could not do that just now.' }
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.turnId === undefined) {
      current = { isTyped: isTypedOrigin(e.origin.kind, e.text), uses: [] }
    }

    return next(e)
  })

  on('tool.call', ($, e, next) => {
    const input = e as unknown as { file_path?: unknown; notebook_path?: unknown }
    const path = [input.file_path, input.notebook_path].find(p => typeof p === 'string') as string | undefined
    current.uses.push({ tool: String(e.tool), path })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.reason === 'answer' && current.isTyped) {
      const done = current
      current = { isTyped: false, uses: [] }
      const model = e.usage?.model ?? 'unknown'
      const now = await $.clock.now()
      writes = writes.then(async () => {
        try {
          const days = await readDays($)
          await $.store.set('days', addTask(days, dayKey(now), classify(done.uses), model))
          await update($, revAtom, n => (n ?? 0) + 1)
        } catch {
          // a failed save must never disturb the turn
        }
      })
      await writes
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    await read($, revAtom)
    const days = await readDays($)
    const today = dayKey(await $.clock.now())
    const n = days[today]?.tasks ?? 0
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Button key="open-report" plain onPress={() => void $.ui.open({ id: PANE, title: 'Work report' })}>
          <Text dimColor>Work report: {n === 1 ? '1 task' : `${n} tasks`} today</Text>
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(10, e.props.bodyColumns || 60)
    await read($, revAtom)
    const tab: Tab = await read($, tabAtom)
    const days = await readDays($)
    const settings = await readSettings($)
    const today = dayKey(await $.clock.now())
    const keys = rangeKeys(tab, today)
    const total = sumDays(days, keys)
    const hours = hoursFor(total.kinds, settings)
    const dollars = dollarsFor(total.kinds, settings)

    const rule = (name: string) => (
      <Box width={width}>
        <Text color={MUTED} wrap="truncate">
          {name.toUpperCase()}{' '}
        </Text>
        <Text color={HAIR} wrap="truncate">
          {'─'.repeat(Math.max(0, width - name.length - 1))}
        </Text>
      </Box>
    )

    const tile = (label: string, value: string, note: string, color: string, tw: number) => {
      const big = bigNumber(value)
      const inner = tw - 4
      const isBig = big !== undefined && (big[0]?.length ?? 99) <= inner
      return (
        <Box key={label} flexDirection="column" borderStyle="round" borderColor={HAIR} paddingX={1} width={tw}>
          <Text color={MUTED} wrap="truncate">
            {label}
          </Text>
          {isBig && big ? (
            big.map((row, i) => (
              <Text key={`r${i}`} color={color} bold wrap="truncate">
                {row}
              </Text>
            ))
          ) : (
            <Text color={color} bold wrap="truncate">
              {value}
            </Text>
          )}
          <Text dimColor wrap="truncate">
            {note}
          </Text>
        </Box>
      )
    }

    const chip = (id: Tab) => (
      <Button key={`tab-${id}`} plain onPress={() => update($, tabAtom, () => id)}>
        {id === tab ? (
          <Text backgroundColor={GOLD} color={DARK} bold>
            {` ${TAB_LABEL[id]} `}
          </Text>
        ) : (
          <Text backgroundColor={HAIR} color={TEXT}>
            {` ${TAB_LABEL[id]} `}
          </Text>
        )}
      </Button>
    )

    const header = (
      <Box flexDirection="column" width={width}>
        <Text bold color={TEXT}>
          WORK REPORT
        </Text>
        <Box width={width}>
          <Text color={GOLD}>{'━'.repeat(Math.min(11, width))}</Text>
          <Text color={HAIR}>{'─'.repeat(Math.max(0, width - 11))}</Text>
        </Box>
        <Box gap={1} marginTop={1}>
          {TABS.map(chip)}
        </Box>
        <Box width={width} justifyContent="space-between" marginTop={1}>
          <Text bold color={TEXT} wrap="truncate">
            {TITLE[tab]}
          </Text>
          <Text color={MUTED} wrap="truncate">
            {dateSpan(tab, today)}
          </Text>
        </Box>
      </Box>
    )

    if (total.tasks === 0) {
      return (
        <Box flexDirection="column" width={width}>
          {header}
          <Box marginTop={1}>
            <Text color={MUTED} wrap="wrap">
              {tab === 'today'
                ? 'Nothing finished yet today. Your first finished task shows up here.'
                : 'Nothing finished in this period yet. Finished tasks show up here.'}
            </Text>
          </Box>
        </Box>
      )
    }

    const n = tileCount(width)
    const tw = Math.floor((width - (n - 1)) / n)
    const tiles = [
      tile('HOURS SAVED (EST.)', formatHours(hours), 'estimate', GREEN, tw),
      tile('TASKS DONE', String(total.tasks), 'finished answers', TEXT, tw),
      tile('WORTH (EST.)', `$${dollars}`, `at $${settings.rate} an hour`, GOLD, tw),
    ].slice(0, n)

    const rightW = 12
    const lw = Math.max(8, Math.min(18, width - rightW - 7))
    const bw = Math.max(1, width - lw - 1 - rightW)
    const maxKind = Math.max(1, ...KINDS.map(k => total.kinds[k]))
    const models = Object.entries(total.models)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    const maxModel = Math.max(1, ...models.map(m => m[1]))
    const bar = (value: number, max: number) => '█'.repeat(value <= 0 ? 0 : Math.max(1, Math.round((value / max) * bw)))

    const bars = chartBars(tab, days, today)
    const chart = buildChart(bars, width)
    const best =
      tab === 'month' || tab === 'year'
        ? bars.reduce((a, b) => (b.value > a.value ? b : a), bars[0] ?? { label: '', value: 0, isNow: false })
        : undefined
    let summary: string
    if (best) {
      const what = tab === 'year' ? 'month' : 'day'
      summary = `Best ${what}: ${best.label}, ${best.value} ${best.value === 1 ? 'task' : 'tasks'}. Active days: ${total.activeDays}.`
    } else {
      const s = streak(days, today)
      summary = s === 0 ? 'No streak running yet.' : `Streak: ${s} ${s === 1 ? 'day' : 'days'} in a row.`
    }

    return (
      <Box flexDirection="column" width={width}>
        {header}
        <Box marginTop={1} gap={1}>
          {tiles}
        </Box>
        <Box marginTop={1}>{rule('Where the time went')}</Box>
        {KINDS.map(kind => (
          <Box key={kind} width={width}>
            <Text color={TEXT} wrap="truncate">
              {fit(KIND_LABEL[kind], lw)}{' '}
            </Text>
            <Text color={KIND_COLOR[kind]} wrap="truncate">
              {fit(bar(total.kinds[kind], maxKind), bw)}
            </Text>
            <Text color={MUTED} wrap="truncate">
              {fit(` ${total.kinds[kind]} / ${formatHours((total.kinds[kind] * settings[kind]) / 60)}h`, rightW)}
            </Text>
          </Box>
        ))}
        <Box marginTop={1}>{rule('Who did the work')}</Box>
        {models.map(([model, count]) => (
          <Box key={model} width={width}>
            <Text color={TEXT} wrap="truncate">
              {fit(modelName(model), lw)}{' '}
            </Text>
            <Text color={GOLD} wrap="truncate">
              {fit(bar(count, maxModel), bw)}
            </Text>
            <Text color={MUTED} wrap="truncate">
              {fit(` ${count}`, rightW)}
            </Text>
          </Box>
        ))}
        <Box marginTop={1}>{rule(tab === 'year' ? 'Tasks per month' : 'Tasks per day')}</Box>
        {chart.rows.map((row, i) => (
          <Box key={`c${i}`} width={width}>
            {row.map((seg, j) => (
              <Text key={`s${j}`} color={seg.isNow ? GOLD : BAR} wrap="truncate">
                {seg.text}
              </Text>
            ))}
          </Box>
        ))}
        <Text dimColor wrap="truncate">
          {chart.labels}
        </Text>
        <Box marginTop={1}>
          <Text color={AMBER} wrap="truncate">
            {summary}
          </Text>
        </Box>
        <Text dimColor wrap="truncate">
          Hours and dollars are estimates. /report settings changes them.
        </Text>
      </Box>
    )
  })
}

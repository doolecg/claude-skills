import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { CHALLENGES, TOTAL, themeColor } from './challenges'
import {
  EMPTY,
  bestStreak,
  bigNumber,
  canSwap,
  center,
  coachRequest,
  complete,
  currentStreak,
  dayKey,
  doneCount,
  ensureToday,
  isFinished,
  isTodayDone,
  lastDays,
  prettyDay,
  sanitize,
  swap,
  todayIdx,
  undo,
  wrap,
} from './logic'
import type { Progress } from './logic'

const PANE = 'daily-challenge'
const TITLE = 'Daily challenge'
const STORE_KEY = 'progress'

const GOLD = '#F2C46D'
const HAIR = '#262B33'
const MUTED = '#7D8590'
const TEXT = '#E6EDF3'
const GREEN = '#3DD68C'
const AMBER = '#E3B341'
const INK = '#14171C'

const progress = atom({ plugin: 'daily-challenge', key: 'progress' } as const, EMPTY)

async function today($: EngineInterface): Promise<string> {
  return dayKey(await $.clock.now())
}

async function mutate($: EngineInterface, change: (p: Progress) => Progress): Promise<Progress> {
  let next: Progress = EMPTY
  await update($, progress, current => {
    next = change(sanitize(current))
    return next
  })
  await $.store.set(STORE_KEY, next)
  return next
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: TITLE, rows: 34 })
}

function summary(p: Progress, day: string): string {
  const streak = currentStreak(p, day)
  return `Streak ${streak} ${streak === 1 ? 'day' : 'days'}, ${doneCount(p)} of ${TOTAL} done.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      const saved = sanitize(await $.store.get(STORE_KEY))
      await update($, progress, () => saved)
    } catch {
      // the pane still opens, with an empty record
    }
    try {
      await $.command.register({
        name: 'challenge',
        description: 'Open your daily challenge (also: done, another)',
        argumentHint: '[done|another]',
      })
    } catch {
      // no command this session; the status button still opens the pane
    }

    return next(e)
  })

  on('command.run', { command: 'challenge' }, async ($, e) => {
    try {
      const arg = e.args.trim().toLowerCase()
      const day = await today($)
      const current = sanitize(await read($, progress))

      if (arg === '') {
        void openPane($).catch(() => {})
        return { text: `Opening your daily challenge. ${summary(current, day)}` }
      }

      if (arg === 'done') {
        if (isFinished(current)) return { text: `All ${TOTAL} challenges are done. Well done.` }
        if (isTodayDone(current, day)) {
          return { text: `Today's challenge is already complete. ${summary(current, day)}` }
        }
        const next = await mutate($, p => complete(p, day))
        const idx = todayIdx(next, day)
        const name = idx === null ? '' : ` "${CHALLENGES[idx]!.title}"`
        return { text: `Completed${name}. ${summary(next, day)}` }
      }

      if (arg === 'another') {
        if (!canSwap(current, day)) {
          return {
            text: isTodayDone(current, day)
              ? "Today's challenge is already complete. A new one is waiting tomorrow."
              : 'There is no other challenge left to swap in.',
          }
        }
        const next = await mutate($, p => swap(p, day, Math.random))
        const idx = todayIdx(next, day)
        return { text: `Swapped. Today's challenge is now "${CHALLENGES[idx!]!.title}".` }
      }

      return { text: 'Try /challenge, /challenge done or /challenge another.' }
    } catch {
      return { text: 'The daily challenge could not do that just now. Please try again.' }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const p = sanitize(await read($, progress))
    const day = await today($)
    const { Box, Text, Button } = $.ui.resolve(e)
    const isDone = isTodayDone(p, day)
    const streak = currentStreak(p, day)
    const state = isFinished(p) ? 'all done' : isDone ? 'done today' : 'waiting'
    const color = isDone || isFinished(p) ? GREEN : AMBER

    return (
      <Box flexDirection="row">
        <Text dimColor>Daily challenge </Text>
        <Text color={color}>{state}</Text>
        <Text dimColor>{streak > 0 ? `  streak ${streak}  ` : '  '}</Text>
        <Button key="open-challenge" label="Open" onPress={() => openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const W = Math.max(24, e.props.bodyColumns)
    const p = sanitize(await read($, progress))
    const day = await today($)
    const finished = isFinished(p)
    const idx = todayIdx(p, day)
    const isDone = isTodayDone(p, day)
    const streak = currentStreak(p, day)
    const done = doneCount(p)
    const left = TOTAL - done

    const line = (text: string, color: string, bold = false) => (
      <Text color={color} bold={bold} wrap="truncate">
        {text}
      </Text>
    )

    const heading = (label: string) => (
      <Box flexDirection="row" width={W} marginTop={1}>
        <Text color={MUTED}>{label + ' '}</Text>
        <Text color={HAIR} wrap="truncate">
          {'─'.repeat(Math.max(0, W - label.length - 1))}
        </Text>
      </Box>
    )

    const name = 'DAILY CHALLENGE'
    const date = prettyDay(day)
    const titleRow = (
      <Box flexDirection="column" width={W}>
        <Box flexDirection="row" justifyContent="space-between" width={W}>
          <Text bold color={TEXT}>
            {name}
          </Text>
          {W >= name.length + date.length + 2 && <Text color={MUTED}>{date}</Text>}
        </Box>
        <Box flexDirection="row" width={W}>
          <Text color={GOLD}>{'━'.repeat(name.length)}</Text>
          <Text color={HAIR} wrap="truncate">
            {'─'.repeat(Math.max(0, W - name.length))}
          </Text>
        </Box>
      </Box>
    )

    const stats = [
      { label: 'DAY STREAK', value: streak, sub: 'in a row', color: streak > 0 ? GOLD : MUTED },
      { label: 'COMPLETED', value: done, sub: `of ${TOTAL}`, color: GREEN },
      { label: 'BEST STREAK', value: bestStreak(p), sub: 'in a row', color: TEXT },
    ]
    let tiles
    if (W >= 44) {
      const tileW = Math.floor((W - 2) / 3)
      const inner = tileW - 2
      tiles = (
        <Box flexDirection="row" gap={1} width={W} marginTop={1}>
          {stats.map(s => (
            <Box key={s.label} flexDirection="column" width={tileW} borderStyle="round" borderColor={HAIR}>
              {line(center(s.label, inner), MUTED)}
              {bigNumber(s.value).map((row, i) => (
                <Text key={String(i)} color={s.color} bold wrap="truncate">
                  {center(row, inner)}
                </Text>
              ))}
              {line(center(s.sub, inner), MUTED)}
            </Box>
          ))}
        </Box>
      )
    } else {
      tiles = (
        <Box flexDirection="column" width={W} marginTop={1}>
          {stats.map(s => (
            <Box key={s.label} flexDirection="row" justifyContent="space-between" width={W}>
              <Text color={MUTED}>{s.label}</Text>
              <Text color={s.color} bold>
                {String(s.value)}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    const bar = () => {
      const filled = done === 0 ? 0 : Math.min(W, Math.max(1, Math.round((done / TOTAL) * W)))
      return (
        <Box flexDirection="column" width={W}>
          {heading('YOUR YEAR')}
          <Box flexDirection="row" width={W}>
            <Text color={finished ? GREEN : GOLD}>{'━'.repeat(filled)}</Text>
            <Text color={HAIR}>{'─'.repeat(W - filled)}</Text>
          </Box>
          <Box flexDirection="row" justifyContent="space-between" width={W}>
            <Text color={GREEN}>{`${done} done`}</Text>
            <Text color={MUTED}>{`${left} to go`}</Text>
          </Box>
        </Box>
      )
    }

    const footer = (
      <Box flexDirection="column" width={W} marginTop={1}>
        {wrap('If a command is not on your version, ask Claude how to do it.', W).map((l, i) => (
          <Text key={String(i)} color={MUTED} wrap="truncate">
            {l}
          </Text>
        ))}
      </Box>
    )

    if (finished || idx === null) {
      const lines = wrap(
        'You have finished all 365 challenges. Thank you for sticking with it. Everything you tried is yours to keep using.',
        W - 4,
      )
      return (
        <Box flexDirection="column" width={W}>
          {titleRow}
          {tiles}
          {heading('ALL DONE')}
          <Box flexDirection="column" width={W} borderStyle="round" borderColor={GREEN} paddingX={1}>
            {line('ALL 365 COMPLETE', GREEN, true)}
            {lines.map((l, i) => (
              <Text key={String(i)} color={TEXT} wrap="truncate">
                {l}
              </Text>
            ))}
          </Box>
          {bar()}
          {footer}
        </Box>
      )
    }

    const c = CHALLENGES[idx]!
    const taskLines = wrap(c.task, W - 4)
    const titleLines = wrap(c.title, W - 4)

    const chip = (text: string, bg: string, fg: string, bold: boolean) => (
      <Text backgroundColor={bg} color={fg} bold={bold}>
        {` ${text} `}
      </Text>
    )
    const canAnother = !isDone && canSwap(p, day)
    const buttons = isDone ? (
      <Box flexDirection="column" width={W} marginTop={1}>
        {line('Completed today', GREEN, true)}
        {line('A new challenge is waiting tomorrow.', MUTED)}
        <Box flexDirection="row">
          <Button key="undo" plain dimColor hotkey="u" onPress={() => mutate($, q => undo(q, day))}>
            Undo
          </Button>
        </Box>
      </Box>
    ) : (
      <Box flexDirection={W >= 58 ? 'row' : 'column'} gap={1} width={W} marginTop={1}>
        <Button
          key="complete"
          plain
          hotkey="c"
          onPress={() => mutate($, q => complete(q, day))}
        >
          {chip('Mark complete', GOLD, INK, true)}
        </Button>
        <Button
          key="coach"
          plain
          hotkey="g"
          onPress={async () => {
            const target = CHALLENGES[idx]!
            await $.prompt.fill({ text: coachRequest(target.title, target.task), mode: 'replace' })
            await $.ui.close({ id: PANE })
          }}
        >
          {chip('Coach me through it', HAIR, TEXT, false)}
        </Button>
        {canAnother && (
          <Button
            key="another"
            plain
            hotkey="a"
            onPress={() => mutate($, q => swap(q, day, Math.random))}
          >
            {chip('Give me another', HAIR, TEXT, false)}
          </Button>
        )}
      </Box>
    )

    const count = W >= 42 ? 14 : 7
    const squares = lastDays(p, day, count)

    return (
      <Box flexDirection="column" width={W}>
        {titleRow}
        {tiles}
        {heading("TODAY'S CHALLENGE")}
        <Box flexDirection="column" width={W} borderStyle="round" borderColor={isDone ? GREEN : GOLD} paddingX={1}>
          {line(c.theme.toUpperCase(), themeColor(c.theme))}
          {titleLines.map((l, i) => (
            <Text key={String(i)} bold color={TEXT} wrap="truncate">
              {l}
            </Text>
          ))}
          {line('', TEXT)}
          {taskLines.map((l, i) => (
            <Text key={String(i)} color={TEXT} wrap="truncate">
              {l}
            </Text>
          ))}
        </Box>
        {buttons}
        {heading(`LAST ${count} DAYS`)}
        <Box flexDirection="row" width={W}>
          {squares.map(s => (
            <Text key={'sq' + s.day} color={s.isDone ? GREEN : MUTED}>
              {center(s.isDone ? '■' : '□', 3)}
            </Text>
          ))}
        </Box>
        <Box flexDirection="row" width={W}>
          {squares.map(s => (
            <Text key={'lb' + s.day} color={s.isToday ? GOLD : MUTED} bold={s.isToday}>
              {center(s.label, 3)}
            </Text>
          ))}
        </Box>
        {bar()}
        {footer}
      </Box>
    )
  })
}

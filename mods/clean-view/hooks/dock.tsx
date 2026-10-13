import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { DockCard, DockState } from '../types'
import {
  BIG_TEAM,
  CORAL,
  EMPTY_DOCK,
  GOLD,
  GREEN,
  PANE_ID,
  PLAN_GATE,
  RED,
  addQueued,
  applyProgress,
  atATime,
  badgeColor,
  badgeText,
  bar,
  capText,
  clock,
  counts,
  ensureCard,
  finishCard,
  infoLine,
  initials,
  instructionText,
  isComplete,
  isLiveCards,
  isNudge,
  jobName,
  lerpHex,
  markWorking,
  nudgeText,
  overallPercent,
  parseSize,
  removeCard,
  restoreSize,
  SIZES,
  spaced,
  summary,
  sweepPos,
  taskName,
} from './dock-logic'

const dockAtom = atom({ plugin: 'clean-view', key: 'dock' } as const, EMPTY_DOCK)
const dockTickAtom = atom({ plugin: 'clean-view', key: 'dockTick' } as const, 0)

const REPORT = 'mcp__clean-view__report_progress'
const PLAN = 'mcp__clean-view__plan_steps'
const SLEEPERS: string[][] = [['/bin/sleep', '1'], ['sleep', '1'], ['ping', '-n', '2', '127.0.0.1']]
const NARROW = 'The window is too narrow to show the Agent Dock. Widen it or watch the status bar.'

let timer: { cancel: () => void } | undefined
let agentCalls = 0
let nudged = false
let running = 0
let sleeper = 0
let lastLive = -1

function syncTimer($: any, live: boolean): void {
  if (live && !timer) {
    timer = $.clock.every(250, () => {
      void update($, dockTickAtom, (n: number) => n + 1)
    })
  } else if (!live && timer) {
    timer.cancel()
    timer = undefined
  }
}

async function publish($: any, d: DockState): Promise<void> {
  $.ui.status(d.isFolded && d.cards.length > 0 ? `◆ ${badgeText(d.cards)}` : undefined)
  const live = counts(d.cards).working
  if (live === lastLive) return
  lastLive = live
  try {
    const id = await $.session.id()
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    if (!home) return
    const path = `${String(home).replace(/\\/g, '/')}/.claude/ai-employee-kit-data/agents-now/${id}.json`
    await $.fs.write(path, JSON.stringify({ count: live, updatedAt: await $.clock.now() }))
  } catch {}
}

async function setDock($: any, fn: (d: DockState) => DockState): Promise<DockState> {
  await update($, dockAtom, fn)
  const d = await read($, dockAtom)
  syncTimer($, isLiveCards(d.cards))
  await publish($, d)
  return d
}

async function saveDock($: any, d: DockState): Promise<void> {
  try {
    const id = await $.session.id()
    await $.store.set('dock', { teamSize: d.teamSize, helperModel: d.helperModel, sessionId: id })
  } catch {}
}

async function applySize($: any, n: number): Promise<void> {
  const d = await setDock($, x => ({ ...x, teamSize: n, pendingSize: 0, isCustomOpen: false }))
  await saveDock($, d)
}

async function openPane($: any): Promise<void> {
  await setDock($, d => ({ ...d, isFolded: false }))
  const r = await $.ui.open({ id: PANE_ID, title: 'Agent Dock', columns: 76 })
  if (!r.isPlaced) $.ui.toast(NARROW)
}

async function toggleDock($: any): Promise<void> {
  const isOpen = (await $.ui.panes()).some((p: { id: string }) => p.id === PANE_ID)
  if (isOpen) {
    await setDock($, d => ({ ...d, isFolded: true }))
    await $.ui.close({ id: PANE_ID })
  } else {
    await openPane($)
  }
}

async function pause($: any, signal: AbortSignal): Promise<void> {
  while (sleeper < SLEEPERS.length) {
    try {
      const r = await $.process.run(SLEEPERS[sleeper], { timeoutMs: 5000 })
      if (r.exitCode === 0) return
    } catch {}
    sleeper += 1
  }
  await $.clock.sleep(1000, { signal })
}

export function registerDock(on: On): void {
  on('session.start', { cwd: /^/ }, async ($, e, next) => {
    try {
      const saved = (await $.store.get('dock')) as any
      const id = await $.session.id()
      const limit = atATime(
        await $.env.get('CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS'),
        await $.env.get('CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY'),
      )
      const helperModel: DockState['helperModel'] = saved?.helperModel === 'same' ? 'same' : 'fast'
      const teamSize: number = restoreSize(saved?.teamSize, saved?.sessionId === id)
      await update($, dockAtom, (d: DockState): DockState => ({ ...d, limit, teamSize, helperModel }))
    } catch {}
    await $.command.register({
      name: 'dock',
      description: 'Fold or reopen the Agent Dock, or set the Team Size',
      argumentHint: '[1-100]',
    })
    return next(e)
  })

  on('command.run', { command: 'dock' }, ($, e) => {
    try {
      const arg = e.args.trim()
      if (arg !== '') {
        const n = parseSize(arg)
        if (n === null) return { text: 'Team Size is a whole number from 1 to 100, e.g. /dock 10.' }
        if (n > BIG_TEAM) {
          void (async () => {
            try {
              await setDock($, d => ({ ...d, pendingSize: n, isFolded: false }))
              await openPane($)
            } catch {}
          })()
          return { text: `Confirm the team of ${n} in the Agent Dock.` }
        }
        void (async () => {
          try {
            await applySize($, n)
            await openPane($)
          } catch {}
        })()
        return { text: `Team Size is now ${n}.` }
      }
      void (async () => {
        try {
          await toggleDock($)
        } catch {}
      })()
      return { text: 'Toggling the Agent Dock.' }
    } catch {
      return { text: 'The Agent Dock could not be toggled.' }
    }
  })

  on('ui.press', { element: 'dock' }, async ($, e, next) => {
    try {
      await toggleDock($)
    } catch {}
    return next(e)
  })

  on('ui.close', { id: 'agent-dock' }, async ($, e, next) => {
    const out = await next(e)
    if (e.origin.kind !== 'unload') await setDock($, d => ({ ...d, isFolded: true }))
    return out
  })

  on('prompt.submit', { text: /^/ }, async ($, e, next) => {
    const d = await read($, dockAtom)
    const kind = e.origin.kind
    const isNew =
      (kind === 'composer' || kind === 'bridge' || kind === 'sdk') && !isNudge(e.text) && !e.text.startsWith('/')
    if (!isNew) return next(e)
    agentCalls = 0
    nudged = false
    const now = await $.clock.now()
    await setDock($, x => ({
      ...x,
      cards: [],
      pendingSize: 0,
      missionName: jobName(e.text),
      missionStartedAt: now,
      missionFinishedAt: 0,
    }))
    if (d.teamSize <= 1) return next(e)
    if (!d.isFolded) {
      void (async () => {
        try {
          if (!(await $.ui.panes()).some(p => p.id === PANE_ID)) await openPane($)
        } catch {}
      })()
    }
    return next({ ...e, context: [...(e.context ?? []), instructionText(d.teamSize)] })
  })

  on('session.append', { door: 'response' }, async ($, e, next) => {
    if (!e.agentId && e.message.type === 'assistant') {
      const items: { id: string; name: string }[] = []
      for (const block of (e.message.content ?? []) as any[]) {
        if (block?.type === 'tool_use' && block.name === 'Agent' && typeof block.id === 'string') {
          items.push({ id: block.id, name: String(block.input?.description ?? '') })
        }
      }
      if (items.length > 0) {
        const now = await $.clock.now()
        await setDock($, d => addQueued(d, items, now))
      }
    }
    return next(e)
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.agentId) return next(e)
    const first = await read($, dockAtom)
    const n = first.teamSize
    const id = e.tool_use_id
    if (n > 1 && agentCalls >= n) {
      await setDock($, d => removeCard(d, id))
      return { deny: capText(n) }
    }
    agentCalls += 1
    const queuedAt = await $.clock.now()
    await setDock($, d => ensureCard(d, id, String(e.description ?? ''), queuedAt))
    while (running >= (await read($, dockAtom)).limit) {
      await pause($, next.signal)
      if (next.signal.aborted) {
        agentCalls = Math.max(0, agentCalls - 1)
        await setDock($, d => removeCard(d, id))
        return { deny: 'Stopped before this helper started.' }
      }
    }
    running += 1
    const startedAt = await $.clock.now()
    await setDock($, d => markWorking(d, id, startedAt))
    try {
      const wantsFast = n > 1 && first.helperModel === 'fast' && e.model === undefined
      const ran = await next(wantsFast ? { ...e, model: 'haiku' as const } : e)
      if (ran.deny?.startsWith(PLAN_GATE)) {
        agentCalls = Math.max(0, agentCalls - 1)
        await setDock($, d => removeCard(d, id))
        return ran
      }
      const isFailed = ran.deny !== undefined || ran.isError === true
      const endedAt = await $.clock.now()
      await setDock($, d => finishCard(d, id, isFailed, endedAt))
      return ran
    } catch (err) {
      const endedAt = await $.clock.now()
      await setDock($, d => finishCard(d, id, true, endedAt))
      throw err
    } finally {
      running = Math.max(0, running - 1)
    }
  })

  on('tool.call', { tool: REPORT, agentId: /./ }, async ($, e) => {
    const percent = Math.max(0, Math.min(100, Math.round(Number(e.percent) || 0)))
    await setDock($, d => applyProgress(d, String(e.agentId), String(e.task ?? ''), percent))
    return { result: `Progress noted: ${percent}%.` }
  })

  on('tool.call', { tool: PLAN, agentId: /./ }, () => ({
    result: 'Helpers skip the plan. Just call report_progress as you work.',
  }))

  on('turn.complete', { reason: /^/ }, async ($, e, next) => {
    if (e.agentId) return next(e)
    const d = await read($, dockAtom)
    if (d.teamSize > 1 && !nudged && e.reason === 'answer' && d.missionStartedAt > 0 && agentCalls < d.teamSize) {
      nudged = true
      const text = nudgeText(agentCalls, d.teamSize)
      void $.prompt.submit({ text }).catch(() => undefined)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: 'agent-dock' }, async ($, e) => {
    const els = $.ui.resolve(e) as any
    const { Box, Text, Button } = els
    const Input = els.Input
    const d = await read($, dockAtom)
    const tick = await read($, dockTickAtom)
    const now = await $.clock.now()
    const cols = Math.max(40, e.props.bodyColumns)
    const c = counts(d.cards)
    const live = isLiveCards(d.cards)
    const done = isComplete(d.cards)

    const wordmark = Array.from('◆  A G E N T   D O C K').map((ch, i, all) => (
      <Text key={`w${i}`} bold color={lerpHex(CORAL, GOLD, i / Math.max(1, all.length - 1))}>
        {ch}
      </Text>
    ))
    const status = live ? (
      <Text bold color={tick % 4 < 3 ? GREEN : undefined} dimColor={tick % 4 >= 3}>
        ● L I V E
      </Text>
    ) : done ? (
      <Text bold color={GREEN}>✓ C O M P L E T E</Text>
    ) : (
      <Text dimColor>S T A N D I N G  B Y</Text>
    )

    const sizeButtons = SIZES.map(n => {
      const picked = d.teamSize === n
      return (
        <Button key={`size-${n}`} plain onPress={() => void (async () => {
          if (n > BIG_TEAM) await setDock($, x => ({ ...x, pendingSize: n }))
          else await applySize($, n)
        })()}>
          {picked ? (
            <Text bold color="black" backgroundColor={CORAL}>{` ${n} `}</Text>
          ) : (
            <Text dimColor>{` ${n} `}</Text>
          )}
        </Button>
      )
    })

    const cardTime = (card: DockCard): string => {
      if (card.status === 'queued') return '0:00'
      return clock((card.endedAt > 0 ? card.endedAt : now) - card.startedAt)
    }

    const barNodes = (card: DockCard, width: number, k: string) => {
      const w = Math.max(3, width)
      const color = card.status === 'stuck' ? RED : card.status === 'done' ? GOLD : GREEN
      if (card.status === 'working' && !card.hasReported) {
        const pos = sweepPos(tick, w)
        let out = ''
        for (let i = 0; i < w; i++) out += i >= pos - 3 && i < pos ? '━' : '─'
        return [<Text key={k} color={GREEN} dimColor={false}>{out}</Text>]
      }
      const b = bar(card.percent, w)
      return [
        <Text key={`${k}f`} color={color}>{'━'.repeat(b.filled)}</Text>,
        <Text key={`${k}e`} dimColor>{'─'.repeat(b.empty)}</Text>,
      ]
    }

    const useTiles = d.cards.length > 12
    let cardNodes: unknown
    if (!useTiles) {
      const perRow = cols >= 100 ? 3 : cols >= 64 ? 2 : 1
      const cardW = Math.floor((cols - (perRow - 1)) / perRow)
      cardNodes = (
        <Box flexWrap="wrap" columnGap={1} width={cols}>
          {d.cards.map((card, i) => {
            const inner = cardW - 2
            const pctText = card.status === 'queued' ? '  --' : `${String(card.percent).padStart(3)}%`
            return (
              <Box
                key={`card-${card.id}`}
                width={cardW}
                flexDirection="column"
                borderStyle="round"
                borderColor={card.status === 'stuck' ? RED : undefined}
                borderDimColor={card.status === 'queued'}
                hover={{ borderColor: CORAL }}
              >
                <Box>
                  <Text bold color="black" backgroundColor={badgeColor(i)} dimColor={card.status === 'queued'}>
                    {` ${initials(card.name)} `}
                  </Text>
                  <Box flexGrow={1} marginX={1}>
                    <Text wrap="truncate-end" dimColor={card.status === 'queued'}>{card.name}</Text>
                  </Box>
                  <Text dimColor>{cardTime(card)}</Text>
                </Box>
                <Box>
                  <Text>{'    '}</Text>
                  {barNodes(card, inner - 4 - 5, `b${card.id}`)}
                  <Text dimColor={card.status === 'queued'}>{` ${pctText}`}</Text>
                </Box>
              </Box>
            )
          })}
        </Box>
      )
    } else {
      const tileW = 18
      cardNodes = (
        <Box flexWrap="wrap" columnGap={1} width={cols}>
          {d.cards.map((card, i) => (
            <Box key={`tile-${card.id}`} width={tileW}>
              <Text bold color="black" backgroundColor={badgeColor(i)} dimColor={card.status === 'queued'}>
                {` ${initials(card.name)} `}
              </Text>
              <Text> </Text>
              {barNodes(card, tileW - 4 - 1 - 4 - 1, `t${card.id}`)}
              <Text dimColor={card.status === 'queued'} color={card.status === 'stuck' ? RED : undefined}>
                {` ${card.status === 'queued' ? ' --' : String(card.percent).padStart(3)}%`.slice(0, 5)}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    const total = Math.max(1, d.cards.length)
    const doneW = Math.round(((c.done + c.stuck) / total) * cols)
    const workW = c.working > 0 ? Math.max(1, Math.round((c.working / total) * cols)) : 0
    const restW = Math.max(0, cols - doneW - workW)
    const missionBar = []
    for (let i = 0; i < doneW; i += 4) {
      const run = Math.min(4, doneW - i)
      missionBar.push(
        <Text key={`md${i}`} color={lerpHex(CORAL, GOLD, i / Math.max(1, cols - 1))}>
          {'━'.repeat(run)}
        </Text>,
      )
    }
    for (let i = 0; i < workW; i += 3) {
      const run = Math.min(3, workW - i)
      const isBright = (Math.floor(i / 3) + tick) % 2 === 0
      missionBar.push(
        <Text key={`mw${i}`} color={isBright ? GREEN : '#3C8F58'}>
          {'━'.repeat(run)}
        </Text>,
      )
    }
    if (restW > 0) missionBar.push(<Text key="mr" dimColor>{'─'.repeat(restW)}</Text>)

    const missionMs = (d.missionFinishedAt > 0 ? d.missionFinishedAt : now) - d.missionStartedAt
    const seats = Array.from({ length: Math.min(d.teamSize, 25) }).map((_, i) => (
      <Text key={`seat${i}`} color={badgeColor(i)} dimColor={(i * 7 + Math.floor(now / 1500)) % 5 === 0}>
        ●{' '}
      </Text>
    ))

    return (
      <Box flexDirection="column" width={cols}>
        <Box justifyContent="space-between">
          <Box>{wordmark}</Box>
          {status}
        </Box>
        <Text dimColor>{'─'.repeat(cols)}</Text>
        <Box>
          <Text dimColor>{spaced('TEAM') + '  ' + spaced('SIZE') + '   '}</Text>
          {sizeButtons}
          <Button key="custom" plain onPress={() => void update($, dockAtom, x => ({ ...x, isCustomOpen: !x.isCustomOpen }))}>
            <Text color={d.isCustomOpen ? CORAL : undefined} dimColor={!d.isCustomOpen}>{' Custom '}</Text>
          </Button>
        </Box>
        <Text dimColor wrap="truncate-end">{infoLine(d)}</Text>
        <Box>
          <Text dimColor>Helper agents: </Text>
          <Button key="model-toggle" plain onPress={() => void (async () => {
            const next = await setDock($, x => ({ ...x, helperModel: x.helperModel === 'fast' ? 'same' : 'fast' }))
            await saveDock($, next)
          })()}>
            <Text color={CORAL}>{d.helperModel === 'fast' ? 'Fast & Cheap' : 'Same as me'}</Text>
          </Button>
        </Box>
        {d.pendingSize > 0 && (
          <Box borderStyle="round" borderColor={GOLD} paddingX={1} flexDirection="column">
            <Text color={GOLD}>Big team: this uses your plan quickly. Continue?</Text>
            <Box gap={1}>
              <Button key="continue" variant="primary" onPress={() => void (async () => {
                const n = (await read($, dockAtom)).pendingSize
                if (n > 0) await applySize($, n)
              })()}>
                {`Continue with ${d.pendingSize}`}
              </Button>
              <Button key="cancel" onPress={() => void update($, dockAtom, x => ({ ...x, pendingSize: 0 }))}>
                Cancel
              </Button>
            </Box>
          </Box>
        )}
        {d.isCustomOpen && Input !== undefined && (
          <Box borderStyle="round" paddingX={1}>
            <Input
              key="custom-input"
              label="How many helpers? "
              placeholder="1 to 100"
              autoFocus
              onSubmit={(value: string) => {
                const n = parseSize(value)
                if (n === null) {
                  $.ui.toast('Type a whole number from 1 to 100')
                } else if (n > BIG_TEAM) {
                  void update($, dockAtom, x => ({ ...x, pendingSize: n, isCustomOpen: false }))
                } else {
                  void applySize($, n)
                }
              }}
            />
          </Box>
        )}
        <Text> </Text>
        {d.cards.length === 0 ? (
          <Box flexDirection="column">
            <Box>{seats}</Box>
            <Text>{`Your team of ${d.teamSize} is standing by`}</Text>
            <Text dimColor>{`Send a request and it splits across ${d.teamSize} helpers.`}</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Box justifyContent="space-between">
              <Box flexShrink={1}>
                <Text wrap="truncate-end">
                  <Text dimColor>{spaced('MISSION') + '   '}</Text>
                  <Text bold>{d.missionName}</Text>
                </Text>
              </Box>
              <Text>{`${overallPercent(d.cards)}%   ${clock(missionMs)}`}</Text>
            </Box>
            <Box>{missionBar}</Box>
            <Box gap={4}>
              <Text color={GREEN}>{`● ${c.working} working`}</Text>
              <Text dimColor>{`○ ${c.queued} queued`}</Text>
              <Text color={GOLD}>{`✓ ${c.done} done`}</Text>
              <Text color={c.stuck > 0 ? RED : undefined} dimColor={c.stuck === 0}>{`✕ ${c.stuck} stuck`}</Text>
            </Box>
            {done && (
              <Box borderStyle="round" borderColor={GREEN} paddingX={1}>
                <Text color={GREEN}>{summary(d.cards.length, d.missionName, missionMs, c.stuck)}</Text>
              </Box>
            )}
            <Text> </Text>
            {cardNodes as any}
          </Box>
        )}
      </Box>
    )
  })
}

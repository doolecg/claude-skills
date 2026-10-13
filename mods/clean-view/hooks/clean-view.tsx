import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { CvAsk, CvChecklist } from '../types'
import {
  ASKED_IN_BAND,
  EMPTY_ASK,
  EMPTY_CHECKLIST,
  HAS_QUESTION,
  KEEPS_FAILING,
  METER,
  OTHER_HINT,
  SKIPPED,
  NEEDS_OK,
  PLAN_FIRST,
  PLAN_RULES,
  REFUSED,
  SAID_NO,
  USER_DENIED,
  WAITING_REPLY,
  addTask,
  answerOther,
  answersMessage,
  askLayout,
  classifyError,
  clampPercent,
  confirmPicks,
  easeToward,
  ensureJob,
  formatElapsed,
  fitOption,
  fromTodos,
  gradientText,
  hasRealPlan,
  isAnswered,
  isLive,
  overall,
  padTo,
  paletteFor,
  parseAsk,
  pickQuestion,
  pixelMeter,
  pixelRuns,
  pixelSweep,
  pressOption,
  planSteps,
  rasterCells,
  reportProgress,
  rowLabel,
  startJob,
  titleFrom,
  titleFromReply,
  unfinished,
  updateTask,
  type Pixel,
  type Run,
  type TodoItem,
} from './clean-logic'

type Dollar = EngineInterface

const enabledAtom = atom({ plugin: 'clean-view', key: 'cleanViewEnabled' } as const, true)
const checklistAtom = atom({ plugin: 'clean-view', key: 'checklist' } as const, EMPTY_CHECKLIST)
const askAtom = atom({ plugin: 'clean-view', key: 'ask' } as const, EMPTY_ASK)
const tickAtom = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)
const themeAtom = atom({ plugin: 'clean-view', key: 'theme' } as const, 'dark')
const modesAtom = atom({ plugin: 'clean-view', key: 'modes' } as const, {})

const PLAN = 'mcp__clean-view__plan_steps'
const REPORT = 'mcp__clean-view__report_progress'
const ALWAYS_ALLOWED = new Set(['ToolSearch', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion', PLAN, REPORT])

let ticker: Timer | undefined
let failures = 0
/** The main turn has ended while background helpers were still running. */
let isWaitingForHelpers = false
let taskCount = 0
/** Each meter's build-up: the fraction it eases from, the one it eases to, and since when. */
const shown = new Map<string, { from: number; to: number; at: number }>()

/** A job whose meters move: live, or just done and not yet folded to one line. */
const isAnimated = (cl: CvChecklist): boolean => isLive(cl) || (cl.phase === 'done' && !cl.isCollapsed)

/** The 250ms frame clock runs only while a job's meters move. */
function syncTicker($: Dollar, cl: CvChecklist): void {
  if (isAnimated(cl) && !ticker) {
    ticker = $.clock.every(250, () => void update($, tickAtom, n => n + 1).catch(() => {}))
  } else if (!isAnimated(cl) && ticker) {
    ticker.cancel()
    ticker = undefined
  }
}

async function change($: Dollar, fn: (cl: CvChecklist) => CvChecklist): Promise<CvChecklist> {
  await update($, checklistAtom, fn)
  const cl = await read($, checklistAtom)
  syncTicker($, cl)
  return cl
}

/** Takes the questions off the band. With `reply`, sends it to Claude as the person's next message. */
async function closeAsk($: Dollar, reply?: string): Promise<void> {
  if (!(await read($, askAtom)).isOpen) return
  await update($, askAtom, () => EMPTY_ASK)
  if (reply === undefined) return
  await change($, whileLive(c => (c.phase === 'needs-you' ? { ...c, phase: 'working', needsYouReason: '' } : c)))
  void $.prompt.submit({ text: reply }).catch(() => {})
}

/** How many background helpers (subagents) are still working, not counting `except`. */
async function runningHelpers($: Dollar, except?: string): Promise<number> {
  try {
    const list = await $.agent.list()
    return list.filter(a => a.id !== except && (a.status === 'running' || a.status === 'pending')).length
  } catch {
    return 0
  }
}

/** The main turn is over and nothing is running: done, or waiting for the person's reply. */
async function finishTurn($: Dollar): Promise<void> {
  isWaitingForHelpers = false
  const cl = await read($, checklistAtom)
  if (!isLive(cl)) return
  if (unfinished(cl)) {
    await change($, c => ({ ...c, phase: 'needs-you', needsYouReason: WAITING_REPLY, stuckReason: '', helpers: 0 }))
    return
  }
  const now = await $.clock.now()
  await change($, c => ({
    ...c,
    phase: 'done',
    finishedAt: now,
    isCollapsed: false,
    stuckReason: '',
    needsYouReason: '',
    helpers: 0,
    tasks: c.tasks.map(t => ({ ...t, status: 'done' as const, percent: 100 })),
  }))
  $.clock.after(5000, () => {
    void change($, c => (c.phase === 'done' && c.finishedAt === now ? { ...c, isCollapsed: true } : c)).catch(() => {})
  })
}

/** The ✕: clears the band. A question still up is skipped, so Claude is not left waiting. */
async function dismissBand($: Dollar): Promise<void> {
  isWaitingForHelpers = false
  await closeAsk($, SKIPPED)
  await change($, () => EMPTY_CHECKLIST)
}

/** A press or a typed answer: update the questions, and send the answers to Claude once every one has one. */
async function changeAsk($: Dollar, fn: (a: CvAsk) => CvAsk): Promise<void> {
  await update($, askAtom, fn)
  const a = await read($, askAtom)
  if (isAnswered(a)) await closeAsk($, answersMessage(a))
}

const whileLive = (fn: (cl: CvChecklist) => CvChecklist) => (cl: CvChecklist) => (isLive(cl) ? fn(cl) : cl)

/** Tells the bottom bar (and any mod that reads it) whether Clean View is on. */
const publishMode = ($: Dollar, isOn: boolean) => update($, modesAtom, () => ({ simple: { label: 'Clean View', isOn } }))

async function setEnabled($: Dollar, isOn: boolean): Promise<void> {
  await update($, enabledAtom, () => isOn)
  await publishMode($, isOn)
  try {
    await $.store.set('cleanViewEnabled', isOn)
  } catch {}
  $.ui.toast(isOn ? 'Clean View is on: just the plan, no technical rows' : 'Clean View is off: every row is back')
}

async function readTheme($: Dollar): Promise<void> {
  try {
    const s = (await $.settings.read()) as Record<string, unknown>
    if (typeof s.theme === 'string' && s.theme !== (await read($, themeAtom))) await update($, themeAtom, () => s.theme as string)
  } catch {}
}

async function nameJob($: Dollar, text: string, startedAt: number): Promise<void> {
  try {
    const r = await $.model.complete({
      model: 'haiku',
      effort: 'low',
      maxTokens: 30,
      prompt: `Name this job in 2 to 6 plain words a non-technical person understands, starting with a verb. No file names, code or quotes. Reply with the name only.\n\nRequest: ${text.slice(0, 600)}`,
    })
    if (!r.isAnswered) return
    const title = titleFromReply(r.text)
    if (title === 'Working on it') return
    await change($, cl => (cl.startedAt === startedAt && cl.phase !== 'idle' ? { ...cl, title } : cl))
  } catch {}
}

function createdId(ran: unknown): string | undefined {
  const r = ran as { result?: unknown; text?: unknown }
  const res = r?.result as { task?: { id?: unknown }; id?: unknown } | undefined
  const id = res?.task?.id ?? res?.id
  if (typeof id === 'string' || typeof id === 'number') return String(id)
  const text = typeof r?.text === 'string' ? r.text : typeof r?.result === 'string' ? r.result : ''
  return /#\s*(\d+)/.exec(text)?.[1]
}

export function registerCleanView(on: On): void {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    try {
      const saved = await $.store.get('cleanViewEnabled')
      if (typeof saved === 'boolean') await update($, enabledAtom, () => saved)
    } catch {}
    await publishMode($, await read($, enabledAtom))
    await readTheme($)
    await $.tool.register({
      name: 'plan_steps',
      description:
        'Clean View: lay out every step of the job up front, 2 to 8 short plain-English step names in order, each under 40 characters and starting with a verb (no file names, paths, commands or code). The first step starts right away. Call this first for every request.',
      inputSchema: {
        type: 'object',
        properties: {
          steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8, description: 'Step names in order' },
        },
        required: ['steps'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'report_progress',
      description:
        'Clean View: report progress on the current step, by its name from plan_steps, with a percent from 0 to 100. Report 100 the moment a step is finished; the next step then starts by itself.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'The step name, as planned' },
          percent: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['task', 'percent'],
      },
      isDeferred: false,
    })
    await $.command.register({
      name: 'simple',
      description: 'Turn Clean View on or off (no argument flips it)',
      argumentHint: '[on|off]',
    })
    syncTicker($, await read($, checklistAtom))
    return ran
  })

  on('command.run', { command: 'simple' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const target = arg === 'on' ? true : arg === 'off' ? false : !(await read($, enabledAtom))
    await setEnabled($, target)
    return { text: target ? 'Clean View is on.' : 'Clean View is off.' }
  })

  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (e.command === 'theme' || e.command === 'config') await readTheme($)
    return ran
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    if (!(await read($, enabledAtom))) return out
    return { ...out, sections: [...out.sections, { id: 'clean-view:plan', text: PLAN_RULES, scope: 'session' as const }] }
  })

  on('turn.start', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId !== undefined) return next(e)
    isWaitingForHelpers = false
    if ((await read($, checklistAtom)).helpers > 0) await change($, c => ({ ...c, helpers: 0 }))
    const text = e.text.trim()
    if (text !== '' && !text.startsWith('/') && (await read($, enabledAtom)) && !isLive(await read($, checklistAtom))) {
      const now = await $.clock.now()
      failures = 0
      taskCount = 0
      await change($, () => startJob(titleFrom(text), now))
      $.clock.after(0, () => void nameJob($, text, now))
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await closeAsk($)
    await change($, cl =>
      cl.phase === 'needs-you' || cl.phase === 'stuck'
        ? { ...cl, phase: 'working', needsYouReason: '', stuckReason: '' }
        : cl,
    )
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const args = e as unknown as Record<string, unknown>
    const isMain = e.agentId === undefined

    if (tool === PLAN) {
      const steps = Array.isArray(args.steps) ? (args.steps as unknown[]) : []
      if (steps.length === 0) return { result: 'Send steps as a list of 2 to 8 short step names.' }
      const n = Math.min(8, steps.length)
      if (isMain) {
        const now = await $.clock.now()
        failures = 0
        await change($, cl => planSteps(cl, steps, now))
      }
      return { result: `Planned ${n} steps. The first one has started.` }
    }
    if (tool === REPORT) {
      const percent = clampPercent(args.percent)
      if (isMain) {
        const now = await $.clock.now()
        await change($, cl => reportProgress(ensureJob(cl, now), args.task, percent))
      }
      return { result: `Progress noted: ${percent}%.` }
    }

    if (!isMain || !(await read($, enabledAtom))) return next(e)

    const cl = await read($, checklistAtom)
    if (!hasRealPlan(cl) && !ALWAYS_ALLOWED.has(tool)) return { deny: PLAN_FIRST }

    const now = await $.clock.now()
    if (tool === 'TodoWrite') {
      const todos = Array.isArray(args.todos) ? (args.todos as TodoItem[]) : []
      await change($, c => fromTodos(ensureJob(c, now), todos))
    } else if (tool === 'TaskUpdate' && typeof args.status === 'string') {
      const id = String(args.taskId ?? '')
      await change($, whileLive(c => updateTask(c, `k${id}`, args.status as string)))
    }

    const isQuestion = tool === 'AskUserQuestion'
    await change($, whileLive(c => (isQuestion ? { ...c, phase: 'needs-you', needsYouReason: HAS_QUESTION } : c.phase === 'needs-you' ? { ...c, phase: 'working', needsYouReason: '' } : c)))

    // The questions are asked in the band, so the engine's own dialog never opens. A hook may wait only
    // 10 seconds of its own time, so the call answers at once and the answers come back as the next message.
    const ask = isQuestion ? parseAsk(args.questions, e.tool_use_id) : undefined
    if (ask) {
      await update($, askAtom, () => ask)
      return { deny: ASKED_IN_BAND }
    }
    const ran = await next(e)

    if (tool === 'TaskCreate' && ran.deny === undefined) {
      taskCount += 1
      const id = createdId(ran) ?? String(taskCount)
      await change($, c => addTask(ensureJob(c, now), args.subject, `k${id}`))
    }

    const said = `${ran.deny ?? ''} ${typeof (ran as { text?: unknown }).text === 'string' ? (ran as { text: string }).text : ''}`
    const isFailed = ran.deny !== undefined || (ran as { isError?: boolean }).isError === true
    if (isFailed && USER_DENIED.test(said)) {
      failures = 0
      await change($, whileLive(c => ({ ...c, phase: 'stuck', stuckReason: SAID_NO, needsYouReason: '' })))
    } else if (isFailed) {
      failures += 1
      if (failures >= 3) await change($, whileLive(c => ({ ...c, phase: 'stuck', stuckReason: KEEPS_FAILING, needsYouReason: '' })))
    } else {
      failures = 0
      await change($, whileLive(c => (c.phase === 'stuck' || c.phase === 'needs-you' ? { ...c, phase: 'working', stuckReason: '', needsYouReason: '' } : c)))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    const isAsk = e.notification_type === 'permission_prompt' || /permission|approv/i.test(e.message)
    if (isAsk && (await read($, enabledAtom))) {
      await change($, whileLive(c => ({ ...c, phase: 'needs-you', needsYouReason: NEEDS_OK })))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      // A helper finished: when the main turn already ended and it was the last one, wrap up shortly after
      // unless Claude starts another turn to report back.
      if (isWaitingForHelpers && (await runningHelpers($, e.agentId)) === 0) {
        $.clock.after(3000, () => {
          if (isWaitingForHelpers) void finishTurn($).catch(() => {})
        })
      }
      return next(e)
    }
    const cl = await read($, checklistAtom)
    if (isLive(cl)) {
      const now = await $.clock.now()
      if (e.reason === 'aborted') {
        isWaitingForHelpers = false
        await change($, c => ({ ...c, phase: 'stopped', finishedAt: now, helpers: 0 }))
      } else if (e.reason === 'error') {
        await change($, c => ({ ...c, phase: 'stuck', stuckReason: classifyError(e.answer), needsYouReason: '', helpers: 0 }))
      } else if (e.reason === 'refusal') {
        await change($, c => ({ ...c, phase: 'stuck', stuckReason: REFUSED, needsYouReason: '', helpers: 0 }))
      } else if (cl.phase === 'stuck' && cl.stuckReason === SAID_NO) {
        // Claude paused on the person's no: the stuck line says why.
      } else {
        const helpers = await runningHelpers($)
        if (helpers > 0) {
          isWaitingForHelpers = true
          await change($, c => ({ ...c, phase: 'working', needsYouReason: '', stuckReason: '', helpers }))
        } else {
          await finishTurn($)
        }
      }
    }
    return next(e)
  })

  on('ui.render', { component: ['ToolUse', 'ToolResult', 'ToolGroup'] }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) return next(e)
    return next({ ...e, props: { ...e.props, hint: '' } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Raster = e.surface === 'terminal' && 'Raster' in els ? els.Raster : undefined
    const pal = paletteFor(await read($, themeAtom))
    const isOn = await read($, enabledAtom)
    const cl = await read($, checklistAtom)
    const tick = await read($, tickAtom)
    const now = await $.clock.now()

    const runs = (list: Run[], prefix: string, bold?: boolean) =>
      list.map((r, i) => (
        <Text key={`${prefix}${i}`} color={r.color} bold={bold}>
          {r.text}
        </Text>
      ))

    // On and off live in the bottom bar's pill and /simple; the band shows only a job.
    const ask = await read($, askAtom)
    if (!isOn || (cl.phase === 'idle' && !ask.isOpen)) return next(e)
    // A question with no job on screen: the checklist side only says it is waiting.
    const isBare = ask.isOpen && (cl.phase === 'idle' || cl.phase === 'done')

    const cols = e.props.bodyColumns
    const took = formatElapsed((cl.finishedAt > 0 ? cl.finishedAt : now) - cl.startedAt)

    // Shown once the job is no longer running (finished, stopped, stuck, waiting) or a question is up.
    const closeButton =
      cl.phase !== 'working' || ask.isOpen || cl.helpers > 0 ? (
        <Box flexShrink={0} marginLeft={1}>
          <Button key="close" plain dimColor onPress={() => void dismissBand($).catch(() => {})}>
            ✕
          </Button>
        </Box>
      ) : null

    if (cl.phase === 'done' && cl.isCollapsed && !ask.isOpen) {
      return (
        <Box width="100%">
          <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden">
            <Text wrap="truncate-end">
              <Text color={pal.good} bold>
                ✓ All done
              </Text>
              <Text color={pal.dim}>{` · ${cl.title} · took ${took}`}</Text>
            </Text>
          </Box>
          {closeButton}
        </Box>
      )
    }

    const animate = isAnimated(cl)
    if (shown.size > 200) shown.clear()
    const eased = (id: string, target: number): number => {
      const key = `${cl.startedAt}:${id}`
      const was = shown.get(key)
      if (!was) shown.set(key, { from: animate ? 0 : target, to: target, at: now })
      else if (was.to !== target) shown.set(key, { from: easeToward(was.from, was.to, now - was.at), to: target, at: now })
      const it = shown.get(key)!
      return animate ? easeToward(it.from, it.to, now - it.at) : target
    }
    // The terminal draws a meter as one Raster of braille pixels; other surfaces as coloured text.
    const meter = (key: string, pixels: Pixel[]) =>
      Raster ? (
        <Raster key={key} columns={pixels.length} rows={1} cells={rasterCells(pixels)} />
      ) : (
        runs(pixelRuns(pixels), `${key}-`)
      )

    const warm = [pal.warmFrom, pal.warmTo]
    const good = [pal.goodFrom, pal.goodTo]
    const border = isBare
      ? pal.warn
      : cl.phase === 'done'
        ? pal.good
        : cl.phase === 'needs-you'
          ? pal.warn
          : cl.phase === 'stuck'
            ? pal.bad
            : cl.phase === 'stopped'
              ? pal.idle
              : pal.border

    const header = isBare ? (
      <Text wrap="truncate-end">
        <Text backgroundColor={pal.warn} color={pal.badgeText} bold>
          {' Needs you '}
        </Text>
        <Text color={pal.text}>{'  Waiting for your answer'}</Text>
      </Text>
    ) : cl.phase === 'needs-you' ? (
        <Text wrap="truncate-end">
          <Text backgroundColor={pal.warn} color={pal.badgeText} bold>
            {' Needs you '}
          </Text>
          <Text color={pal.text}>{`  ${cl.needsYouReason}`}</Text>
        </Text>
      ) : cl.phase === 'stuck' ? (
        <Text wrap="truncate-end">
          <Text color={pal.bad} bold>
            ⚠ Stuck:
          </Text>
          <Text color={pal.text}>{` ${cl.stuckReason}`}</Text>
        </Text>
      ) : cl.phase === 'stopped' ? (
        <Text wrap="truncate-end">
          <Text color={pal.dim} bold>
            ■ Stopped
          </Text>
          <Text color={pal.dim}>{` · ${cl.title} · you pressed Esc`}</Text>
        </Text>
      ) : cl.phase === 'done' ? (
        <Text wrap="truncate-end">
          <Text backgroundColor={pal.good} color={pal.badgeText} bold>
            {' ✓ All done '}
          </Text>
          <Text color={pal.good} bold>{`  ${cl.title}`}</Text>
        </Text>
      ) : (
        <Text wrap="truncate-end">
          <Text color={pal.warmFrom}>{'✶ '}</Text>
          {runs(gradientText(cl.title, [pal.warmFrom, pal.warmTo, pal.titleTo]), 't', true)}
          {cl.helpers > 0 ? <Text color={pal.dim}>{` · Waiting for ${cl.helpers} ${cl.helpers === 1 ? 'helper' : 'helpers'}`}</Text> : null}
        </Text>
      )
    const timeText = isBare ? '' : cl.phase === 'done' ? `took ${took}` : cl.phase === 'stopped' ? '' : took

    const layout = askLayout(Math.max(10, cols - 4))
    const isAsking = ask.isOpen
    const inner = isAsking && layout.isSplit ? layout.left : Math.max(10, cols - 4)
    const sum = overall(cl)
    const stepLabel = cl.phase === 'done' ? `${sum.total} of ${sum.total} steps` : `Step ${sum.step} of ${sum.total}`
    const pctText = `${sum.percent}%`.padStart(4)
    const barWidth = Math.max(0, inner - stepLabel.length - pctText.length - 2)
    const barStops = cl.phase === 'done' ? good : warm
    const bar = pixelMeter(barWidth, eased('all', sum.percent / 100), { stops: barStops, track: pal.track, tint: pal.tint, tick })

    const longest = cl.tasks.reduce((n, t) => Math.max(n, [...t.name].length), 0)
    const nameWidth = Math.max(4, Math.min(longest + 1, 41, inner - 2 - 2 - METER - 2 - 7))
    const isPaused = cl.phase === 'needs-you'

    const rows = cl.tasks.map((t, i) => {
      const isDone = t.status === 'done'
      const isActive = t.status === 'active'
      const marker = isDone ? '✓' : isActive ? (isPaused ? '‖' : '▶') : '○'
      const markerColor = isDone ? pal.good : isActive ? (isPaused ? pal.warn : pal.accent) : pal.faint
      const look = { stops: isDone ? good : warm, track: pal.track, tint: pal.tint, tick, seed: i + 1 }
      const pixels =
        isActive && !t.hasReported && cl.phase === 'working'
          ? pixelSweep(METER, look)
          : pixelMeter(METER, eased(t.id, isDone ? 1 : isActive ? t.percent / 100 : 0), look)
      const label = rowLabel(cl.tasks, i)
      return (
        <Box key={t.id}>
          <Text color={markerColor}>{`${marker} `}</Text>
          <Text color={isDone ? pal.dim : isActive ? pal.text : pal.faint} bold={isActive}>
            {padTo(t.name, nameWidth)}
          </Text>
          <Text> </Text>
          {meter(`m${i}`, pixels)}
          <Text color={isActive ? pal.accent : isDone ? pal.dim : pal.faint} bold={isActive && t.hasReported}>
            {`  ${label}`}
          </Text>
        </Box>
      )
    })

    const checklist = (
      <Box flexDirection="column" width={isAsking && layout.isSplit ? layout.left : undefined} flexShrink={0}>
        <Box>
          <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden">
            {header}
          </Box>
          {timeText ? (
            <Box flexShrink={0} marginLeft={1}>
              <Text color={pal.dim}>{timeText}</Text>
            </Box>
          ) : null}
          {closeButton}
        </Box>
        {sum.total > 0 && !isBare ? (
          <Box>
            <Text color={pal.dim}>{`${stepLabel} `}</Text>
            {meter('bar', bar)}
            <Text color={cl.phase === 'done' ? pal.good : pal.accent} bold>{` ${pctText}`}</Text>
          </Box>
        ) : null}
        {isBare ? null : rows}
      </Box>
    )

    let panel = null
    if (isAsking) {
      const Input = 'Input' in els ? els.Input : undefined
      const q = ask.questions[ask.current]!
      const W = layout.right
      const tabW = Math.max(8, Math.min(16, Math.floor(W / 3)))
      const optW = Math.max(8, W - tabW - 8)
      const ticked = ask.picks[ask.current] ?? []
      const given = ask.answers[ask.current]
      panel = (
        <Box flexDirection="column" width={layout.isSplit ? W : undefined} marginTop={layout.isSplit ? 0 : 1} flexShrink={0}>
          <Box borderStyle="round" borderColor={pal.accent} paddingX={1} width="100%">
            <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden">
              <Text wrap="truncate-end">
                <Text color={pal.accent} bold>
                  {'? '}
                </Text>
                <Text color={pal.text} bold>
                  {q.question}
                </Text>
              </Text>
            </Box>
            <Box flexShrink={0} marginLeft={1}>
              <Button key="skip" plain dimColor onPress={() => void closeAsk($, SKIPPED).catch(() => {})}>
                Skip
              </Button>
            </Box>
          </Box>
          <Box>
            <Box flexDirection="column" borderStyle="round" borderColor={pal.faint} paddingX={1} width={tabW} flexShrink={0}>
              {ask.questions.map((t, i) => {
                const isNow = i === ask.current
                const mark = ask.answers[i] !== null ? '✓' : isNow ? '▶' : '○'
                const color = ask.answers[i] !== null ? pal.good : isNow ? pal.accent : pal.faint
                return (
                  <Button key={`q${i}`} plain onPress={() => void update($, askAtom, a => pickQuestion(a, i)).catch(() => {})}>
                    <Text color={color}>{`${mark} `}</Text>
                    <Text color={isNow ? pal.text : pal.dim} bold={isNow}>
                      {padTo(t.header, tabW - 6).trimEnd()}
                    </Text>
                  </Button>
                )
              })}
            </Box>
            <Box flexDirection="column" flexGrow={1} marginLeft={1}>
              {q.options.map((o, i) => {
                const isOn = q.multiSelect ? ticked.includes(o.label) : given === o.label
                const fit = fitOption(o.label, o.description, optW - 6)
                const mark = q.multiSelect ? (isOn ? '◼' : '◻') : isOn ? '●' : '○'
                return (
                  <Button
                    key={`o${i}`}
                    plain
                    hotkey={String(i + 1)}
                    onPress={() => void changeAsk($, a => pressOption(a, o.label)).catch(() => {})}
                  >
                    <Text color={isOn ? pal.good : pal.accent}>{`${mark} `}</Text>
                    <Text color={isOn ? pal.good : pal.text} bold>
                      {fit.label}
                    </Text>
                    {fit.description ? <Text color={pal.dim}>{` · ${fit.description}`}</Text> : null}
                  </Button>
                )
              })}
              <Box>
                <Box flexGrow={1}>
                  {Input ? (
                    <Input
                      key="other"
                      placeholder={OTHER_HINT}
                      submitLabel="answer"
                      onSubmit={(value: string) => void changeAsk($, a => answerOther(a, value)).catch(() => {})}
                    />
                  ) : null}
                </Box>
                {q.multiSelect ? (
                  <Button key="done" plain hotkey="d" onPress={() => void changeAsk($, a => confirmPicks(a)).catch(() => {})}>
                    <Text color={ticked.length > 0 ? pal.good : pal.faint} bold>{' d: Done'}</Text>
                  </Button>
                ) : null}
              </Box>
            </Box>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={border} paddingX={1} width="100%">
        {panel && layout.isSplit ? (
          <Box>
            {checklist}
            <Box marginLeft={1}>{panel}</Box>
          </Box>
        ) : (
          <>
            {checklist}
            {panel}
          </>
        )}
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { CvChecklist } from '../types'
import {
  EMPTY_CHECKLIST,
  HAS_QUESTION,
  KEEPS_FAILING,
  METER,
  NEEDS_OK,
  PLAN_FIRST,
  PLAN_RULES,
  REFUSED,
  SAID_NO,
  USER_DENIED,
  WAITING_REPLY,
  addTask,
  classifyError,
  clampPercent,
  easeToward,
  ensureJob,
  formatElapsed,
  fromTodos,
  gradientText,
  hasRealPlan,
  isLive,
  overall,
  padTo,
  paletteFor,
  pixelMeter,
  pixelRuns,
  pixelSweep,
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
const tickAtom = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)
const themeAtom = atom({ plugin: 'clean-view', key: 'theme' } as const, 'dark')
const modesAtom = atom({ plugin: 'clean-view', key: 'modes' } as const, {})

const PLAN = 'mcp__clean-view__plan_steps'
const REPORT = 'mcp__clean-view__report_progress'
const ALWAYS_ALLOWED = new Set(['ToolSearch', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion', PLAN, REPORT])

let ticker: Timer | undefined
let failures = 0
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
    if (e.agentId !== undefined) return next(e)
    const cl = await read($, checklistAtom)
    if (isLive(cl)) {
      const now = await $.clock.now()
      if (e.reason === 'aborted') {
        await change($, c => ({ ...c, phase: 'stopped', finishedAt: now }))
      } else if (e.reason === 'error') {
        await change($, c => ({ ...c, phase: 'stuck', stuckReason: classifyError(e.answer), needsYouReason: '' }))
      } else if (e.reason === 'refusal') {
        await change($, c => ({ ...c, phase: 'stuck', stuckReason: REFUSED, needsYouReason: '' }))
      } else if (cl.phase === 'stuck' && cl.stuckReason === SAID_NO) {
        // Claude paused on the person's no: the stuck line says why.
      } else if (unfinished(cl)) {
        await change($, c => ({ ...c, phase: 'needs-you', needsYouReason: WAITING_REPLY, stuckReason: '' }))
      } else {
        await change($, c => ({
          ...c,
          phase: 'done',
          finishedAt: now,
          isCollapsed: false,
          stuckReason: '',
          needsYouReason: '',
          tasks: c.tasks.map(t => ({ ...t, status: 'done' as const, percent: 100 })),
        }))
        $.clock.after(5000, () => {
          void change($, c => (c.phase === 'done' && c.finishedAt === now ? { ...c, isCollapsed: true } : c)).catch(() => {})
        })
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
    const { Box, Text } = els
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
    if (!isOn || cl.phase === 'idle') return next(e)

    const cols = e.props.bodyColumns
    const took = formatElapsed((cl.finishedAt > 0 ? cl.finishedAt : now) - cl.startedAt)

    if (cl.phase === 'done' && cl.isCollapsed) {
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
    const border =
      cl.phase === 'done'
        ? pal.good
        : cl.phase === 'needs-you'
          ? pal.warn
          : cl.phase === 'stuck'
            ? pal.bad
            : cl.phase === 'stopped'
              ? pal.idle
              : pal.border

    const header =
      cl.phase === 'needs-you' ? (
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
        </Text>
      )
    const timeText = cl.phase === 'done' ? `took ${took}` : cl.phase === 'stopped' ? '' : took

    const inner = Math.max(10, cols - 4)
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

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={border} paddingX={1} width="100%">
        <Box>
          <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden">
            {header}
          </Box>
          {timeText ? (
            <Box flexShrink={0} marginLeft={1}>
              <Text color={pal.dim}>{timeText}</Text>
            </Box>
          ) : null}
        </Box>
        {sum.total > 0 ? (
          <Box>
            <Text color={pal.dim}>{`${stepLabel} `}</Text>
            {meter('bar', bar)}
            <Text color={cl.phase === 'done' ? pal.good : pal.accent} bold>{` ${pctText}`}</Text>
          </Box>
        ) : null}
        {rows}
      </Box>
    )
  })
}

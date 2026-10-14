import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions, RenderChildren, Timer } from 'claude-code'

import type { CvAsk, CvChecklist } from '../types'
import {
  ASKED_IN_BAND,
  EMPTY_ASK,
  EMPTY_CHECKLIST,
  HAS_QUESTION,
  KEEPS_FAILING,
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
  classifyError,
  clampPercent,
  confirmPicks,
  easeToward,
  ensureJob,
  formatElapsed,
  fromTodos,
  hasRealPlan,
  isAnswered,
  isLive,
  overall,
  paletteFor,
  parseAsk,
  pickQuestion,
  pressOption,
  planSteps,
  reportProgress,
  rowLabel,
  startJob,
  titleFrom,
  titleFromReply,
  unfinished,
  updateTask,
  wrapText,
  type TodoItem,
} from './clean-logic'
import { drawCompact, drawDesktop, drawDesktopAsk } from './clean-draw'
import { sbFrameEdge, sbFramedBar, sbGood, sbKit, sbMeter, sbPalette, sbSweep, sbWarm, type SbSeg } from './sidebar-kit'

type Dollar = EngineInterface

const enabledAtom = atom({ plugin: 'clean-view', key: 'cleanViewEnabled' } as const, true)
const checklistAtom = atom({ plugin: 'clean-view', key: 'checklist' } as const, EMPTY_CHECKLIST)
const askAtom = atom({ plugin: 'clean-view', key: 'ask' } as const, EMPTY_ASK)
const tickAtom = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)
const themeAtom = atom({ plugin: 'clean-view', key: 'theme' } as const, 'dark')
const colourAtom = atom({ plugin: 'clean-view', key: 'colour' } as const, 'Coral')
const modesAtom = atom({ plugin: 'clean-view', key: 'modes' } as const, {})

/** The narrowest a step's outlined bar gets before the steps take another row. */
const STEP_MIN = 28

const PLAN = 'mcp__clean-view__plan_steps'
const REPORT = 'mcp__clean-view__report_progress'
const ALWAYS_ALLOWED = new Set(['ToolSearch', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion', PLAN, REPORT])

let ticker: Timer | undefined
/** The Style option: `Steps only` keeps the transcript as normal and draws a smaller checklist. */
let isStepsOnly = false
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
  // The band takes the Bottom Bar's colour setting, so the two match.
  try {
    const colour = (await $.config.list()).find(r => r.key === 'bottom-bar.colour')?.value
    if (typeof colour === 'string' && colour !== (await read($, colourAtom))) await update($, colourAtom, () => colour)
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

export function registerCleanView(on: On, options: PluginOptions = {}): void {
  isStepsOnly = options.style === 'Steps only'
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
    return { ...out, sections: [...out.sections, { id: 'clean-view:plan', text: isStepsOnly ? PLAN_RULES.replace('never your tool calls', 'next to your usual tool calls') : PLAN_RULES, scope: 'session' as const }] }
  })

  on('turn.start', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId !== undefined) return next(e)
    isWaitingForHelpers = false
    await readTheme($)
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
    if (isStepsOnly || !(await read($, enabledAtom))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (isStepsOnly || !(await read($, enabledAtom))) return next(e)
    return next({ ...e, props: { ...e.props, hint: '' } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const theme = await read($, themeAtom)
    const colour = await read($, colourAtom)
    const pal = paletteFor(theme, colour)
    const isOn = await read($, enabledAtom)
    const cl = await read($, checklistAtom)
    const tick = await read($, tickAtom)
    const now = await $.clock.now()

    // On and off live in the bottom bar's pill and /simple; the band shows only a job.
    const ask = await read($, askAtom)
    if (!isOn || (cl.phase === 'idle' && !ask.isOpen)) return next(e)
    const cols = e.props.bodyColumns
    const took = formatElapsed((cl.finishedAt > 0 ? cl.finishedAt : now) - cl.startedAt)

    // Shown once the job is no longer running (finished, stopped, stuck, waiting).
    const hasClose = cl.phase !== 'working' || cl.helpers > 0
    const onClose = () => void dismissBand($).catch(() => {})

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
          <Box flexShrink={0} marginLeft={1}>
            <Button key="close" plain dimColor onPress={onClose}>
              ✕
            </Button>
          </Box>
        </Box>
      )
    }

    // The checklist draws in Flightdeck's look: bars in rounded outlines with their labels set into the edges.
    const k = sbKit(els, e.surface, sbPalette(theme, colour), cols, tick)
    const kp = k.pal

    // A question takes the whole band in the same outlined look; the steps come back once it is answered.
    if (ask.isOpen && e.surface === 'desktop') {
      return drawDesktopAsk(els, kp, ask, {
        title: ask.questions.length > 1 ? ` · Question ${ask.current + 1} of ${ask.questions.length}` : ' · A question for you',
        onSkip: () => void closeAsk($, SKIPPED).catch(() => {}),
        onClose,
        onTab: i => void update($, askAtom, a => pickQuestion(a, i)).catch(() => {}),
        onOption: label => void changeAsk($, a => pressOption(a, label)).catch(() => {}),
        onOther: value => void changeAsk($, a => answerOther(a, value)).catch(() => {}),
        onDone: () => void changeAsk($, a => confirmPicks(a)).catch(() => {}),
      })
    }
    if (ask.isOpen) {
      const Input = 'Input' in els ? els.Input : undefined
      const q = ask.questions[ask.current]!
      const ticked = ask.picks[ask.current] ?? []
      const given = ask.answers[ask.current]
      const W = Math.max(16, cols)
      const inner = W - 4
      const many = ask.questions.length > 1
      const row = (key: string, body: RenderChildren) => (
        <Box key={key} width={W} height={1}>
          <Text color={kp.warn}>{'│ '}</Text>
          <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden">
            {body}
          </Box>
          <Text color={kp.warn}>{' │'}</Text>
        </Box>
      )
      const asked = wrapText(q.question, inner - 2).map((line, i) =>
        row(
          `qt${i}`,
          <Text>
            <Text color={kp.warn} bold>
              {i === 0 ? '? ' : '  '}
            </Text>
            <Text color={kp.text} bold>
              {line}
            </Text>
          </Text>,
        ),
      )
      const options = q.options.flatMap((o, i) => {
        const isOn = q.multiSelect ? ticked.includes(o.label) : given === o.label
        const mark = q.multiSelect ? (isOn ? '◼' : '◻') : isOn ? '●' : '○'
        const notes = o.description !== '' && o.description !== o.label ? wrapText(o.description, inner - 4) : []
        return [
          row(
            `ob${i}`,
            <Button key={`o${i}`} plain hotkey={String(i + 1)} onPress={() => void changeAsk($, a => pressOption(a, o.label)).catch(() => {})}>
              <Text color={kp.faint}>{`${i + 1} `}</Text>
              <Text color={isOn ? kp.good : kp.accent}>{`${mark} `}</Text>
              <Text color={isOn ? kp.good : kp.text} bold>
                {o.label}
              </Text>
            </Button>,
          ),
          ...notes.map((line, j) => row(`od${i}-${j}`, <Text color={kp.dim}>{`    ${line}`}</Text>)),
        ]
      })
      const tabs: SbSeg[] = ask.questions.flatMap((t, i) => {
            const isNow = i === ask.current
            const isDone = ask.answers[i] !== null
            return [
              ...(i > 0 ? [{ text: '  ', color: kp.warn }] : []),
              {
                text: `${isDone ? '✓' : isNow ? '▶' : '○'} ${t.header}`,
                color: isDone ? kp.good : isNow ? kp.text : kp.dim,
                bold: isNow,
                key: `q${i}`,
                onPress: () => void update($, askAtom, a => pickQuestion(a, i)).catch(() => {}),
              },
            ]
          })
      return (
        <Box flexDirection="column" width={W} flexShrink={0} backgroundColor={kp.panel}>
          {sbFrameEdge(
            k,
            'ask-top',
            W,
            ['╭', '╮'],
            [
              { text: '‖ Needs you', color: kp.warn, bold: true },
              { text: many ? ` · Question ${ask.current + 1} of ${ask.questions.length}` : ' · A question for you', color: kp.dim },
            ],
            [
              { text: 'Skip', color: kp.dim, key: 'skip', onPress: () => void closeAsk($, SKIPPED).catch(() => {}) },
              { text: ' ', color: kp.warn },
              { text: '✕', color: kp.dim, key: 'close', onPress: onClose },
            ],
            kp.warn,
          )}
          {asked}
          {row('gap', <Text> </Text>)}
          {options}
          {Input
            ? row(
                'other-row',
                <Input
                  key="other"
                  placeholder={OTHER_HINT}
                  submitLabel="answer"
                  onSubmit={(value: string) => void changeAsk($, a => answerOther(a, value)).catch(() => {})}
                />,
              )
            : null}
          {q.multiSelect
            ? row(
                'done-row',
                <Button key="done" plain hotkey="d" onPress={() => void changeAsk($, a => confirmPicks(a)).catch(() => {})}>
                  <Text color={ticked.length > 0 ? kp.good : kp.faint} bold>
                    d: Done
                  </Text>
                </Button>,
              )
            : null}
          {sbFrameEdge(k, 'ask-bot', W, ['╰', '╯'], tabs, [], kp.warn)}
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

    const full = Math.max(16, cols)
    const sum = overall(cl)
    const isWorking = cl.phase === 'working'
    const isPaused = cl.phase === 'needs-you'

    const outline =
      isPaused ? kp.warn : cl.phase === 'done' ? kp.good : cl.phase === 'stuck' ? kp.bad : cl.phase === 'stopped' ? kp.faint : kp.dim
    const top: SbSeg[] = isPaused
        ? [
            { text: '‖ Needs you', color: kp.warn, bold: true },
            { text: ` · ${cl.needsYouReason}`, color: kp.text },
          ]
        : cl.phase === 'stuck'
          ? [
              { text: '⚠ Stuck: ', color: kp.bad, bold: true },
              { text: cl.stuckReason, color: kp.text },
            ]
          : cl.phase === 'stopped'
            ? [
                { text: '■ Stopped', color: kp.dim, bold: true },
                { text: ` · ${cl.title} · you pressed Esc`, color: kp.dim },
              ]
            : cl.phase === 'done'
              ? [
                  { text: '✓ All done', color: kp.good, bold: true },
                  { text: ` · ${cl.title}`, color: kp.good },
                ]
              : [
                  { text: '✶ ', color: kp.warmFrom },
                  { text: cl.title, color: kp.text, bold: true },
                  ...(cl.helpers > 0 ? [{ text: ` · Waiting for ${cl.helpers} ${cl.helpers === 1 ? 'helper' : 'helpers'}`, color: kp.dim }] : []),
                ]
    const timeText = cl.phase === 'done' ? `took ${took}` : cl.phase === 'stopped' ? '' : took
    const topRight: SbSeg[] = [
      ...(timeText ? [{ text: hasClose ? `${timeText} ` : timeText, color: kp.dim }] : []),
      ...(hasClose ? [{ text: '✕', color: kp.dim, onPress: onClose, key: 'close' }] : []),
    ]
    const hasSteps = sum.total > 0
    const isDesktop = e.surface === 'desktop'

    if (isStepsOnly) {
      return drawCompact(els, kp, cl, {
        header: top,
        right: topRight,
        outline,
        isPaused,
        summary: !hasSteps ? '' : cl.phase === 'done' ? `${sum.total} of ${sum.total} steps` : `Step ${sum.step} of ${sum.total} · ${sum.percent}%`,
        width: full,
        isDesktop,
      })
    }

    if (isDesktop) {
      const warm = { from: kp.warmFrom, to: kp.warmTo }
      const good = { from: kp.goodFrom, to: kp.goodTo }
      return drawDesktop(els, kp, cl, {
        header: top,
        right: topRight,
        outline,
        isPaused,
        stepsText: cl.phase === 'done' ? `${sum.total} of ${sum.total} steps` : `Step ${sum.step} of ${sum.total}`,
        percentText: `${sum.percent}%`,
        isDone: cl.phase === 'done',
        bar: hasSteps
          ? { fraction: eased('all', sum.percent / 100), ...(cl.phase === 'done' ? good : warm) }
          : { fraction: 0, ...warm, isSweep: isWorking },
        stepBar: i => {
          const t = cl.tasks[i]!
          const isDone = t.status === 'done'
          const isActive = t.status === 'active'
          return {
            fraction: eased(t.id, isDone ? 1 : isActive ? t.percent / 100 : 0),
            ...(isDone ? good : warm),
            isSweep: isActive && !t.hasReported && isWorking,
          }
        },
      })
    }

    const jobFrame = sbFramedBar(k, 'job', {
      width: full,
      color: outline,
      bar: cells =>
        hasSteps
          ? sbMeter(cells, eased('all', sum.percent / 100), cl.phase === 'done' ? sbGood(k) : sbWarm(k))
          : isWorking
            ? sbSweep(cells, sbWarm(k))
            : sbMeter(cells, 0, sbWarm(k)),
      top,
      topRight,
      bottom: hasSteps
        ? [{ text: cl.phase === 'done' ? `${sum.total} of ${sum.total} steps` : `Step ${sum.step} of ${sum.total}`, color: kp.dim }]
        : [],
      bottomRight: hasSteps ? [{ text: `${sum.percent}%`, color: cl.phase === 'done' ? kp.good : kp.accent, bold: true }] : [],
    })

    // One outlined bar per step, side by side in rows like Flightdeck's usage limits.
    // Each bar is wide enough for the longest step name, its marker, its label and the outline.
    const n = cl.tasks.length
    const longest = Math.max(0, ...cl.tasks.map(t => [...t.name].length))
    const stepMin = Math.min(full, Math.max(STEP_MIN, longest + 16))
    const lines = Math.ceil(n / Math.max(1, Math.min(n, Math.floor((full + 1) / (stepMin + 1)))))
    const across = Math.max(1, Math.ceil(n / Math.max(1, lines)))
    const each = Math.floor((full - (across - 1)) / across)
    const stepFrame = (i: number, width: number) => {
      const t = cl.tasks[i]!
      const isDone = t.status === 'done'
      const isActive = t.status === 'active'
      const marker = isDone ? '✓' : isActive ? (isPaused ? '‖' : '▶') : '○'
      const look = isDone ? sbGood(k, i + 1) : sbWarm(k, i + 1)
      const label = rowLabel(cl.tasks, i)
      return sbFramedBar(k, t.id, {
        width,
        color: isActive ? (isPaused ? kp.warn : kp.accent) : isDone ? kp.dim : kp.sep,
        bar: cells =>
          isActive && !t.hasReported && isWorking
            ? sbSweep(cells, look)
            : sbMeter(cells, eased(t.id, isDone ? 1 : isActive ? t.percent / 100 : 0), look),
        top: [
          { text: `${marker} `, color: isDone ? kp.good : isActive ? (isPaused ? kp.warn : kp.accent) : kp.faint },
          { text: t.name, color: isDone ? kp.dim : isActive ? kp.text : kp.faint, bold: isActive },
        ],
        topRight: label ? [{ text: label, color: isActive ? kp.accent : kp.dim, bold: isActive && t.hasReported }] : [],
      })
    }
    const stepRows = Array.from({ length: lines }, (_, r) => {
      const first = r * across
      const count = Math.min(across, n - first)
      return (
        <Box key={`steps${r}`} columnGap={1}>
          {Array.from({ length: count }, (_, j) => stepFrame(first + j, j === across - 1 ? full - (across - 1) * (each + 1) : each))}
        </Box>
      )
    })

    return (
      <Box key="checklist" flexDirection="column" width={full} flexShrink={0}>
        {jobFrame}
        {stepRows}
      </Box>
    )
  })
}

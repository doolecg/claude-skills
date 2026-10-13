import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { CvChecklist } from '../types'
import {
  PLAN_RULES,
  USER_DENIED,
  addTask,
  classifyError,
  cleanName,
  ensureJob,
  formatElapsed,
  fromTodos,
  isLive,
  meterCells,
  padTo,
  planSteps,
  reportProgress,
  rowLabel,
  runs,
  startJob,
  sweep,
  titleFrom,
  unfinished,
  updateTask,
  EMPTY_CHECKLIST,
  type TodoItem,
} from './clean-logic'
import { PLAN_GATE, isNudge } from './dock-logic'

const enabledAtom = atom({ plugin: 'clean-view', key: 'cleanViewEnabled' } as const, true)
const checklistAtom = atom({ plugin: 'clean-view', key: 'checklist' } as const, EMPTY_CHECKLIST)
const tickAtom = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)

const PLAN = 'mcp__clean-view__plan_steps'
const REPORT = 'mcp__clean-view__report_progress'
const ALLOWED = new Set(['ToolSearch', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion', PLAN, REPORT])

let hasPlan = false
let failures = 0
let jobSeq = 0
let taskCounter = 0
let ticker: { cancel: () => void } | undefined

function syncTicker($: any, live: boolean): void {
  if (live && !ticker) {
    ticker = $.clock.every(250, () => {
      void update($, tickAtom, (n: number) => n + 1)
    })
  } else if (!live && ticker) {
    ticker.cancel()
    ticker = undefined
  }
}

async function mutate($: any, fn: (cl: CvChecklist) => CvChecklist): Promise<CvChecklist> {
  await update($, checklistAtom, fn)
  const cl = await read($, checklistAtom)
  syncTicker($, isLive(cl))
  return cl
}

async function setEnabled($: any, isOn: boolean): Promise<void> {
  await update($, enabledAtom, () => isOn)
  try {
    await $.store.set('cleanViewEnabled', isOn)
  } catch {}
  try {
    $.ui.invalidate('prompt.section')
  } catch {}
  $.ui.toast(isOn ? 'Clean View is on' : 'Clean View is off')
}

export function registerCleanView(on: On): void {
  on('session.start', async ($, e, next) => {
    try {
      const saved = await $.store.get('cleanViewEnabled')
      if (typeof saved === 'boolean') await update($, enabledAtom, () => saved)
    } catch {}
    await $.tool.register({
      name: 'plan_steps',
      description:
        'Lay out every step of the job up front: 2 to 8 short plain-English step names in order. The first step starts right away. Call this first for every request.',
      inputSchema: {
        type: 'object',
        properties: { steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 } },
        required: ['steps'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'report_progress',
      description:
        'Report progress on the current step: the step name and a percent from 0 to 100. Use 100 the moment a step is finished.',
      inputSchema: {
        type: 'object',
        properties: { task: { type: 'string' }, percent: { type: 'number', minimum: 0, maximum: 100 } },
        required: ['task', 'percent'],
      },
      isDeferred: false,
    })
    await $.command.register({
      name: 'simple',
      description: 'Turn Clean View on or off',
      argumentHint: '[on|off]',
    })
    return next(e)
  })

  on('command.run', { command: 'simple' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const current = await read($, enabledAtom)
    const target = arg === 'on' ? true : arg === 'off' ? false : !current
    await setEnabled($, target)
    return { text: target ? 'Clean View is on.' : 'Clean View is off.' }
  })

  on('tool.call', { tool: PLAN }, async ($, e, next) => {
    if (e.agentId) return next(e)
    const steps = Array.isArray(e.steps) ? (e.steps as unknown[]).map(String) : []
    if (steps.length === 0) return { result: 'Send steps as a list of 2 to 8 short names.' }
    const now = await $.clock.now()
    hasPlan = true
    taskCounter = 0
    await mutate($, cl => planSteps(ensureJob(cl, now), steps, now))
    const n = Math.min(8, steps.length)
    return { result: `Planned ${n} steps. The first one has started.` }
  })

  on('tool.call', { tool: REPORT }, async ($, e, next) => {
    const percent = Math.max(0, Math.min(100, Math.round(Number(e.percent) || 0)))
    if (e.agentId) return next(e)
    const now = await $.clock.now()
    await mutate($, cl => reportProgress(ensureJob(cl, now), String(e.task ?? ''), percent))
    return { result: `Progress noted: ${percent}%.` }
  })

  on('tool.call', { tool: /^/ }, async ($, e, next) => {
    if (e.agentId) return next(e)
    if (!(await read($, enabledAtom))) return next(e)
    const tool = String(e.tool)
    if (!hasPlan && !ALLOWED.has(tool)) {
      return {
        deny: `${PLAN_GATE} (mcp__clean-view__plan_steps, load it with ToolSearch if needed) with 2 to 8 short plain-English step names, then continue.`,
      }
    }
    const now = await $.clock.now()
    if (tool === 'TodoWrite') {
      hasPlan = true
      const todos = ((e as any).todos ?? []) as TodoItem[]
      await mutate($, cl => fromTodos(ensureJob(cl, now), todos))
    } else if (tool === 'TaskCreate') {
      hasPlan = true
      taskCounter += 1
      const key = `k${taskCounter}`
      await mutate($, cl => addTask(ensureJob(cl, now), String((e as any).subject ?? ''), key))
    } else if (tool === 'TaskUpdate') {
      const key = `k${String((e as any).taskId ?? '')}`
      const status = String((e as any).status ?? '')
      if (status !== '') await mutate($, cl => updateTask(cl, key, status))
    }
    const isQuestion = tool === 'AskUserQuestion'
    if (isQuestion) {
      await mutate($, cl =>
        isLive(cl) ? { ...cl, phase: 'needs-you', needsYouReason: 'Claude has a question for you' } : cl,
      )
    } else {
      await mutate($, cl => (cl.phase === 'needs-you' && !isWaitingForReply(cl) ? { ...cl, phase: 'working', needsYouReason: '' } : cl))
    }
    const ran = await next(e)
    if (isQuestion || ran.deny === undefined) {
      await mutate($, cl =>
        cl.phase === 'needs-you' && !isWaitingForReply(cl) ? { ...cl, phase: 'working', needsYouReason: '' } : cl,
      )
    }
    const text = ran.deny ?? ran.text ?? ''
    const isDenied = USER_DENIED.test(text)
    const isFailed = ran.deny !== undefined || ran.isError === true
    if (isDenied) {
      failures = 0
      await mutate($, cl =>
        isLive(cl) ? { ...cl, phase: 'stuck', stuckReason: 'You said no to a step, so Claude paused' } : cl,
      )
    } else if (isFailed && !isQuestion) {
      failures += 1
      if (failures >= 3) {
        await mutate($, cl =>
          isLive(cl) ? { ...cl, phase: 'stuck', stuckReason: 'A step keeps failing, Claude is trying another way' } : cl,
        )
      }
    } else if (!isFailed) {
      failures = 0
      await mutate($, cl => (cl.phase === 'stuck' ? { ...cl, phase: 'working', stuckReason: '' } : cl))
    }
    return ran
  })

  on('classic.Notification', async ($, e, next) => {
    if (await read($, enabledAtom)) {
      const isAsk = e.notification_type === 'permission_prompt' || /permission|approv|needs your/i.test(e.message)
      if (isAsk) {
        await mutate($, cl =>
          isLive(cl) ? { ...cl, phase: 'needs-you', needsYouReason: 'Claude needs your OK to continue' } : cl,
        )
      }
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await mutate($, cl =>
      cl.phase === 'needs-you' ? { ...cl, phase: 'working', needsYouReason: '' } : cl,
    )
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    if (!(await read($, enabledAtom))) return out
    return { sections: [...out.sections, { id: 'clean-view:plan', text: PLAN_RULES, scope: 'session' as const }] }
  })

  on('turn.start', async ($, e, next) => {
    const text = e.text.trim()
    if (text !== '' && !text.startsWith('/') && !isNudge(text) && (await read($, enabledAtom))) {
      const cl = await read($, checklistAtom)
      if (!isLive(cl)) {
        const now = await $.clock.now()
        jobSeq += 1
        const mine = jobSeq
        hasPlan = false
        failures = 0
        taskCounter = 0
        await mutate($, () => startJob(titleFrom(text), now))
        void (async () => {
          try {
            const r = await $.model.complete({
              model: 'haiku',
              effort: 'low',
              maxTokens: 24,
              prompt: `Name this job in 2 to 6 plain words, starting with a verb. Reply with the name only.\n\nRequest: ${text.slice(0, 500)}`,
            })
            if (r.isAnswered && mine === jobSeq) {
              const name = cleanName((r.text.split('\n')[0] ?? '').replace(/["'.]+$/g, '').replace(/^["']+/, ''))
              if (name !== 'Working on it') await mutate($, c => (isLive(c) ? { ...c, title: name } : c))
            }
          } catch {}
        })()
      }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    const cl = await read($, checklistAtom)
    if (isLive(cl)) {
      const now = await $.clock.now()
      if (e.reason === 'aborted') {
        await mutate($, c => ({ ...c, phase: 'stopped', finishedAt: now }))
      } else if (e.reason === 'error') {
        await mutate($, c => ({ ...c, phase: 'stuck', stuckReason: classifyError(e.answer ?? '') }))
      } else if (e.reason === 'refusal') {
        await mutate($, c => ({ ...c, phase: 'stuck', stuckReason: "Claude couldn't help with that request" }))
      } else if (unfinished(cl)) {
        await mutate($, c => ({ ...c, phase: 'needs-you', needsYouReason: 'Claude is waiting for your reply' }))
      } else {
        await mutate($, c => ({
          ...c,
          phase: 'done',
          finishedAt: now,
          isCollapsed: false,
          tasks: c.tasks.map(t => ({ ...t, status: 'done' as const, percent: 100 })),
        }))
        $.clock.after(5000, () => {
          void mutate($, c => (c.phase === 'done' && c.finishedAt === now ? { ...c, isCollapsed: true } : c))
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
    const { Box, Text, Button } = $.ui.resolve(e)
    const isOn = await read($, enabledAtom)
    const cl = await read($, checklistAtom)
    const tick = await read($, tickAtom)
    const now = await $.clock.now()

    const toggle = (
      <Button
        key="toggle"
        label={isOn ? '● Clean View: ON' : '○ Clean View: OFF'}
        onPress={() => {
          void (async () => setEnabled($, !(await read($, enabledAtom))))()
        }}
      />
    )
    const dockButton = <Button key="dock" label="◆ Dock" dimColor onPress={() => undefined} />
    const dockPart = dockButton

    if (!isOn || cl.phase === 'idle') {
      return (
        <Box justifyContent="flex-end" gap={1}>
          {dockPart}
          {toggle}
        </Box>
      )
    }

    const elapsed = formatElapsed((cl.finishedAt > 0 ? cl.finishedAt : now) - cl.startedAt)
    let header
    if (cl.phase === 'needs-you') {
      header = (
        <Text wrap="truncate-end">
          <Text inverse bold> Needs you </Text>
          <Text> {cl.needsYouReason}</Text>
        </Text>
      )
    } else if (cl.phase === 'stuck') {
      header = (
        <Text wrap="truncate-end">
          <Text color="warning" bold>⚠ Stuck: </Text>
          <Text>{cl.stuckReason}</Text>
        </Text>
      )
    } else if (cl.phase === 'stopped') {
      header = (
        <Text wrap="truncate-end" dimColor>
          ■ Stopped · {cl.title} · you pressed Esc
        </Text>
      )
    } else if (cl.phase === 'done') {
      header = (
        <Text wrap="truncate-end">
          <Text color="success" bold>✓ All done</Text>
          <Text dimColor> · {cl.title} · took {elapsed}</Text>
        </Text>
      )
    } else {
      header = (
        <Text wrap="truncate-end">
          <Text bold>{cl.title}</Text>
          <Text dimColor> · {elapsed}</Text>
        </Text>
      )
    }

    const cols = e.props.bodyColumns
    const nameW = Math.max(8, Math.min(40, cols - 2 - 1 - 10 - 2 - 8))
    const showRows = (cl.phase === 'working' || cl.phase === 'needs-you' || cl.phase === 'stuck' || (cl.phase === 'done' && !cl.isCollapsed)) && cl.tasks.length > 0

    const rows = showRows
      ? cl.tasks.map((t, i) => {
          const isDone = t.status === 'done'
          const isActive = t.status === 'active'
          const marker = isDone ? '✓' : isActive ? (cl.phase === 'needs-you' ? '‖' : '▶') : '○'
          const filled = isDone ? 10 : isActive && t.hasReported ? meterCells(t.percent) : 0
          const meter =
            isActive && !t.hasReported
              ? runs(sweep(tick)).map((r, k) => (
                  <Text key={`m${k}`} color={r.ch === '█' ? 'cyan' : undefined} dimColor={r.ch !== '█'}>
                    {r.text}
                  </Text>
                ))
              : [
                  <Text key="f" color={isDone ? 'success' : 'cyan'}>{'█'.repeat(filled)}</Text>,
                  <Text key="e" dimColor>{'░'.repeat(10 - filled)}</Text>,
                ]
          return (
            <Box key={t.id}>
              <Text color={isDone ? 'success' : isActive ? 'cyan' : undefined} dimColor={!isDone && !isActive}>
                {marker}{' '}
              </Text>
              <Text bold={isActive} dimColor={!isActive} wrap="truncate-end">
                {padTo(t.name, nameW)}
              </Text>
              <Text> </Text>
              {meter}
              <Text dimColor={!isActive}>{'  ' + rowLabel(cl.tasks, i)}</Text>
            </Box>
          )
        })
      : []

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between" gap={1}>
          <Box flexShrink={1}>{header}</Box>
          <Box gap={1} flexShrink={0}>
            {dockPart}
            {toggle}
          </Box>
        </Box>
        {rows}
      </Box>
    )
  })
}

function isWaitingForReply(cl: CvChecklist): boolean {
  return cl.needsYouReason === 'Claude is waiting for your reply'
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { CvChecklist, CvTask } from '../types'
import { APP_PLAN_TOOL, APP_WRAP_TOOL, allDone, EMPTY_CHECKLIST, TODO_TOOLS, addTask, isAnimated, tasksFromList, tasksFromTodos, planStep, updateTask, withTasks } from './clean-logic'
import { drawTodoDesktop, drawTodoTerminal } from './clean-draw'
import { sbPalette } from './sidebar-kit'

type Dollar = EngineInterface

const enabledAtom = atom({ plugin: 'clean-view', key: 'cleanViewEnabled' } as const, true)
const checklistAtom = atom({ plugin: 'clean-view', key: 'checklist' } as const, EMPTY_CHECKLIST)
const tickAtom = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)
const todoUseAtom = atom({ plugin: 'clean-view', key: 'todoUse' } as const, '')
const themeAtom = atom({ plugin: 'clean-view', key: 'theme' } as const, 'dark')
const colourAtom = atom({ plugin: 'clean-view', key: 'colour' } as const, 'Coral')
const modesAtom = atom({ plugin: 'clean-view', key: 'modes' } as const, {})

let ticker: Timer | undefined
let taskCount = 0

/** The 250ms frame clock runs only while a live list has an item in progress. */
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
  // One more frame, so a row drawn from the list redraws with it.
  await update($, tickAtom, n => n + 1)
  return cl
}

/** Tells the bottom bar (and any mod that reads it) whether Task View is on. */
const publishMode = ($: Dollar, isOn: boolean) => update($, modesAtom, () => ({ simple: { label: 'Task View', isOn } }))

async function setEnabled($: Dollar, isOn: boolean): Promise<void> {
  await update($, enabledAtom, () => isOn)
  await publishMode($, isOn)
  try {
    await $.store.set('cleanViewEnabled', isOn)
  } catch {}
  $.ui.toast(isOn ? 'Task View is on: the to-do list is restyled' : 'Task View is off: the to-do list is back to normal')
}

async function readTheme($: Dollar): Promise<void> {
  try {
    const s = (await $.settings.read()) as Record<string, unknown>
    if (typeof s.theme === 'string' && s.theme !== (await read($, themeAtom))) await update($, themeAtom, () => s.theme as string)
  } catch {}
  // The list takes the Bottom Bar's colour setting, so the two match.
  try {
    const colour = (await $.config.list()).find(r => r.key === 'bottom-bar.colour')?.value
    if (typeof colour === 'string' && colour !== (await read($, colourAtom))) await update($, colourAtom, () => colour)
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

/** The list a to-do tool's row draws: a TodoWrite call's own items, or the running list for the Task tools. */
function listFor(tool: string, input: unknown, output: unknown, cl: CvChecklist): CvTask[] {
  if (tool === 'TodoWrite') {
    const own = tasksFromTodos((input as { todos?: unknown } | undefined)?.todos)
    return own.length > 0 ? own : tasksFromTodos((output as { newTodos?: unknown } | undefined)?.newTodos)
  }
  return cl.tasks
}

/** Draws one to-do row. Top level because it takes `$`. */
async function drawTodo($: Dollar, e: any, next: (e: any) => Promise<any>): Promise<any> {
  const els = $.ui.resolve(e)
  const { Box } = els
  const tool = String(e.props.tool)
  const cl = await read($, checklistAtom)
  const latest = await read($, todoUseAtom)
  const id = String(e.props.tool_use_id ?? '')
  // The Task tools each change the one running list, so only the latest of them draws it.
  if (tool !== 'TodoWrite' && id !== latest) return <Box display="none" />
  const tasks = listFor(tool, e.props.input, e.props.output, cl)
  if (tasks.length === 0) return next(e)
  const pal = sbPalette(await read($, themeAtom), await read($, colourAtom))
  const d = { pal, isLive: id === latest && cl.phase === 'working', tick: await read($, tickAtom), columns: e.props.bodyColumns }
  return e.surface === 'desktop' ? drawTodoDesktop(els, d, tasks) : drawTodoTerminal(els, d, tasks)
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
    await $.command.register({
      name: 'simple',
      description: 'Turn Task View on or off (no argument flips it)',
      argumentHint: '[on|off]',
    })
    syncTicker($, await read($, checklistAtom))
    return ran
  })

  on('command.run', { command: 'simple' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const target = arg === 'on' ? true : arg === 'off' ? false : !(await read($, enabledAtom))
    await setEnabled($, target)
    return { text: target ? 'Task View is on.' : 'Task View is off.' }
  })

  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (e.command === 'theme' || e.command === 'config') await readTheme($)
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId !== undefined) return next(e)
    await readTheme($)
    // A list that was paused or stopped moves again when the next turn starts.
    await change($, cl => (cl.phase === 'needs-you' || cl.phase === 'stopped' ? { ...cl, phase: 'working' } : cl))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (tool === APP_WRAP_TOOL && e.agentId === undefined && (await read($, enabledAtom))) {
      const now = await $.clock.now()
      await change($, cl => (cl.phase === 'working' ? withTasks(cl, allDone(cl.tasks), now) : cl))
      return next(e)
    }
    if (e.agentId !== undefined || !TODO_TOOLS.has(tool) || !(await read($, enabledAtom))) return next(e)
    const args = e as unknown as Record<string, unknown>
    const now = await $.clock.now()
    await update($, todoUseAtom, () => e.tool_use_id)
    if (tool === 'TodoWrite') {
      await change($, cl => withTasks(cl, tasksFromTodos(args.todos), now))
      return next(e)
    }
    if (tool === APP_PLAN_TOOL) {
      await change($, cl => withTasks(cl, planStep(cl.tasks, args), now))
      return next(e)
    }
    if (tool === 'TaskUpdate') {
      const id = `k${String(args.taskId ?? '')}`
      await change($, cl => withTasks(cl, updateTask(cl.tasks, id, args.status, args.subject), now))
      return next(e)
    }
    const ran = await next(e)
    if (tool === 'TaskCreate' && ran.deny === undefined) {
      taskCount += 1
      const id = `k${createdId(ran) ?? taskCount}`
      await change($, cl => withTasks(cl, addTask(cl.tasks, args.subject, id), now))
    } else if (tool === 'TaskList' && ran.deny === undefined) {
      const listed = tasksFromList((ran as { result?: unknown }).result)
      if (listed.length > 0) await change($, cl => withTasks(cl, listed, now))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const cl = await read($, checklistAtom)
    if (cl.phase === 'working') {
      const now = await $.clock.now()
      // Nothing moves once the turn is over: stopped by Esc, or waiting for the person.
      await change($, c =>
        e.reason === 'aborted' ? { ...c, phase: 'stopped', finishedAt: now } : { ...c, phase: 'needs-you', needsYouReason: 'Claude is waiting for your reply' },
      )
    }
    return next(e)
  })

  on('ui.render', { component: ['ToolUse', 'ToolResult'] }, async ($, e, next) => {
    if (!(await read($, enabledAtom)) || !TODO_TOOLS.has(String(e.props.tool))) return next(e)
    if (e.component === 'ToolResult') {
      const { Box } = $.ui.resolve(e)
      return <Box display="none" />
    }
    return drawTodo($, e, next)
  })
}

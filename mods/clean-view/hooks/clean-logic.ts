import type { CvChecklist, CvTask } from '../types'

export const TITLE = 'To-do'

export const EMPTY_CHECKLIST: CvChecklist = {
  title: '',
  phase: 'idle',
  tasks: [],
  needsYouReason: '',
  stuckReason: '',
  startedAt: 0,
  finishedAt: 0,
  isCollapsed: false,
  helpers: 0,
}

/** The tools that write Claude's to-do list. */
export const TODO_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'mcp__ccd_turn__update_plan'])

/** The desktop app's own working list, written by its update_plan tool. */
export const APP_PLAN_TOOL = 'mcp__ccd_turn__update_plan'

/** The app's wrap_up tool, which checks off the whole working list. */
export const APP_WRAP_TOOL = 'mcp__ccd_turn__wrap_up'

/** Every task checked off. */
export const allDone = (tasks: readonly CvTask[]): CvTask[] => tasks.map(t => ({ ...t, status: 'done' as const, percent: 100 }))

let MAX_ITEMS = 24
let MAX_TEXT = 120

/** Sets how many items a list keeps and how long an item name may be (the Max items and Max name length settings). */
export function setLimits(items: unknown, text: unknown): void {
  const whole = (v: unknown, lo: number, hi: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback
  MAX_ITEMS = whole(items, 1, 100, 24)
  MAX_TEXT = whole(text, 10, 300, 120)
}

export type TodoItem = { content?: unknown; subject?: unknown; status?: unknown }

function clip(raw: unknown): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (s === '') return 'Untitled'
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1).trimEnd()}…` : s
}

function statusOf(raw: unknown): CvTask['status'] {
  return raw === 'completed' ? 'done' : raw === 'in_progress' ? 'active' : 'upcoming'
}

function task(id: string, name: unknown, status: CvTask['status']): CvTask {
  return { id, name: clip(name), status, percent: status === 'done' ? 100 : 0, hasReported: false }
}

/** The items of a TodoWrite call, as tasks. Anything that is not a list gives none. */
export function tasksFromTodos(todos: unknown): CvTask[] {
  if (!Array.isArray(todos)) return []
  return (todos as TodoItem[])
    .filter(t => t && typeof t === 'object')
    .slice(0, MAX_ITEMS)
    .map((t, i) => task(`t${i}`, t.content ?? t.subject, statusOf(t.status)))
}

/** The items of a TaskList result, as tasks. */
export function tasksFromList(result: unknown): CvTask[] {
  const list = (result as { tasks?: unknown } | undefined)?.tasks
  if (!Array.isArray(list)) return []
  return (list as { id?: unknown; subject?: unknown; status?: unknown }[])
    .slice(0, MAX_ITEMS)
    .map((t, i) => task(`k${t.id ?? i}`, t.subject, statusOf(t.status)))
}

/** Done, total and the percent done; the in-progress item gives Claude no percent, so it counts as not done. */
export function summary(tasks: readonly CvTask[]): { done: number; total: number; percent: number; isAllDone: boolean } {
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100), isAllDone: total > 0 && done === total }
}

/** The published checklist for a list of tasks: working while any is open, done when all are. */
export function withTasks(cl: CvChecklist, tasks: CvTask[], now: number): CvChecklist {
  if (tasks.length === 0) return EMPTY_CHECKLIST
  const isAllDone = summary(tasks).isAllDone
  const isOpen = cl.phase !== 'idle' && cl.phase !== 'done'
  const startedAt = cl.startedAt > 0 && (isOpen || cl.phase === 'done') ? cl.startedAt : now
  return {
    ...EMPTY_CHECKLIST,
    title: TITLE,
    phase: isAllDone ? 'done' : 'working',
    tasks,
    startedAt,
    finishedAt: isAllDone ? (cl.phase === 'done' && cl.finishedAt > 0 ? cl.finishedAt : now) : 0,
  }
}

/** A TaskCreate: the new task joins the running list. */
export function addTask(tasks: readonly CvTask[], subject: unknown, id: string): CvTask[] {
  return [...tasks.filter(t => t.id !== id), task(id, subject, 'upcoming')].slice(0, MAX_ITEMS)
}

/** A TaskUpdate: a new status, a new name, or the task taken off. */
export function updateTask(tasks: readonly CvTask[], id: string, status: unknown, subject: unknown): CvTask[] {
  if (status === 'deleted') return tasks.filter(t => t.id !== id)
  return tasks.map(t => {
    if (t.id !== id) return t
    const next = typeof status === 'string' ? statusOf(status) : t.status
    return { ...t, name: typeof subject === 'string' && subject.trim() !== '' ? clip(subject) : t.name, status: next, percent: next === 'done' ? 100 : 0 }
  })
}

/**
 * An update_plan call in the desktop app: `items` replaces the list; `advance` finishes the step in
 * progress and starts the next; `done` and `start` (1-based) mark steps out of order.
 */
export function planStep(tasks: readonly CvTask[], args: { items?: unknown; advance?: unknown; done?: unknown; start?: unknown }): CvTask[] {
  if (Array.isArray(args.items)) return tasksFromTodos(args.items)
  const out = tasks.map(t => ({ ...t }))
  const mark = (i: number, status: CvTask['status']) => {
    if (out[i]) out[i] = { ...out[i], status, percent: status === 'done' ? 100 : 0 }
  }
  if (args.advance === true) {
    const at = out.findIndex(t => t.status === 'active')
    if (at >= 0) mark(at, 'done')
    const nextAt = out.findIndex(t => t.status === 'upcoming')
    if (nextAt >= 0) mark(nextAt, 'active')
  }
  if (Array.isArray(args.done)) for (const n of args.done) if (typeof n === 'number') mark(n - 1, 'done')
  if (typeof args.start === 'number') mark(args.start - 1, 'active')
  return out
}

/** The 250ms frame clock is needed only while a live list has an item in progress. */
export const isAnimated = (cl: CvChecklist): boolean => cl.phase === 'working' && cl.tasks.some(t => t.status === 'active')

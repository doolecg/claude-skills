import type { CvChecklist, CvTask } from '../types'

export const EMPTY_CHECKLIST: CvChecklist = {
  title: '',
  phase: 'idle',
  tasks: [],
  needsYouReason: '',
  stuckReason: '',
  startedAt: 0,
  finishedAt: 0,
  isCollapsed: false,
}

export const MAX_NAME = 40
const FALLBACK = 'Working on it'
const CODE_EXT =
  /\.(tsx?|jsx?|mjs|cjs|java|kt|py|rb|go|rs|cs|cpp|hpp|c|h|json|ya?ml|toml|xml|html?|css|scss|md|sh|bat|ps1|gradle|sql|lock|txt|properties)$/i

export function cleanName(raw: string): string {
  const stripped = String(raw ?? '').replace(/`[^`]*`/g, ' ').replace(/`/g, ' ')
  const words = stripped
    .split(/\s+/)
    .filter(w => w !== '' && !/[\/]/.test(w) && !CODE_EXT.test(w.replace(/[.,;:!?)"']+$/, '')))
  let s = words.join(' ').trim()
  if (s === '') return FALLBACK
  if (s.length > MAX_NAME) {
    let cut = s.slice(0, MAX_NAME - 1)
    if (s[MAX_NAME - 1] !== ' ') {
      const space = cut.lastIndexOf(' ')
      if (space > 0) cut = cut.slice(0, space)
    }
    s = cut.trimEnd().replace(/[,;:.\-]+$/, '') + '…'
  }
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function titleFrom(text: string): string {
  const clause = text.split(/[.!?\n,;:]/).find(part => part.trim() !== '') ?? ''
  const cleaned = cleanName(clause)
  const words = cleaned.split(' ')
  return words.length > 6 ? words.slice(0, 6).join(' ') : cleaned
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function clampPercent(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}

export function isLive(cl: CvChecklist): boolean {
  return cl.phase === 'working' || cl.phase === 'needs-you' || cl.phase === 'stuck'
}

function task(id: string, name: string, status: CvTask['status']): CvTask {
  return { id, name, status, percent: status === 'done' ? 100 : 0, hasReported: false }
}

export function startJob(title: string, now: number): CvChecklist {
  return {
    ...EMPTY_CHECKLIST,
    title,
    phase: 'working',
    startedAt: now,
    tasks: [task('ph-0', 'Understand your request', 'active'), task('ph-1', 'Plan the steps', 'upcoming')],
  }
}

export function planSteps(cl: CvChecklist, names: string[], now: number): CvChecklist {
  const cleaned = names.map(cleanName).slice(0, 8)
  if (cleaned.length === 0) return cl
  const base = isLive(cl) ? cl : { ...EMPTY_CHECKLIST, title: cl.title || (cleaned[0] ?? ''), startedAt: now }
  return {
    ...base,
    phase: 'working',
    needsYouReason: '',
    stuckReason: '',
    isCollapsed: false,
    finishedAt: 0,
    tasks: cleaned.map((n, i) => task(`p${i}`, n, i === 0 ? 'active' : 'upcoming')),
  }
}

export function reportProgress(cl: CvChecklist, rawTask: string, rawPercent: unknown): CvChecklist {
  const percent = clampPercent(rawPercent)
  const name = cleanName(rawTask)
  let tasks = cl.tasks.map(t => ({ ...t }))
  let idx = tasks.findIndex(t => t.name.toLowerCase() === name.toLowerCase())
  if (idx < 0) {
    tasks = tasks.filter(t => !t.id.startsWith('ph-'))
    tasks.push({ id: `n${tasks.length}`, name, status: 'upcoming', percent: 0, hasReported: false })
    idx = tasks.length - 1
  }
  for (let i = 0; i < idx; i++) {
    const t = tasks[i]!
    t.status = 'done'
    t.percent = 100
  }
  const cur = tasks[idx]!
  if (cur.status !== 'done' || percent >= 100) {
    cur.hasReported = true
    cur.percent = percent
    cur.status = percent >= 100 ? 'done' : 'active'
  }
  if (cur.status === 'done') {
    const next = tasks.slice(idx + 1).find(t => t.status === 'upcoming')
    if (next && !tasks.some(t => t.status === 'active')) next.status = 'active'
  }
  return { ...cl, tasks }
}

export type TodoItem = { content?: string; subject?: string; status?: string }

export function fromTodos(cl: CvChecklist, todos: TodoItem[]): CvChecklist {
  const old = new Map(cl.tasks.map(t => [t.name.toLowerCase(), t]))
  const tasks: CvTask[] = todos.slice(0, 12).map((t, i) => {
    const name = cleanName(t.content ?? t.subject ?? '')
    const prev = old.get(name.toLowerCase())
    const status: CvTask['status'] =
      t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : 'upcoming'
    return {
      id: `t${i}`,
      name,
      status,
      percent: status === 'done' ? 100 : status === 'active' ? (prev?.percent ?? 0) : 0,
      hasReported: status === 'active' ? (prev?.hasReported ?? false) : false,
    }
  })
  if (tasks.length > 0 && !tasks.some(t => t.status === 'active')) {
    const first = tasks.find(t => t.status === 'upcoming')
    if (first) first.status = 'active'
  }
  return { ...cl, tasks, phase: isLive(cl) ? cl.phase : 'working' }
}

export function rowLabel(tasks: CvTask[], i: number): string {
  const t = tasks[i]!
  if (t.status === 'done') return 'Done'
  if (t.status === 'active') return t.hasReported ? `${t.percent}%` : 'Working'
  const firstUpcoming = tasks.findIndex(x => x.status === 'upcoming')
  return firstUpcoming === i ? 'Next' : 'Up next'
}

export function meterCells(percent: number, width = 10): number {
  return Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
}

export function sweep(tick: number, width = 10): string {
  const pos = tick % (width + 3)
  let out = ''
  for (let i = 0; i < width; i++) out += i >= pos - 3 && i < pos ? '█' : '░'
  return out
}

export function classifyError(text: string): string {
  const t = text.toLowerCase()
  if (/usage limit|rate limit|rate_limit|429|quota/.test(t))
    return 'You hit your usage limit, try again a little later'
  if (/overload|529|busy|503/.test(t)) return "Claude's servers are busy, try again in a minute"
  if (/too long|context|maximum.*tokens|prompt is too/.test(t)) return 'Type /compact and try again'
  if (/network|econn|enotfound|fetch failed|connection|timeout|offline/.test(t))
    return 'The internet connection dropped'
  if (/auth|401|403|api key|login|credential/.test(t)) return 'Type /login'
  return 'Something went wrong, try again'
}

export const USER_DENIED = /doesn't want to proceed|user rejected|user denied|permission.*denied|was denied|rejected by the user/i

export function unfinished(cl: CvChecklist): boolean {
  return cl.tasks.some(t => t.status !== 'done' && !t.id.startsWith('ph-'))
}

export function ensureJob(cl: CvChecklist, now: number): CvChecklist {
  if (isLive(cl)) return cl
  return { ...EMPTY_CHECKLIST, title: cl.title, phase: 'working', startedAt: now }
}

export function addTask(cl: CvChecklist, subject: string, key: string): CvChecklist {
  const tasks = cl.tasks.filter(t => !t.id.startsWith('ph-'))
  const hasActive = tasks.some(t => t.status === 'active')
  tasks.push({
    id: key,
    name: cleanName(subject),
    status: hasActive ? 'upcoming' : 'active',
    percent: 0,
    hasReported: false,
  })
  return { ...cl, tasks }
}

export function updateTask(cl: CvChecklist, key: string, status: string): CvChecklist {
  if (status === 'deleted') return { ...cl, tasks: cl.tasks.filter(t => t.id !== key) }
  const tasks = cl.tasks.map(t => {
    if (t.id !== key) return t
    if (status === 'completed') return { ...t, status: 'done' as const, percent: 100 }
    if (status === 'in_progress') return { ...t, status: 'active' as const }
    return { ...t, status: 'upcoming' as const, percent: 0 }
  })
  if (!tasks.some(t => t.status === 'active')) {
    const first = tasks.find(t => t.status === 'upcoming')
    if (first) first.status = 'active'
  }
  return { ...cl, tasks }
}

export function padTo(text: string, width: number): string {
  if (text.length > width) return text.slice(0, Math.max(0, width - 1)) + '…'
  return text.padEnd(width)
}

export function runs(str: string): { ch: string; text: string }[] {
  const out: { ch: string; text: string }[] = []
  for (const c of str) {
    const last = out[out.length - 1]
    if (last && last.ch === c) last.text += c
    else out.push({ ch: c, text: c })
  }
  return out
}

export const PLAN_RULES = [
  'Clean View is on: the person sees only a plain checklist, never tool calls.',
  'Write every step name in plain English a non-technical person understands. Keep it under 40 characters and start with a verb, like "Build the pricing section".',
  'Never put file paths, file names, commands, code or tool names in a step name.',
  'For every request, even a quick question, call plan_steps first (mcp__clean-view__plan_steps; load it with ToolSearch if it is deferred) with 2 to 8 step names. Then call report_progress (mcp__clean-view__report_progress) as real progress happens, and with percent 100 the moment a step finishes.',
  'If TodoWrite or TaskCreate is available you may use that to-do list as the plan instead.',
].join(' ')

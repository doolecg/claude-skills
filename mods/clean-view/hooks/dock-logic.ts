import type { DockCard, DockState } from '../types'

export const SIZES = [1, 3, 5, 10, 20, 50, 100] as const
export const BIG_TEAM = 20
export const PANE_ID = 'agent-dock'
export const NUDGE_PREFIX = 'You used '
export const PLAN_GATE = 'Call plan_steps first'

export const EMPTY_DOCK: DockState = {
  teamSize: 1,
  helperModel: 'fast',
  pendingSize: 0,
  isCustomOpen: false,
  isFolded: false,
  limit: 20,
  missionName: '',
  missionStartedAt: 0,
  missionFinishedAt: 0,
  cards: [],
}

export const CORAL = '#E8735A'
export const GOLD = '#E5B45B'
export const GREEN = '#5BBF7A'
export const RED = '#D9534F'

export function parseSize(text: string): number | null {
  const t = String(text ?? '').trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= 100 ? n : null
}

export function restoreSize(saved: unknown, isSameSession: boolean): number {
  const n = typeof saved === 'number' && Number.isInteger(saved) ? saved : 1
  if (n < 1 || n > 100) return 1
  return n > BIG_TEAM && !isSameSession ? 1 : n
}

export function jobName(text: string): string {
  const clause = text.split(/[.!?\n,;:]/).find(part => part.trim() !== '') ?? ''
  const s = clause.trim().replace(/\s+/g, ' ')
  if (s === '') return 'Your request'
  if (s.length <= 40) return s.charAt(0).toUpperCase() + s.slice(1)
  let cut = s.slice(0, 39)
  if (s[39] !== ' ') {
    const sp = cut.lastIndexOf(' ')
    if (sp > 0) cut = cut.slice(0, sp)
  }
  const out = cut.trimEnd() + '…'
  return out.charAt(0).toUpperCase() + out.slice(1)
}

export function taskName(desc: string): string {
  const words = String(desc ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'Helper task'
  return words.slice(0, 5).join(' ')
}

export function initials(name: string): string {
  const words = name.split(/\s+/).map(w => w.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean)
  if (words.length === 0) return '??'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase().padEnd(2, '.')
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase()
}

const BADGES = ['#5B8DEF', '#8E6FD8', '#3FA796', '#D1805A', '#C0658A', '#6A9F4B', '#B89A3E', '#4C9BB8']

export function badgeColor(index: number): string {
  return BADGES[Math.abs(index) % BADGES.length]!
}

export function instructionText(n: number): string {
  return [
    `Agent Dock: Team Size is ${n}.`,
    `Split this request into exactly ${n} independent pieces and launch one helper (the Agent tool) per piece, all in one message so they run in parallel.`,
    `Find a real split, one helper per item (per store, task, file, section). Never argue it can't be split and never pad with useless work.`,
    `Give each helper a short plain-English description of 3 to 5 words, e.g. "Price check: Panera".`,
    `In each helper's prompt add: "As you work, call report_progress with your task name and a percent at about 25, 50, 75 and 100. Do not call plan_steps."`,
    `When they finish, combine the results into one answer.`,
  ].join(' ')
}

export function nudgeText(used: number, n: number): string {
  return `${NUDGE_PREFIX}${used} of ${n} helpers. Split the remaining work across the other ${n - used}, one helper per piece, all in parallel.`
}

export function isNudge(text: string): boolean {
  return text.startsWith(NUDGE_PREFIX) && /helpers\. Split the remaining work/.test(text)
}

export function capText(n: number): string {
  return `Team Size is ${n}: this request already has ${n} helpers. Finish with the helpers you have.`
}

export function atATime(maxConcurrent: string | undefined, maxToolUse: string | undefined): number {
  const a = Number.parseInt(maxConcurrent ?? '', 10)
  const b = Number.parseInt(maxToolUse ?? '', 10)
  return Math.min(a > 0 ? a : 20, b > 0 ? b : 10)
}

export type Counts = { working: number; queued: number; done: number; stuck: number }

export function counts(cards: readonly DockCard[]): Counts {
  const c: Counts = { working: 0, queued: 0, done: 0, stuck: 0 }
  for (const card of cards) c[card.status]++
  return c
}

export function isLiveCards(cards: readonly DockCard[]): boolean {
  return cards.some(c => c.status === 'working' || c.status === 'queued')
}

export function isComplete(cards: readonly DockCard[]): boolean {
  return cards.length > 0 && !isLiveCards(cards)
}

export function badgeText(cards: readonly DockCard[]): string {
  const c = counts(cards)
  return `${c.working} working · ${c.queued} queued · ${c.done} done`
}

export function overallPercent(cards: readonly DockCard[]): number {
  if (cards.length === 0) return 0
  const sum = cards.reduce((a, c) => a + (c.status === 'done' || c.status === 'stuck' ? 100 : c.percent), 0)
  return Math.round(sum / cards.length)
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function summary(n: number, job: string, ms: number, stuck: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const dur = m > 0 ? `${m}m ${total % 60}s` : `${total}s`
  const base = `${n} agent${n === 1 ? '' : 's'} finished ${job} in ${dur}`
  return stuck > 0 ? `${base} (${stuck} got stuck)` : base
}

export function bar(percent: number, width: number): { filled: number; empty: number } {
  const w = Math.max(1, width)
  const filled = Math.max(0, Math.min(w, Math.round((percent / 100) * w)))
  return { filled, empty: w - filled }
}

export function sweepPos(tick: number, width: number): number {
  return tick % Math.max(1, width + 4)
}

export function spaced(word: string): string {
  return word.split('').join(' ')
}

export function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => Number.parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => Number.parseInt(b.slice(i, i + 2), 16))
  const mix = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t))
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('')
}

export function infoLine(d: Pick<DockState, 'teamSize' | 'helperModel' | 'limit'>): string {
  const head = d.teamSize === 1 ? 'Claude decides how many helpers' : `Splits each request across ${d.teamSize} helpers`
  const model = d.helperModel === 'fast' ? 'Fast & Cheap' : 'Same model as you'
  return `${head}  ·  ${d.limit} at a time  ·  ${model}`
}

export function matchCard(cards: readonly DockCard[], agentId: string, task: string): DockCard | undefined {
  const own = cards.find(c => c.agentId === agentId)
  if (own) return own
  const t = task.trim().toLowerCase()
  const free = cards.filter(c => c.agentId === '' && c.status === 'working')
  return (
    free.find(c => c.name.toLowerCase() === t) ??
    free.find(c => t !== '' && (c.name.toLowerCase().includes(t) || t.includes(c.name.toLowerCase()))) ??
    free[0]
  )
}

export function pad(text: string, width: number): string {
  if (text.length > width) return text.slice(0, Math.max(0, width - 1)) + '…'
  return text.padEnd(width)
}

function blank(id: string, name: string): DockCard {
  return { id, name, status: 'queued', percent: 0, hasReported: false, startedAt: 0, endedAt: 0, agentId: '' }
}

function settle(d: DockState, cards: DockCard[], now: number): DockState {
  const live = isLiveCards(cards)
  return {
    ...d,
    cards,
    missionFinishedAt: cards.length > 0 && !live ? (d.missionFinishedAt > 0 ? d.missionFinishedAt : now) : 0,
  }
}

export function addQueued(d: DockState, items: { id: string; name: string }[], now: number): DockState {
  const cards = [...d.cards]
  for (const it of items) if (!cards.some(c => c.id === it.id)) cards.push(blank(it.id, taskName(it.name)))
  return { ...settle(d, cards, now), missionStartedAt: d.missionStartedAt > 0 ? d.missionStartedAt : now }
}

export function ensureCard(d: DockState, id: string, name: string, now: number): DockState {
  return addQueued(d, [{ id, name }], now)
}

export function removeCard(d: DockState, id: string): DockState {
  const cards = d.cards.filter(c => c.id !== id)
  return { ...d, cards, missionFinishedAt: 0 }
}

export function markWorking(d: DockState, id: string, now: number): DockState {
  return settle(d, d.cards.map(c => (c.id === id ? { ...c, status: 'working' as const, startedAt: now } : c)), now)
}

export function finishCard(d: DockState, id: string, isFailed: boolean, now: number): DockState {
  return settle(
    d,
    d.cards.map(c =>
      c.id === id
        ? { ...c, status: isFailed ? ('stuck' as const) : ('done' as const), percent: isFailed ? c.percent : 100, hasReported: true, endedAt: now }
        : c,
    ),
    now,
  )
}

export function applyProgress(d: DockState, agentId: string, task: string, percent: number): DockState {
  const card = matchCard(d.cards, agentId, task)
  if (!card) return d
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  return {
    ...d,
    cards: d.cards.map(c =>
      c.id === card.id
        ? { ...c, agentId, hasReported: true, percent: c.status === 'done' ? 100 : Math.max(c.percent, p) }
        : c,
    ),
  }
}

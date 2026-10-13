import type { Learning, Proposal, SelfImproveData } from '../../types'
import { redact } from './secrets'
import { dayKey } from './tokens'

export const emptyData = (): SelfImproveData => ({
  turns: 0,
  paused: false,
  pending: [],
  learnings: [],
  skills: {},
  prefs: [],
  usage: { day: '', tokens: 0 },
  status: '',
})

export const normalise = (raw: unknown): SelfImproveData => {
  const base = emptyData()
  if (typeof raw !== 'object' || raw === null) return base
  return { ...base, ...(raw as Partial<SelfImproveData>) }
}

const MAX_LEARNINGS = 200
const MAX_PENDING = 30
const MAX_PREFS = 40

export const tokensToday = (d: SelfImproveData, now: number): number =>
  d.usage.day === dayKey(now) ? d.usage.tokens : 0

export const isOverCap = (d: SelfImproveData, cap: number, now: number, reserve = 0): boolean =>
  cap > 0 && tokensToday(d, now) + reserve > cap

export const addUsage = (d: SelfImproveData, tokens: number, now: number): SelfImproveData => ({
  ...d,
  usage: { day: dayKey(now), tokens: tokensToday(d, now) + Math.max(0, Math.round(tokens)) },
})

export const countTurn = (d: SelfImproveData): SelfImproveData => ({ ...d, turns: d.turns + 1 })

export const addLearnings = (d: SelfImproveData, items: Learning[]): SelfImproveData => {
  const seen = new Set(d.learnings.map(l => l.text.toLowerCase()))
  const fresh = items
    .map(l => ({ ...l, text: redact(l.text).trim() }))
    .filter(l => l.text !== '' && !l.text.includes('[redacted]') && !seen.has(l.text.toLowerCase()))
  return { ...d, learnings: [...d.learnings, ...fresh].slice(-MAX_LEARNINGS) }
}

export const addPref = (d: SelfImproveData, text: string): SelfImproveData => {
  const t = redact(text).trim()
  if (t === '' || t.includes('[redacted]') || d.prefs.some(p => p.toLowerCase() === t.toLowerCase())) return d
  return { ...d, prefs: [...d.prefs, t].slice(-MAX_PREFS) }
}

export const queueProposal = (d: SelfImproveData, p: Proposal): SelfImproveData => {
  if (d.pending.some(x => x.name === p.name && x.action === p.action)) return d
  return { ...d, pending: [...d.pending, p].slice(-MAX_PENDING) }
}

export const dropProposal = (d: SelfImproveData, id: string): SelfImproveData => ({
  ...d,
  pending: d.pending.filter(p => p.id !== id),
})

export const editProposal = (
  d: SelfImproveData,
  id: string,
  patch: Partial<Pick<Proposal, 'description' | 'body'>>,
): SelfImproveData => ({
  ...d,
  pending: d.pending.map(p => (p.id === id ? { ...p, ...patch } : p)),
})

export const recordSkillUse = (d: SelfImproveData, name: string, now: number): SelfImproveData => {
  const s = d.skills[name]
  if (!s) return d
  return { ...d, skills: { ...d.skills, [name]: { ...s, uses: s.uses + 1, lastUsed: now } } }
}

export const recordCorrection = (d: SelfImproveData, names: string[]): SelfImproveData => {
  const skills = { ...d.skills }
  for (const n of names) if (skills[n]) skills[n] = { ...skills[n], corrections: skills[n].corrections + 1 }
  return { ...d, skills }
}

export const registerSkill = (d: SelfImproveData, name: string, now: number): SelfImproveData => ({
  ...d,
  skills: { ...d.skills, [name]: d.skills[name] ?? { uses: 0, corrections: 0, lastUsed: 0, created: now } },
})

export const unregisterSkill = (d: SelfImproveData, name: string): SelfImproveData => {
  const skills = { ...d.skills }
  delete skills[name]
  return { ...d, skills }
}

const DAY = 86_400_000

/** Learner-created skills that are weak (often corrected) or long unused. */
export const weakSkills = (d: SelfImproveData, now: number): { name: string; why: 'corrected' | 'unused' }[] => {
  const out: { name: string; why: 'corrected' | 'unused' }[] = []
  for (const [name, s] of Object.entries(d.skills)) {
    if (s.uses >= 2 && s.corrections / s.uses >= 0.4) out.push({ name, why: 'corrected' })
    else if (s.uses === 0 && now - s.created > 30 * DAY) out.push({ name, why: 'unused' })
  }
  return out
}

const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9_]+/).filter(w => w.length > 2)

/** Local recall: rank learnings, preferences and skill names by shared words with the query. */
export const searchLocal = (d: SelfImproveData, query: string, limit = 6): string[] => {
  const q = new Set(words(query))
  if (q.size === 0) return []
  const pool = [...d.learnings.map(l => l.text), ...d.prefs, ...Object.keys(d.skills).map(n => `skill: ${n}`)]
  return pool
    .map(t => ({ t, score: words(t).filter(w => q.has(w)).length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.t)
}

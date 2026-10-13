import type { Proposal } from '../../types'
import { redact } from './secrets'

export const sanitizeName = (raw: string): string | null => {
  const n = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return /^[a-z0-9][a-z0-9-]*$/.test(n) ? n : null
}

const oneLine = (s: string, max: number): string => redact(s).replace(/\s+/g, ' ').trim().slice(0, max)

export const buildSkillMd = (p: Pick<Proposal, 'name' | 'description' | 'body'>): string => {
  const desc = oneLine(p.description, 400).replace(/"/g, "'")
  const body = redact(p.body).trim()
  return `---\nname: ${p.name}\ndescription: "${desc}"\n---\n\n${body}\n`
}

/** Where a skill lives. home is the user's home directory. */
export const skillPath = (home: string, name: string): string | null => {
  if (sanitizeName(name) !== name || home === '') return null
  return `${home.replace(/[\\/]+$/, '').replace(/\\/g, '/')}/.claude/skills/${name}/SKILL.md`
}

export const validateProposal = (p: Pick<Proposal, 'name' | 'description' | 'body' | 'action'>): string | null => {
  if (sanitizeName(p.name) !== p.name) return 'invalid name'
  if (p.action === 'prune') return null
  if (oneLine(p.description, 400).length < 10) return 'description too short'
  if (p.body.trim().length < 40) return 'body too short'
  return null
}

export type ApprovalPlan =
  | { write?: { path: string; content: string }; remove?: string; error?: undefined }
  | { error: string }

/**
 * What approving a proposal does. Pure: the caller performs it. Only learner-owned
 * skills change after creation; a create never overwrites an existing learner skill.
 * A merge writes the target skill and removes the merged one.
 */
export const planApproval = (p: Proposal, home: string, owned: ReadonlySet<string>): ApprovalPlan => {
  const err = validateProposal(p)
  if (err) return { error: err }
  const path = skillPath(home, p.name)
  if (path === null) return { error: 'bad path' }
  if (p.action === 'create') return owned.has(p.name) ? { error: 'already exists' } : { write: { path, content: buildSkillMd(p) } }
  if (!owned.has(p.name)) return { error: 'not a learner skill' }
  if (p.action === 'prune') return { remove: p.name }
  if (p.action === 'rewrite') return { write: { path, content: buildSkillMd(p) } }
  const target = p.mergeInto ? skillPath(home, p.mergeInto) : null
  if (!p.mergeInto || target === null || !owned.has(p.mergeInto) || p.mergeInto === p.name) return { error: 'bad merge target' }
  return { write: { path: target, content: buildSkillMd({ ...p, name: p.mergeInto }) }, remove: p.name }
}

/** What happens to a fresh proposal: queued for the pane, or (auto mode) approved at once. */
export const routeProposal = (mode: 'ask' | 'auto'): 'queue' | 'approve' => (mode === 'auto' ? 'approve' : 'queue')

export const extractJson = (text: string): unknown => {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const src = (m?.[1] ?? text).trim()
  const starts = ['{', '['].map(c => src.indexOf(c)).filter(i => i >= 0)
  if (starts.length === 0) return null
  const start = Math.min(...starts)
  for (let end = src.length; end > start; end--) {
    const c = src[end - 1]
    if (c !== '}' && c !== ']') continue
    try {
      return JSON.parse(src.slice(start, end))
    } catch {
      // keep shrinking
    }
  }
  return null
}

export const parseProposal = (text: string, action: Proposal['action'], id: string, at: number): Proposal | null => {
  const j = extractJson(text) as Record<string, unknown> | null
  if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.name !== 'string') return null
  const name = sanitizeName(j.name)
  if (name === null) return null
  const merge = typeof j.mergeInto === 'string' ? sanitizeName(j.mergeInto) : null
  const p: Proposal = {
    id,
    action,
    name,
    description: typeof j.description === 'string' ? j.description : '',
    body: typeof j.body === 'string' ? j.body : '',
    reason: typeof j.reason === 'string' ? oneLine(j.reason, 200) : '',
    mergeInto: merge ?? undefined,
    at,
  }
  return validateProposal(p) === null ? p : null
}

export type Nudge = { facts: { text: string; kind: string }[]; prefs: string[] }

export const parseNudge = (text: string): Nudge => {
  const j = extractJson(text) as Record<string, unknown> | unknown[] | null
  const rawFacts = Array.isArray(j) ? j : j && Array.isArray(j.facts) ? j.facts : []
  const rawPrefs = j && !Array.isArray(j) && Array.isArray(j.preferences) ? j.preferences : []
  const facts: Nudge['facts'] = []
  for (const it of rawFacts) {
    if (typeof it === 'string') facts.push({ text: it, kind: 'fact' })
    else if (it && typeof it === 'object' && typeof (it as { text?: unknown }).text === 'string') {
      const k = (it as { kind?: unknown }).kind
      facts.push({ text: (it as { text: string }).text.slice(0, 400), kind: typeof k === 'string' ? k.slice(0, 20) : 'fact' })
    }
  }
  const prefs = rawPrefs.filter((x): x is string => typeof x === 'string').map(s => s.slice(0, 200))
  return { facts: facts.slice(0, 8), prefs: prefs.slice(0, 5) }
}

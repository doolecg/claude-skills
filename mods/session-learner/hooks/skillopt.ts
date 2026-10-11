/** Skill optimising: scorecards, the before/after check, drafts and their validation. */
import type { Lesson, SkillCard, SkillSession } from '../types'
import type { Transcript } from './evidence'
import { parseFrontmatter } from './lib/skills'
import { contradicts, hasSecret, normalise, similarity, words } from './text'

export const HISTORY_CAP = 30
export const WINDOW = 5
export const REWRITE_RATE = 0.3
export const MAX_DESCRIPTION = 1024

/** Words that say what a skill is about: its name parts and the content words of its description. */
export function topicWords(name: string, description = ''): string[] {
  const base = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name
  const out = new Set(words(base.replace(/[-_]/g, ' ')))
  for (const w of words(description).slice(0, 25)) if (w.length > 3) out.add(w)
  return [...out]
}

/** How one session went for a skill it loaded. */
export function sessionOutcome(t: Transcript, skill: string, topic: string[], sessionId: string, at: number, correctedByLesson = false): SkillSession | null {
  const loads = t.skillLoads.filter(l => l.skill === skill || l.skill.endsWith(`:${skill}`) || skill.endsWith(`:${l.skill}`))
  if (loads.length === 0) return null
  const first = Math.min(...loads.map(l => l.turn))
  const after = t.turns.filter(x => x.index >= first)
  const corrected =
    correctedByLesson ||
    t.corrections.some(c => c.turn > first && words(c.text).flatMap(w => [w, ...w.split(/[./_-]+/)]).some(w => topic.includes(w)))
  return {
    sessionId,
    at,
    corrected,
    interrupts: after.reduce((n, x) => n + x.interrupts, 0),
    failures: t.turns[first]?.failures.length ?? 0,
    turnsToDone: Math.max(0, t.userTurns - first),
  }
}

export function addSession(card: SkillCard | undefined, name: string, s: SkillSession): SkillCard {
  const base: SkillCard = card ?? { name, loads: 0, history: [] }
  const history = [...base.history.filter(h => h.sessionId !== s.sessionId), s].sort((a, b) => a.at - b.at).slice(-HISTORY_CAP)
  return { ...base, history }
}

/** Share of the last `n` loading sessions with a correction on the skill's topic. */
export function correctionRate(card: SkillCard, n = WINDOW): number {
  const last = card.history.slice(-n)
  if (last.length === 0) return 0
  return last.filter(h => h.corrected).length / last.length
}

export function needsRewrite(card: SkillCard): boolean {
  return card.history.length >= WINDOW && correctionRate(card) >= REWRITE_RATE
}

export type Trend = { sessions: number; corrections: number; interrupts: number; failures: number; avgTurns: number | null }

export function trendOf(list: SkillSession[]): Trend {
  const turns = list.map(h => h.turnsToDone).filter((x): x is number => x !== null)
  return {
    sessions: list.length,
    corrections: list.filter(h => h.corrected).length,
    interrupts: list.reduce((n, h) => n + h.interrupts, 0),
    failures: list.reduce((n, h) => n + h.failures, 0),
    avgTurns: turns.length ? Math.round((turns.reduce((a, b) => a + b, 0) / turns.length) * 10) / 10 : null,
  }
}

export type Comparison = { before: Trend; after: Trend; isReady: boolean; isWorse: boolean }

/** The 5 sessions after a change against the 5 before it; worse when corrections or interrupts went up. */
export function compareBeforeAfter(card: SkillCard): Comparison | null {
  if (card.changedAt === undefined) return null
  const beforeList = card.history.filter(h => h.at < card.changedAt!).slice(-WINDOW)
  const afterList = card.history.filter(h => h.at >= card.changedAt!).slice(0, WINDOW)
  const before = trendOf(beforeList)
  const after = trendOf(afterList)
  const isReady = afterList.length >= WINDOW
  const rate = (n: number, t: Trend) => (t.sessions ? n / t.sessions : 0)
  const isWorse =
    isReady &&
    before.sessions > 0 &&
    (rate(after.corrections, after) > rate(before.corrections, before) || rate(after.interrupts, after) > rate(before.interrupts, before))
  return { before, after, isReady, isWorse }
}

export function skillMarkdown(name: string, description: string, body: string): string {
  const desc = description.replace(/\s+/g, ' ').trim()
  const quoted = /[:#"'\n]|^[\s>|&*!%@`]/.test(desc) ? JSON.stringify(desc) : desc
  return `---\nname: ${name}\ndescription: ${quoted}\n---\n\n${body.trim()}\n`
}

/** The skill's text plus the correction under "## Learned correction". */
export function fixDraftText(skillText: string, correction: string): string {
  const text = skillText.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  const bullet = `- ${correction.replace(/\s+/g, ' ').trim()}`
  const head = /^## Learned corrections?\s*$/m.exec(text)
  if (!head) return `${text}\n\n## Learned correction\n\n${bullet}\n`
  const start = head.index + head[0].length
  const nextHead = /^#{1,2} /m.exec(text.slice(start))
  const end = nextHead ? start + nextHead.index : text.length
  const section = text.slice(start, end).replace(/\s+$/, '')
  if (section.includes(bullet)) return `${text}\n`
  return `${text.slice(0, start)}${section}\n${bullet}\n${text.slice(end) ? `\n${text.slice(end)}` : ''}`.replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n')
}

/** Groups similar procedure lessons; a group seen in 2 or more sessions can become a new skill. */
export function groupProcedures(lessons: Lesson[], threshold = 0.4): Lesson[][] {
  const procs = lessons.filter(l => l.kind === 'procedure' && l.status !== 'rejected')
  const groups: Lesson[][] = []
  for (const l of procs) {
    const g = groups.find(grp => grp.some(x => similarity(x.text, l.text) >= threshold))
    if (g) g.push(l)
    else groups.push([l])
  }
  return groups.filter(g => new Set(g.flatMap(l => l.sessions)).size >= 2)
}

export function nameFromText(text: string): string {
  const ws = words(text).filter(w => /^[a-z][a-z0-9]*$/.test(w) && w.length > 2)
  const name = ws.slice(0, 4).join('-')
  return name || 'learned-procedure'
}

export function newSkillDraft(group: Lesson[]): { name: string; text: string } {
  const lead = group[0]!
  const name = nameFromText(lead.text)
  const files = [...new Set(group.flatMap(l => l.files))].slice(0, 8)
  const description = `Use when repeating this procedure: ${lead.text.replace(/\.$/, '')}.`.slice(0, 600)
  const steps = [...new Set(group.map(l => l.text))].map(t => `- ${t}`).join('\n')
  const body = `# ${name}\n\nLearned from ${new Set(group.flatMap(l => l.sessions)).size} sessions.\n\n## Steps that worked\n\n${steps}${files.length ? `\n\n## Files\n\n${files.map(f => `- ${f}`).join('\n')}` : ''}`
  return { name, text: skillMarkdown(name, description, body) }
}

/** The rules a skill states: bullets, numbered steps and must/never/always lines. */
export function extractRules(body: string): string[] {
  const out: string[] = []
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('```')) continue
    const bullet = /^([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    const text = bullet ? bullet[2]! : line
    if (bullet || /\b(must|never|always|don'?t|do not|only|required?)\b/i.test(text)) {
      if (normalise(text).length > 3) out.push(text)
    }
  }
  return out
}

function ruleKept(rule: string, body: string): boolean {
  const n = normalise(rule)
  if (normalise(body).includes(n)) return true
  return body.split(/\r?\n/).some(line => similarity(line, rule) >= 0.6)
}

export type ValidateInput = {
  text: string
  before: string | null
  /** Names already taken (installed skills and other drafts), the draft's own excepted. */
  takenNames: string[]
  /** Corrections that may overrule an old rule. */
  corrections: string[]
  /** A rewrite must stay within the original length + 20%. */
  maxLength?: number
}

/** Checks a draft before it may apply: frontmatter, unique name, no secrets, short description, no rule dropped. */
export function validateDraft(v: ValidateInput): string[] {
  const problems: string[] = []
  const fm = parseFrontmatter(v.text)
  if (!fm) return ['the frontmatter does not parse']
  const name = fm.data.name?.trim() ?? ''
  const description = fm.data.description?.trim() ?? ''
  if (!name) problems.push('the frontmatter has no name')
  else if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) problems.push('the name must be lower-case letters, digits and hyphens')
  else if (v.takenNames.some(t => t.toLowerCase() === name.toLowerCase())) problems.push(`the name ${name} is already taken`)
  if (!description) problems.push('the frontmatter has no description')
  else if (description.length >= MAX_DESCRIPTION) problems.push(`the description is ${description.length} characters (under ${MAX_DESCRIPTION} allowed)`)
  if (hasSecret(v.text)) problems.push('it holds something that looks like a secret')
  if (v.maxLength !== undefined && v.text.length > v.maxLength) problems.push(`it is ${v.text.length} characters, over the limit of ${v.maxLength}`)
  if (v.before) {
    const old = parseFrontmatter(v.before)
    const oldBody = old ? old.body : v.before
    for (const rule of extractRules(oldBody)) {
      if (ruleKept(rule, fm.body)) continue
      if (v.corrections.some(c => contradicts(c, rule))) continue
      problems.push(`it drops a rule: ${rule.length > 100 ? `${rule.slice(0, 100)}...` : rule}`)
    }
  }
  return problems
}

/** A unified diff of two texts as one hunk, for showing a draft. */
export function unifiedDiff(before: string | null, after: string, path = 'SKILL.md'): string {
  const a = before === null ? [] : before.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
  const b = after.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const lines: string[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      lines.push(` ${a[i]}`)
      i++
      j++
    } else if (i < n && (j >= m || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      lines.push(`-${a[i]}`)
      i++
    } else {
      lines.push(`+${b[j]}`)
      j++
    }
  }
  const header = `--- ${before === null ? '/dev/null' : `a/${path}`}\n+++ b/${path}\n@@ -${n === 0 ? 0 : 1},${n} +${m === 0 ? 0 : 1},${m} @@`
  return `${header}\n${lines.join('\n')}\n`
}

export function rewritePrompt(name: string, skillText: string, corrections: string[], maxLength: number): string {
  return [
    `Rewrite the Claude Code skill "${name}" below. Keep every rule it states unless one of the corrections contradicts it.`,
    'Fold the learned corrections into the body. Tighten the description so it triggers at the right times (under 1024 characters).',
    `Keep the same name in the frontmatter. The whole file must stay under ${maxLength} characters. Answer with the complete SKILL.md only, no commentary.`,
    '',
    'Learned corrections:',
    ...corrections.map(c => `- ${c}`),
    '',
    'Current SKILL.md:',
    skillText,
  ].join('\n')
}

/** Strips a code fence around a model's SKILL.md answer. */
export function unfence(text: string): string {
  const m = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(text)
  return (m ? m[1]! : text).trim() + '\n'
}

// The session as evidence: user prompts, Claude's replies, tool calls and failures, interrupts, and the
// prompt after each reply (where corrections live). Read from Claude Code's jsonl file or from $.session.messages().
// The line format and the turn counting are ported from Operant (core/agents.ts logLines, core/learn.ts).

import { clean, estimateTokens, oneLine, scrubSecrets } from './text'

export type Ev =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; input: Record<string, unknown> }
  | { kind: 'result'; text: string; error: boolean }
  | { kind: 'interrupt' }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const INTERRUPT = /^\[Request interrupted by user/
// Rows the person never typed: command records, reminders, hook output, caveats.
const NOT_TYPED = /^\s*<(command-|local-command|system-reminder|bash-|user-memory|task-notification)|^Caveat: The messages below/

function textOf(v: unknown, depth = 0): string {
  if (typeof v === 'string') return v
  if (depth > 4 || !v || typeof v !== 'object') return ''
  if (Array.isArray(v)) return v.map(x => textOf(x, depth + 1)).filter(Boolean).join(' ')
  const o = obj(v)
  return str(o.text) || textOf(o.content, depth + 1)
}

const stripReminders = (t: string): string => t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()

function userText(raw: string, out: Ev[]): void {
  const t = stripReminders(raw)
  if (!t) return
  if (INTERRUPT.test(t)) out.push({ kind: 'interrupt' })
  else if (!NOT_TYPED.test(t)) out.push({ kind: 'user', text: t })
}

// One jsonl row of a Claude Code transcript as events; [] for rows that say nothing (meta, summaries, progress).
export function rowEvents(row: unknown): Ev[] {
  const l = obj(row)
  if (l.isMeta === true || l.isSidechain === true) return []
  const type = str(l.type)
  // A prompt typed while Claude worked is folded into the running turn as a queued_command attachment.
  if (type === 'attachment') {
    const a = obj(l.attachment)
    const out: Ev[] = []
    if (str(a.type) === 'queued_command' && typeof a.prompt === 'string') userText(a.prompt, out)
    return out
  }
  if (type !== 'user' && type !== 'assistant') return []
  const m = obj(l.message)
  const role = str(m.role) || type
  const content = m.content
  const out: Ev[] = []
  const blocks = Array.isArray(content) ? content : [content]
  for (const raw of blocks) {
    if (typeof raw === 'string') {
      if (role === 'user') userText(raw, out)
      else if (raw.trim()) out.push({ kind: 'assistant', text: raw })
      continue
    }
    const b = obj(raw)
    const bt = str(b.type)
    if (bt === 'tool_use') out.push({ kind: 'tool', name: str(b.name) || 'tool', input: obj(b.input) })
    else if (bt === 'tool_result') {
      const t = textOf(b.content)
      if (INTERRUPT.test(t.trim())) out.push({ kind: 'interrupt' })
      out.push({ kind: 'result', text: t, error: b.is_error === true })
    } else if (bt === 'text') {
      if (role === 'user') userText(str(b.text), out)
      else if (str(b.text).trim()) out.push({ kind: 'assistant', text: str(b.text) })
    }
  }
  return out
}

export function parseJsonl(text: string): Ev[] {
  const out: Ev[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      out.push(...rowEvents(JSON.parse(line)))
    } catch {
      // a half-written line
    }
  }
  return out
}

// The engine's own rows ($.session.messages()) as events.
export type MessageRow = {
  role: 'user' | 'assistant'
  text: string
  toolUses: readonly { tool: string; input: Readonly<Record<string, unknown>> }[]
  toolResults?: readonly { text: string; isError: boolean }[]
}

export function messageEvents(rows: readonly MessageRow[]): Ev[] {
  const out: Ev[] = []
  for (const r of rows) {
    if (r.role === 'user') {
      for (const t of r.toolResults ?? []) {
        if (INTERRUPT.test(t.text.trim())) out.push({ kind: 'interrupt' })
        out.push({ kind: 'result', text: t.text, error: t.isError })
      }
      if (r.text) userText(r.text, out)
    } else {
      if (r.text.trim()) out.push({ kind: 'assistant', text: r.text })
      for (const u of r.toolUses) out.push({ kind: 'tool', name: u.tool, input: { ...u.input } })
    }
  }
  return out
}

const LINE_MAX = 600
const clip = (s: string): string => (s.length > LINE_MAX ? `${s.slice(0, LINE_MAX)}...` : s)

// Plain lines for the model, secrets scrubbed: "user: ...", "assistant: ...", "tool: Name {...}", "failed: ...".
export function eventLines(evs: readonly Ev[]): string[] {
  const out: string[] = []
  for (const e of evs) {
    if (e.kind === 'user') out.push(`user: ${oneLine(e.text)}`)
    else if (e.kind === 'assistant') out.push(`assistant: ${oneLine(e.text)}`)
    else if (e.kind === 'tool') out.push(`tool: ${e.name}${Object.keys(e.input).length ? ` ${oneLine(JSON.stringify(e.input))}` : ''}`)
    else if (e.kind === 'result') {
      if (e.error) out.push(`failed: ${oneLine(e.text)}`)
    } else out.push('user: [interrupted Claude]')
  }
  return out.map(s => clip(scrubSecrets(s)))
}

export const userTurns = (evs: readonly Ev[]): number => evs.filter(e => e.kind === 'user').length

// The events after the first `turns` user turns: what a session said since it was last learned from.
export function sinceTurn(evs: readonly Ev[], turns: number): Ev[] {
  if (turns <= 0) return [...evs]
  let seen = 0
  for (let i = 0; i < evs.length; i++) {
    if (evs[i]!.kind === 'user') {
      if (seen === turns) return evs.slice(i)
      seen++
    }
  }
  return []
}

// A prompt that pushes back on what Claude just did.
const CORRECTION =
  /^(no\b|nope\b|not\b|don'?t\b|do not\b|stop\b|wrong\b|wait\b|actually\b|instead\b|that'?s not\b|that is not\b|i said\b|i told you\b|why did you\b|you (should|shouldn'?t|didn'?t|forgot|missed)\b|never\b|please don'?t\b)|\b(i said|i told you|not what i (asked|wanted|meant)|that'?s wrong|you forgot|you missed|don'?t do that|stop doing)\b/i

export const isCorrection = (prompt: string): boolean => CORRECTION.test(prompt.trim())

// Prompts that came straight after a reply of Claude's and push back on it.
export function corrections(evs: readonly Ev[]): string[] {
  const out: string[] = []
  let replied = false
  for (const e of evs) {
    if (e.kind === 'assistant') replied = true
    else if (e.kind === 'interrupt') replied = true
    else if (e.kind === 'user') {
      if (replied && isCorrection(e.text)) out.push(clean(e.text).slice(0, 300))
      replied = false
    }
  }
  return out
}

export const interrupts = (evs: readonly Ev[]): number => evs.filter(e => e.kind === 'interrupt').length

export type Gate = { minUserTurns: number; minTokens: number }

// The gate in code, before any model call. '' when the session is worth a call; otherwise why it was skipped.
export function gateReason(evs: readonly Ev[], changedFiles: number, g: Gate): string {
  const turns = userTurns(evs)
  if (turns < g.minUserTurns) return `only ${turns} user ${turns === 1 ? 'turn' : 'turns'} (minimum ${g.minUserTurns})`
  const tokens = estimateTokens(eventLines(evs).join('\n'))
  if (tokens < g.minTokens) return `only about ${tokens} tokens of transcript (minimum ${g.minTokens})`
  if (changedFiles === 0 && corrections(evs).length === 0) return 'no git changes and no corrections'
  return ''
}

// Each skill the Skill tool loaded, with what followed it in the session (the scorecard's raw facts).
export type SkillLoad = { skill: string; interrupts: number; failures: number; turnsToEnd: number }

export function skillLoads(evs: readonly Ev[]): SkillLoad[] {
  const total = userTurns(evs)
  const out: SkillLoad[] = []
  let turn = 0
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i]!
    if (e.kind === 'user') turn++
    if (e.kind !== 'tool' || e.name !== 'Skill') continue
    const skill = str(e.input.skill) || str(e.input.name) || str(e.input.command)
    if (!skill) continue
    let failures = 0
    let after = 0
    let sameTurn = true
    for (let j = i + 1; j < evs.length; j++) {
      const x = evs[j]!
      if (x.kind === 'user') sameTurn = false
      if (x.kind === 'interrupt') after++
      if (sameTurn && x.kind === 'result' && x.error) failures++
    }
    out.push({ skill: skill.replace(/^\//, ''), interrupts: after, failures, turnsToEnd: Math.max(0, total - turn) })
  }
  return out
}

export const TRANSCRIPT_CAP = 12_000

export const tailText = (evs: readonly Ev[]): string => eventLines(evs).join('\n').slice(-TRANSCRIPT_CAP)

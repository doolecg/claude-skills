import { redact } from './secrets'
import { truncateToTokens } from './tokens'

export type Turn = { role: 'user' | 'assistant'; text: string }

export const transcriptText = (turns: Turn[], maxTokens: number): string => {
  const joined = turns
    .filter(t => t.text.trim() !== '')
    .map(t => `${t.role === 'user' ? 'USER' : 'ASSISTANT'}: ${redact(t.text).trim()}`)
    .join('\n\n')
  // keep the newest part when over budget
  const keep = maxTokens * 4
  return truncateToTokens(joined.length > keep ? joined.slice(joined.length - keep) : joined, maxTokens)
}

const GROUND =
  'Ground everything in the CodeGraph excerpt when one is given: mention only symbols and file paths that appear in it or in the conversation. Never invent paths or names.'

export const nudgePrompt = (transcript: string, prefs: string[], codegraph: string): string =>
  [
    'You maintain long-term memory for a coding assistant. From the conversation below, list only durable facts, user preferences and decisions worth keeping for future sessions.',
    'Skip anything temporary, obvious, or already known. Never include secrets, keys, tokens or passwords.',
    GROUND,
    'Reply with JSON only: {"facts":[{"text":"...","kind":"fact|preference|decision"}],"preferences":["short standing preference"]}. Use empty arrays when nothing is worth keeping. At most 6 facts.',
    prefs.length ? `Already known preferences:\n${prefs.map(p => `- ${p}`).join('\n')}` : '',
    codegraph ? `CodeGraph excerpt:\n${codegraph}` : '',
    `Conversation:\n${transcript}`,
  ]
    .filter(Boolean)
    .join('\n\n')

export const skillPrompt = (transcript: string, reason: string, existing: string[], codegraph: string): string =>
  [
    `The task below ${reason}. If it holds a reusable procedure worth a skill, draft one; otherwise reply {"skip":true}.`,
    'A skill is a short playbook another session can follow: when to use it, steps, and pitfalls. No secrets, no one-off details.',
    GROUND,
    'Reply with JSON only: {"name":"kebab-case-name","description":"one sentence saying when to use it","body":"markdown steps","reason":"why this is worth keeping"}.',
    existing.length ? `Existing learner skills (do not duplicate): ${existing.join(', ')}` : '',
    codegraph ? `CodeGraph excerpt:\n${codegraph}` : '',
    `Task transcript:\n${transcript}`,
  ]
    .filter(Boolean)
    .join('\n\n')

export const rewritePrompt = (
  name: string,
  current: string,
  why: string,
  action: 'rewrite' | 'merge' | 'prune',
  others: string[],
  codegraph: string,
): string =>
  [
    `The skill "${name}" is weak (${why}). ${
      action === 'prune' ? 'Explain briefly why it should be removed.' : 'Rewrite it so it is clearer and correct, keeping the same name.'
    }`,
    GROUND,
    others.length ? `If it duplicates another learner skill (${others.join(', ')}), add "mergeInto":"that-name" and put the combined content in body.` : '',
    'Reply with JSON only: {"name":"' + name + '","description":"...","body":"markdown","reason":"what changed"}.',
    codegraph ? `CodeGraph excerpt:\n${codegraph}` : '',
    `Current skill:\n${current}`,
  ]
    .filter(Boolean)
    .join('\n\n')

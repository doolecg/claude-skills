import { redact } from './secrets'
import { estimateTokens, truncateToTokens } from './tokens'

export type ComposeInput = {
  prefs: string[]
  recalled: string[]
  isCodegraph: boolean
  maxTokens: number
}

const HEAD = 'Learned context (self-improve; a short, user-approved summary of past sessions)'
const CG = 'This repo is CodeGraph-indexed: use codegraph_explore first to find code.'

/** One short system-prompt section, never longer than maxTokens (estimated). Empty string when nothing fits. */
export const buildSection = (i: ComposeInput): string => {
  if (estimateTokens(HEAD) > i.maxTokens) return ''
  const lines: string[] = [HEAD]
  const add = (l: string): boolean => {
    const next = [...lines, l].join('\n')
    if (estimateTokens(next) > i.maxTokens) return false
    lines.push(l)
    return true
  }
  if (i.isCodegraph) add(CG)
  if (i.prefs.length) {
    if (add('User preferences:')) for (const p of i.prefs.slice(-12)) if (!add(`- ${redact(p)}`)) break
  }
  if (i.recalled.length) {
    if (add('Relevant memories:')) for (const m of i.recalled) if (!add(`- ${truncateToTokens(redact(m).replace(/\s+/g, ' '), 80)}`)) break
  }
  if (lines.length === 1) return ''
  return lines.join('\n')
}

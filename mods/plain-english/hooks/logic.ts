import type {
  PlainEnglishState,
  PlainEnglishTool,
  PlainEnglishVerdict,
} from '../types/index.d.ts'

export const SECTION_ID = 'plain-english:style'
export const SECTION_TEXT =
  'Write in plain English. Use simple words and short sentences. Say little about what you are doing while you work. Put all your prose in one final block headed "Summary". End the reply with a "Next steps" section.'

export const CHECK_MODEL = 'claude-haiku-5-5'
export const CHECK_MAX_TOKENS = 40
export const CHECK_TIMEOUT_MS = 15_000
export const MIN_REPLY_CHARS = 400
export const MAX_CHECKS = 25
export const MAX_CHECK_TOKENS = 150_000
export const GOAL_WORDS = 8
export const GOAL_CHARS = 60

export const EMPTY_STATE: PlainEnglishState = {
  goal: '',
  tools: [],
  checks: 0,
  tokens: 0,
  verdict: null,
}

export const CHECK_SYSTEM = [
  'You check one reply from a coding assistant against four style rules:',
  '1. Simple words and short sentences.',
  '2. Little narration of the work.',
  '3. All prose in one final block headed "Summary".',
  '4. A "Next steps" section at the end.',
  'Answer with exactly PASS if every rule holds. Otherwise answer FAIL: followed by the rule missed, in six words or fewer. Say nothing else.',
].join('\n')

const REPLY_HEAD = 2000
const REPLY_TAIL = 6000

export function checkPrompt(reply: string): string {
  const text =
    reply.length > REPLY_HEAD + REPLY_TAIL
      ? `${reply.slice(0, REPLY_HEAD)}\n[...]\n${reply.slice(-REPLY_TAIL)}`
      : reply
  return `Reply to check:\n\n${text}`
}

export function firstWords(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).slice(0, GOAL_WORDS)
  const joined = words.join(' ')
  return joined.length > GOAL_CHARS
    ? `${joined.slice(0, GOAL_CHARS - 3).trimEnd()}...`
    : joined
}

export function statusText(state: PlainEnglishState): string | undefined {
  if (state.goal === '') return undefined
  const running = state.tools[state.tools.length - 1]
  return running
    ? `Working on: ${state.goal} (running ${running.tool})`
    : `Working on: ${state.goal}`
}

export function addTool(
  tools: readonly PlainEnglishTool[],
  tool: PlainEnglishTool,
): PlainEnglishTool[] {
  return [...tools, tool]
}

export function removeTool(
  tools: readonly PlainEnglishTool[],
  id: string,
): PlainEnglishTool[] {
  return tools.filter(t => t.id !== id)
}

type TurnLike = {
  answer: string
  isAborted: boolean
  reason: string
  agentId?: string
}

export function isCheckable(turn: TurnLike): boolean {
  return (
    turn.agentId === undefined &&
    !turn.isAborted &&
    turn.reason === 'answer' &&
    turn.answer.length >= MIN_REPLY_CHARS
  )
}

export function isUnderCaps(state: PlainEnglishState): boolean {
  return state.checks < MAX_CHECKS && state.tokens < MAX_CHECK_TOKENS
}

export type Parsed = PlainEnglishVerdict | null

export function parseVerdict(text: string): Parsed {
  const t = text.trim()
  if (/^\W*PASS\b/i.test(t)) return { isOk: true }
  const fail = /^\W*FAIL\b[\s:,.\-\u2013\u2014]*([\s\S]*)$/i.exec(t)
  if (!fail) return null
  const line = (fail[1] ?? '').split(/\r?\n/)[0] ?? ''
  const rule = line.replace(/^["'`\s]+|["'`\s.]+$/g, '').slice(0, 80)
  return { isOk: false, rule: rule === '' ? 'a style rule' : rule }
}

export function bandText(verdict: PlainEnglishVerdict): string {
  return verdict.isOk
    ? 'Plain-English: ok'
    : `Plain-English: missed: ${verdict.rule}`
}

export function usageTotal(usage: {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}): number {
  return (
    usage.input_tokens +
    usage.output_tokens +
    usage.cache_read_input_tokens +
    usage.cache_creation_input_tokens
  )
}

export function parseBandCommand(args: string): boolean | null {
  const [word, value, ...rest] = args.trim().toLowerCase().split(/\s+/)
  if (word !== 'band' || rest.length > 0) return null
  if (value === 'on') return true
  if (value === 'off') return false
  return null
}

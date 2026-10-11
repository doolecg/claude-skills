/** Reading a session: the transcript JSONL and the git diff since the session's start. */
import { clip } from './text'

export type ToolUse = { id: string; name: string; file?: string; summary: string }

export type Turn = {
  index: number
  prompt: string
  /** Claude's final text reply to this prompt (the last text it wrote before the next prompt). */
  reply: string
  tools: ToolUse[]
  failures: string[]
  interrupts: number
  /** This prompt corrects the reply before it. */
  isCorrection: boolean
}

export type SkillLoad = { skill: string; turn: number }

export type Transcript = {
  turns: Turn[]
  userTurns: number
  approxTokens: number
  edits: number
  files: string[]
  skillLoads: SkillLoad[]
  corrections: Array<{ turn: number; text: string; after: string }>
  interrupts: number
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])
const INTERRUPT = /^\[Request interrupted by user/

const CORRECTION_START =
  /^(no\b|nope\b|nah\b|don'?t\b|do not\b|stop\b|wrong\b|that'?s (not|wrong)|thats (not|wrong)|not (like|what|that|quite)\b|instead\b|actually\b|wait\b|why did you|why are you|you (should|shouldn'?t|forgot|missed|broke|didn'?t)|i (said|asked|told|meant)\b|please don'?t|please do not|undo\b|revert\b|never\b|careful\b|that broke|it broke|still (wrong|broken|not))/i
const CORRECTION_ANY = /\b(instead of|not what i|should have|shouldn'?t have|don'?t use|do not use|rather than|that'?s wrong|you broke|wrong file|wrong place)\b/i

export function isCorrectionText(text: string): boolean {
  const t = text.trim()
  return CORRECTION_START.test(t) || CORRECTION_ANY.test(t)
}

type Block = { type?: string; text?: string; name?: string; id?: string; input?: Record<string, unknown>; content?: unknown; is_error?: boolean; tool_use_id?: string }

function textOfContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as Block[])
    .map(b => (b && b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
    .filter(Boolean)
    .join('\n')
}

function isCommandRow(text: string): boolean {
  const t = text.trimStart()
  return t.startsWith('<command-name>') || t.startsWith('<local-command') || t.startsWith('<command-message>') || t.startsWith('<bash-')
}

function summarise(name: string, input: Record<string, unknown> | undefined): { file?: string; summary: string } {
  const i = input ?? {}
  const file = [i.file_path, i.notebook_path, i.path].find((v): v is string => typeof v === 'string')
  if (name === 'Bash' && typeof i.command === 'string') return { summary: `Bash: ${clip(i.command.replace(/\s+/g, ' '), 160)}` }
  if (name === 'Skill' && typeof i.skill === 'string') return { summary: `Skill: ${i.skill}` }
  if (file) return { file, summary: `${name}: ${file}` }
  if (typeof i.pattern === 'string') return { summary: `${name}: ${clip(i.pattern, 80)}` }
  return { summary: name }
}

/** Parses a Claude Code transcript (JSONL). Lines that do not parse are skipped; subagent rows are left out. */
export function parseTranscript(jsonl: string): Transcript {
  const turns: Turn[] = []
  const skillLoads: SkillLoad[] = []
  const files = new Set<string>()
  let chars = 0
  let edits = 0
  let interrupts = 0
  let current: Turn | null = null
  let lastText = ''

  const close = () => {
    if (current) current.reply = lastText
    lastText = ''
  }

  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue
    let row: Record<string, unknown>
    try {
      row = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (row.isSidechain === true) continue
    const message = row.message as { role?: string; content?: unknown } | undefined
    if (!message) continue

    if (row.type === 'user') {
      if (row.isMeta === true) continue
      const content = message.content
      if (Array.isArray(content) && (content as Block[]).some(b => b?.type === 'tool_result')) {
        for (const b of content as Block[]) {
          if (b?.type !== 'tool_result') continue
          const text = typeof b.content === 'string' ? b.content : textOfContent(b.content)
          chars += text.length
          if (b.is_error && current) current.failures.push(clip(text.replace(/\s+/g, ' ').trim(), 200))
        }
        continue
      }
      const text = textOfContent(content).trim()
      if (!text || isCommandRow(text) || text.startsWith('<system-reminder>') || text.startsWith('<task-notification>')) continue
      if (INTERRUPT.test(text)) {
        interrupts++
        if (current) current.interrupts++
        continue
      }
      close()
      chars += text.length
      const prev = current as Turn | null
      const isCorrection: boolean = prev !== null && (isCorrectionText(text) || prev.interrupts > 0)
      current = { index: turns.length, prompt: text, reply: '', tools: [], failures: [], interrupts: 0, isCorrection }
      turns.push(current)
      continue
    }

    if (row.type === 'assistant' && Array.isArray(message.content)) {
      for (const b of message.content as Block[]) {
        if (!b) continue
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          lastText = b.text.trim()
          chars += b.text.length
        } else if (b.type === 'tool_use' && typeof b.name === 'string') {
          const { file, summary } = summarise(b.name, b.input)
          chars += JSON.stringify(b.input ?? {}).length
          if (EDIT_TOOLS.has(b.name)) edits++
          if (file) files.add(file)
          if (b.name === 'Skill' && typeof b.input?.skill === 'string') skillLoads.push({ skill: b.input.skill, turn: current?.index ?? 0 })
          current?.tools.push({ id: String(b.id ?? ''), name: b.name, file, summary })
        }
      }
    }
  }
  close()

  const corrections = turns
    .filter(t => t.isCorrection)
    .map(t => ({ turn: t.index, text: t.prompt, after: turns[t.index - 1]?.reply ?? '' }))

  return { turns, userTurns: turns.length, approxTokens: Math.round(chars / 4), edits, files: [...files], skillLoads, corrections, interrupts }
}

/** The transcript tail as the model reads it: prompts, final replies, tools, failures, interrupts. */
export function renderTail(t: Transcript, maxChars = 24000): string {
  const parts: string[] = []
  for (const turn of t.turns) {
    const lines = [`[Turn ${turn.index + 1}]${turn.isCorrection ? ' (correction)' : ''}`, `User: ${clip(turn.prompt, 1500)}`]
    if (turn.tools.length) lines.push(`Tools: ${turn.tools.map(x => x.summary).slice(0, 15).join('; ')}`)
    for (const f of turn.failures.slice(0, 4)) lines.push(`Tool failed: ${f}`)
    if (turn.interrupts) lines.push('The user interrupted Claude here.')
    if (turn.reply) lines.push(`Claude: ${clip(turn.reply, 1200)}`)
    parts.push(lines.join('\n'))
  }
  let out = parts.join('\n\n')
  if (out.length > maxChars) out = `...earlier turns left out...\n${out.slice(out.length - maxChars)}`
  return out
}

export type Diff = { files: string[]; declarations: string[]; hunkFunctions: string[]; added: number; removed: number }

const DECLARATION: RegExp[] = [
  /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/,
  /\b(?:export\s+)?(?:abstract\s+)?(?:class|interface|enum|struct|trait|record|object)\s+([A-Za-z_$][\w$]*)/,
  /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*=/,
  /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/,
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/,
  /^\s*(?:public|private|protected|internal)\s+(?:static\s+)?(?:final\s+)?(?:[\w<>[\],\s]+\s+)?([A-Za-z_]\w*)\s*\(/,
]

/** Parses `git diff --unified=0` output: changed files, added declarations, hunk function names. */
export function parseDiff(text: string, untracked: string[] = []): Diff {
  const files = new Set<string>()
  const declarations = new Set<string>()
  const hunkFunctions = new Set<string>()
  let added = 0
  let removed = 0
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      const m = / b\/(.+)$/.exec(line)
      if (m) files.add(m[1]!)
      continue
    }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')) continue
    if (line.startsWith('@@')) {
      const m = /^@@[^@]*@@\s*(.*)$/.exec(line)
      const head = m?.[1]?.trim()
      if (head) {
        for (const re of DECLARATION) {
          const d = re.exec(head)
          if (d) {
            hunkFunctions.add(d[1]!)
            break
          }
        }
        if (!DECLARATION.some(re => re.test(head))) {
          const word = /([A-Za-z_$][\w$]*)\s*\(/.exec(head)
          if (word) hunkFunctions.add(word[1]!)
        }
      }
      continue
    }
    if (line.startsWith('+')) {
      added++
      const body = line.slice(1)
      for (const re of DECLARATION) {
        const d = re.exec(body)
        if (d && !['if', 'for', 'while', 'switch', 'return', 'catch'].includes(d[1]!)) {
          declarations.add(d[1]!)
          break
        }
      }
    } else if (line.startsWith('-')) {
      removed++
    }
  }
  for (const f of untracked) files.add(f)
  return { files: [...files], declarations: [...declarations], hunkFunctions: [...hunkFunctions], added, removed }
}

export function parseUntracked(porcelain: string): string[] {
  return porcelain
    .split(/\r?\n/)
    .filter(l => l.startsWith('?? '))
    .map(l => l.slice(3).trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
}

export function renderDiff(d: Diff): string {
  if (d.files.length === 0) return 'No changes to files since the session started.'
  const lines = [`Changed files: ${d.files.slice(0, 40).join(', ')}`, `Lines added: ${d.added}, removed: ${d.removed}`]
  if (d.declarations.length) lines.push(`Added declarations: ${d.declarations.slice(0, 40).join(', ')}`)
  if (d.hunkFunctions.length) lines.push(`Changed inside: ${d.hunkFunctions.slice(0, 40).join(', ')}`)
  return lines.join('\n')
}

import { isCheckCommand } from './checks'

export type RuleId = 'noAttribution' | 'plainTags' | 'askBeforePublish' | 'noKillByName' | 'noSkipHooks' | 'passCap'

export const LABELS: Record<RuleId, string> = {
  noAttribution: 'No AI credit in commits',
  plainTags: 'Plain version tags',
  askBeforePublish: 'Ask before push or release',
  noKillByName: 'No killing by name',
  noSkipHooks: 'Never skip git hooks',
  passCap: 'Stop at the pass limit',
}

export type Passes = { count: number; limit: number; editedSince: boolean; extra: string[] }

export type Violation = { rule: RuleId; label: string; reason: string }

export type Context = {
  // Which rules are on. A rule left out counts as on.
  enabled: Partial<Record<RuleId, boolean>>
  // The person's latest prompt.
  prompt: string
  // The Context mod's pass counter, or null when it is not there.
  passes: Passes | null
}

export type Call = { tool: string; command?: string; message?: string }

// One command of a chain. `code` has the text inside quotes blanked, `text` is the original.
export type Segment = { text: string; code: string; quotes: string[]; prog: string; args: string[] }

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'pwsh', 'powershell', 'cmd'])
const WRAPPERS = new Set(['sudo', 'env', 'command', 'time', 'exec', 'call', 'nohup', '&', '.', 'start'])
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/

// Splits a command at && || ; | and newlines that sit outside quotes.
function splitChain(command: string): { text: string; code: string; quotes: string[] }[] {
  const out: { text: string; code: string; quotes: string[] }[] = []
  let text = ''
  let code = ''
  let quotes: string[] = []
  let quote = ''
  let inner = ''
  const flush = () => {
    if (text.trim() !== '') out.push({ text, code, quotes })
    text = ''
    code = ''
    quotes = []
  }

  for (let i = 0; i < command.length; i++) {
    const c = command[i] as string
    if (quote !== '') {
      text += c
      if (c === '\\' && quote === '"' && command[i + 1] === '"') {
        text += '"'
        inner += '"'
        i++
      } else if (c === quote) {
        quotes.push(inner)
        // A one-word string keeps its text (a tag name); longer ones are blanked.
        code += (/^\S+$/.test(inner) ? inner : '') + quote
        quote = ''
        inner = ''
      } else {
        inner += c
        // An unclosed quote still counts: nothing in it is a command word.
      }
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      inner = ''
      text += c
      code += c
      continue
    }
    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      flush()
      i++
    } else if (c === ';' || c === '|' || c === '\n' || c === '\r') {
      flush()
    } else {
      text += c
      code += c
    }
  }
  if (quote !== '') quotes.push(inner)
  flush()

  return out
}

function baseName(word: string): string {
  return (word.split(/[\\/]/).pop() ?? '').replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase()
}

// The command words of a chain, one segment per command. A shell given a quoted script (bash -c "...") is read into.
export function segments(command: string, depth = 0): Segment[] {
  const result: Segment[] = []
  for (const part of splitChain(command)) {
    const tokens = part.code.split(/\s+/).filter(token => token !== '')
    let start = 0
    while (start < tokens.length && (WRAPPERS.has((tokens[start] as string).toLowerCase()) || ASSIGN.test(tokens[start] as string))) start++
    const word = tokens[start]
    if (word === undefined) continue
    const seg: Segment = { text: part.text, code: part.code, quotes: part.quotes, prog: baseName(word), args: tokens.slice(start + 1) }
    result.push(seg)
    if (depth < 2 && SHELLS.has(seg.prog) && part.quotes.length > 0) for (const script of part.quotes) result.push(...segments(script, depth + 1))
  }

  return result
}

// The git subcommand, skipping git's own options (-C dir, -c name=value, --flag).
function gitSub(seg: Segment): { sub: string; rest: string[] } | null {
  if (seg.prog !== 'git') return null
  const args = seg.args.map(unquote)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string
    if (arg === '-C' || arg === '-c' || arg === '--git-dir' || arg === '--work-tree') i++
    else if (arg.startsWith('-')) continue
    else return { sub: arg.toLowerCase(), rest: args.slice(i + 1) }
  }

  return null
}

function ghSub(seg: Segment): { sub: string; rest: string[] } | null {
  if (seg.prog !== 'gh') return null
  const words = seg.args.map(unquote).filter(arg => arg !== '' && !arg.startsWith('-'))
  if (words.length < 2) return null
  const at = seg.args.map(unquote).indexOf(words[1] as string)

  return { sub: `${(words[0] as string).toLowerCase()} ${(words[1] as string).toLowerCase()}`, rest: seg.args.slice(at + 1) }
}

const CREDIT: RegExp[] = [
  /co-authored-by/i,
  /generated with/i,
  /claude\.ai\/code/i,
  /noreply@anthropic\.com/i,
  /\b(?:written|created|authored|made|built|generated|assisted|co-?authored|powered)\s+(?:by|with)\s+(?:claude|anthropic|an?\s+ai\b|ai\b)/i,
]

// The first piece of AI credit in a text, or null.
export function findCredit(text: string): string | null {
  for (const pattern of CREDIT) {
    const found = pattern.exec(text)
    if (found !== null) return found[0]
  }

  return null
}

function unquote(word: string): string {
  return word.replace(/^["']|["']$/g, '')
}

const OPTIONS_WITH_VALUE = new Set(['-m', '-F', '-u', '--message', '--file', '--local-user'])

// The plain words of a tag command, without options and the values options take.
function positionals(args: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = unquote(args[i] as string)
    if (OPTIONS_WITH_VALUE.has(arg)) i++
    else if (arg !== '' && !arg.startsWith('-')) out.push(arg)
  }

  return out
}

const TAG_WORDS = /\b(push|publish|release|tag|ship|deploy|merge)\b/i

// True when the person's prompt asks for a push, release or the like.
export function promptAllowsPublish(prompt: string): boolean {
  return TAG_WORDS.test(prompt)
}

function violation(rule: RuleId, reason: string): Violation {
  return { rule, label: LABELS[rule], reason }
}

const V_TAG = /^v\d/
const V_PUSH_TAG = /^(?:refs\/tags\/)?v\d+\./

function unV(tag: string): string {
  return tag.replace(/^(?:refs\/tags\/)?v/, '')
}

function checkSegment(seg: Segment, ctx: Context, isOn: (rule: RuleId) => boolean): Violation | null {
  const git = gitSub(seg)
  const gh = ghSub(seg)

  if (isOn('noAttribution')) {
    const writes = git?.sub === 'commit' || gh?.sub === 'pr create' || gh?.sub === 'release create'
    const found = writes ? findCredit(seg.text) : null
    if (found !== null) return violation('noAttribution', `Rule Guard: commits, pull requests and releases carry no Claude or AI credit. Remove the line with "${found}" and try again.`)
  }

  if (isOn('plainTags')) {
    let tag: string | undefined
    if (git?.sub === 'tag') tag = positionals(git.rest).find(word => V_TAG.test(word))
    else if (gh?.sub === 'release create') tag = positionals(gh.rest).find(word => V_TAG.test(word))
    else if (git?.sub === 'push') tag = positionals(git.rest).find(word => V_PUSH_TAG.test(word.split(':')[0] as string))
    if (tag !== undefined) return violation('plainTags', `Rule Guard: version tags are plain, like ${unV(tag)}, not ${tag}. Use ${unV(tag)} instead.`)
  }

  if (isOn('askBeforePublish') && !promptAllowsPublish(ctx.prompt)) {
    let what: string | null = null
    if (git?.sub === 'push') what = 'git push'
    else if (git?.sub === 'tag') {
      const deletes = git.rest.some(arg => arg === '-d' || arg === '--delete' || arg === '-l' || arg === '--list' || arg === '-v' || arg === '--verify')
      if (!deletes && positionals(git.rest).length > 0) what = 'creating a git tag'
    } else if (gh?.sub === 'release create' || gh?.sub === 'release upload' || gh?.sub === 'release edit') what = gh.sub.replace(/^release/, 'gh release')
    else if (gh?.sub === 'pr merge') what = 'gh pr merge'
    else if (['npm', 'pnpm', 'yarn'].includes(seg.prog) && unquote(seg.args[0] ?? '').toLowerCase() === 'publish') what = `${seg.prog} publish`
    if (what !== null) return violation('askBeforePublish', `Rule Guard: ${what} was not asked for in the person's latest message. Ask the person first, and run it only after they say yes.`)
  }

  if (isOn('noKillByName')) {
    const lower = seg.args.map(arg => unquote(arg).toLowerCase())
    const byName =
      (seg.prog === 'stop-process' && lower.some(arg => /^-n(a(me?)?)?$/.test(arg))) ||
      (seg.prog === 'taskkill' && lower.some(arg => /^\/{1,2}im$/.test(arg))) ||
      seg.prog === 'pkill' ||
      seg.prog === 'killall'
    if (byName) return violation('noKillByName', 'Rule Guard: do not stop processes by name. Stop only the processes you started, by their process ID (PID).')
  }

  if (isOn('noSkipHooks') && git !== null) {
    const flag = seg.args.find(arg => arg === '--no-verify' || arg === '--no-gpg-sign')
    const signing = /(^|\s)-c\s+["']?commit\.gpgsign\s*=\s*false/i.test(seg.text)
    if (flag !== undefined || signing)
      return violation('noSkipHooks', `Rule Guard: never skip git hooks or signing. Remove ${flag ?? 'commit.gpgsign=false'} and run the command again; if a hook fails, fix what it reports.`)
  }

  if (isOn('passCap') && ctx.passes !== null && ctx.passes.limit > 0) {
    const { count, limit, editedSince, extra } = ctx.passes
    if (count >= limit && editedSince && isCheckCommand(seg.code, extra))
      return violation('passCap', `Rule Guard: that would be test pass ${count + 1}, past the limit of ${limit}. Stop and ask the person how to go on.`)
  }

  return null
}

// Judges one tool call against the rules that are on. Null means it may go ahead.
export function evaluate(call: Call, ctx: Context): Violation | null {
  const isOn = (rule: RuleId) => ctx.enabled[rule] !== false

  if (call.message !== undefined && isOn('noAttribution')) {
    const found = findCredit(call.message)
    if (found !== null) return violation('noAttribution', `Rule Guard: commits carry no Claude or AI credit. Remove the line with "${found}" and commit again.`)
  }
  if (call.command === undefined) return null
  for (const seg of segments(call.command)) {
    const hit = checkSegment(seg, ctx, isOn)
    if (hit !== null) return hit
  }

  return null
}

// Narrows the Context mod's footer to its pass counter, or null when it is missing or not shaped as expected.
export function narrowPasses(footer: unknown): Passes | null {
  if (typeof footer !== 'object' || footer === null) return null
  const passes = (footer as { passes?: unknown }).passes
  if (typeof passes !== 'object' || passes === null) return null
  const { count, limit, editedSince, extra } = passes as Record<string, unknown>
  if (typeof count !== 'number' || typeof limit !== 'number') return null

  return {
    count,
    limit,
    editedSince: editedSince === true,
    extra: Array.isArray(extra) ? extra.filter((word): word is string => typeof word === 'string') : [],
  }
}

export function clip(command: string, max = 80): string {
  const flat = command.replace(/\s+/g, ' ').trim()

  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat
}

// Pure text helpers: secret scrubbing, comparing lesson text, slugs and hashes.
// Ported from Operant (core/agents.ts scrubLogLine, core/lessons.ts, shared/learn.ts textProblem and stripLinks).

export function scrubSecrets(text: string): string {
  return text
    .replace(/[\w-]{23,28}\.[\w-]{6,7}\.[\w-]{27,}/g, '[token]')
    .replace(/\b(sk|pk|ghp|gho|ghs|github_pat|xox[abp]|glpat|AKIA)[-_]?[A-Za-z0-9_-]{16,}/g, '[secret]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [secret]')
    .replace(/((?:api[_-]?key|token|secret|password|passwd|pwd)["']?\s*[:=]\s*["']?)[^\s"',}]{8,}/gi, '$1[secret]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[secret]')
}

export const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

export const clean = (s: string): string => oneLine(scrubSecrets(s))

// True when the text still holds something that looks like a secret after scrubbing would change it.
export const hasSecret = (s: string): boolean => scrubSecrets(s) !== s

// Text a prompt-injected transcript could plant to steer later sessions or run code (Operant's DANGEROUS).
const DANGEROUS =
  /\|\s*(sh|bash|zsh|pwsh|powershell|iex)\b|\b(curl|wget|iwr|Invoke-WebRequest|Invoke-Expression|iex)\b|\bsudo\b|\brm\s+-\w*r\w*f|\bbase64\s+(-d|--decode)|\b(ignore|disregard|forget)\b[^.\n]{0,30}\b(previous|prior|above|earlier)\b[^.\n]{0,20}\b(instructions?|rules?|lessons?)\b/i

export const textProblem = (text: string): string =>
  DANGEROUS.test(text) ? 'it holds a download, a pipe into a shell, an elevated or destructive command, or an order to ignore earlier rules' : ''

export const stripLinks = (text: string): string => text.replace(/\s*(https?:\/\/|www\.)\S+/gi, '').replace(/\s{2,}/g, ' ').trim()

const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'when', 'should', 'make', 'always', 'never', 'use', 'are', 'was', 'not', 'but', 'you', 'its', 'then', 'than'])

export const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9_./\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function words(text: string): Set<string> {
  return new Set(normalize(text).split(' ').filter(w => w.length >= 3 && !STOP.has(w)))
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let both = 0
  for (const w of a) if (b.has(w)) both++
  return both / (a.size + b.size - both)
}

export const similarity = (a: string, b: string): number => (normalize(a) === normalize(b) ? 1 : jaccard(words(a), words(b)))

type Targets = { files: readonly string[]; symbols: readonly string[] }
const lower = (xs: readonly string[]) => xs.map(x => x.toLowerCase())

// True when two lessons point at the same code: they share a file or symbol, or both name none.
export function sameTargets(a: Targets, b: Targets): boolean {
  const [af, bf, as, bs] = [lower(a.files), lower(b.files), lower(a.symbols), lower(b.symbols)]
  if (!af.length && !bf.length && !as.length && !bs.length) return true
  return af.some(f => bf.includes(f)) || as.some(s => bs.includes(s))
}

export const DUPLICATE_AT = 0.7

export const isDuplicate = (a: Targets & { text: string }, b: Targets & { text: string }): boolean =>
  similarity(a.text, b.text) >= DUPLICATE_AT && sameTargets(a, b)

export const slug = (text: string, max = 40): string =>
  normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '') || 'lesson'

// FNV-1a over the normalized text: the same fact always hashes the same, whatever its spacing or case.
export function hashText(text: string): string {
  const s = normalize(text)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

export const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)]

// About four characters to a token.
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

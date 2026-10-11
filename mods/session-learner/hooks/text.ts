/** Text helpers: secret scrubbing, normalising and similarity. */

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|npm_[A-Za-z0-9]{30,})\b/g,
  /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /((?:api[_-]?key|apikey|secret|token|passw(?:or)?d|pwd|auth|credential|private[_-]?key|access[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*)(["']?)[^\s"']{4,}\2/gi,
  /^(\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|CREDENTIALS?)\s*=\s*).+$/gm,
  /(https?:\/\/)[^\s/:@]+:[^\s/@]+@/g,
]

/** Replaces anything that looks like a key, token, password, bearer header, private key or .env secret. */
export function scrubSecrets(text: string): string {
  let out = text
  out = out.replace(SECRET_PATTERNS[0]!, '[private key removed]')
  out = out.replace(SECRET_PATTERNS[1]!, '[secret removed]')
  out = out.replace(SECRET_PATTERNS[2]!, (_m, kind: string) => `${kind} [secret removed]`)
  out = out.replace(SECRET_PATTERNS[3]!, '[secret removed]')
  out = out.replace(SECRET_PATTERNS[4]!, (_m, head: string) => `${head}[secret removed]`)
  out = out.replace(SECRET_PATTERNS[5]!, (_m, head: string) => `${head}[secret removed]`)
  out = out.replace(SECRET_PATTERNS[6]!, (_m, scheme: string) => `${scheme}[secret removed]@`)
  return out
}

export function hasSecret(text: string): boolean {
  return scrubSecrets(text) !== text
}

const STOP = new Set(
  'a an the and or but if then else of to in on at by for with from into onto as is are was were be been being it its this that these those there here we you i me my our your they them he she his her not no do does did done so too very can could should would will just than also when while which what who how use using used'.split(
    ' ',
  ),
)

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_.\-/ ]+/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^[.\-/]+|[.\-/]+$/g, ''))
    .filter(w => w.length > 1 && !STOP.has(w))
}

export function normalise(text: string): string {
  return words(text).join(' ')
}

/** Jaccard similarity of the content words of two texts, 0..1. */
export function similarity(a: string, b: string): number {
  const x = new Set(words(a))
  const y = new Set(words(b))
  if (x.size === 0 && y.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / (x.size + y.size - both)
}

const NEGATION = /\b(never|don'?t|do not|not|no longer|avoid|stop|instead of|without|disable|rather than)\b/i

export function isNegated(text: string): boolean {
  return NEGATION.test(text)
}

/** Two lessons on the same topic where one says the opposite of the other. */
export function contradicts(a: string, b: string): boolean {
  if (similarity(a, b) < 0.3) return false
  return isNegated(a) !== isNegated(b)
}

export function firstSentence(text: string, max = 280): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const m = /^(.+?[.!?])(\s|$)/.exec(flat)
  const one = m ? m[1]! : flat
  return one.length > max ? `${one.slice(0, max - 3).trimEnd()}...` : one
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

let counter = 0
export function newId(now: number, prefix = ''): string {
  counter = (counter + 1) % 1296
  const rand = Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0')
  return `${prefix}${now.toString(36)}${counter.toString(36).padStart(2, '0')}${rand}`
}

export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

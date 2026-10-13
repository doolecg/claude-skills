import type { Config } from './config'

export type HsSpec = { method: 'GET' | 'POST'; path: string; body?: unknown }

const bankPath = (cfg: Config, tail: string): string => `/v1/default/banks/${encodeURIComponent(cfg.hindsight.bank)}${tail}`

export const isConfigured = (cfg: Config): boolean => cfg.hindsight.enabled && /^https?:\/\//.test(cfg.hindsight.baseUrl)

export const retainSpec = (
  cfg: Config,
  items: { content: string; context?: string; tags: string[]; documentId?: string }[],
): HsSpec => ({
  method: 'POST',
  path: bankPath(cfg, '/memories'),
  body: {
    async: true,
    items: items.map(i => ({
      content: i.content,
      context: i.context ?? 'self-improve',
      tags: i.tags,
      ...(i.documentId ? { document_id: i.documentId } : {}),
    })),
  },
})

export const recallSpec = (cfg: Config, query: string, maxTokens: number, tags?: string[]): HsSpec => ({
  method: 'POST',
  path: bankPath(cfg, '/memories/recall'),
  body: { query, max_tokens: maxTokens, budget: 'low', ...(tags && tags.length ? { tags, tags_match: 'any' } : {}) },
})

export const reflectSpec = (cfg: Config, query: string): HsSpec => ({
  method: 'POST',
  path: bankPath(cfg, '/reflect'),
  body: { query, budget: 'low' },
})

export const documentsSpec = (cfg: Config): HsSpec => ({ method: 'GET', path: bankPath(cfg, '/documents?limit=20') })

export const tagsFor = (project: string, kind: string): string[] => [
  `project:${project.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 60) || 'unknown'}`,
  `kind:${kind.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 20) || 'fact'}`,
  'source:self-improve',
]

/** curl argv for a spec. The key is read by curl from the named environment variable; its value never passes through the mod. */
export const curlArgv = (cfg: Config, spec: HsSpec, withAuth: boolean): string[] => {
  const argv = ['curl', '-sS', '--max-time', '15', '-X', spec.method, cfg.hindsight.baseUrl + spec.path, '-H', 'Accept: application/json']
  if (spec.body !== undefined) argv.push('-H', 'Content-Type: application/json', '--data-binary', '@-')
  if (withAuth) {
    const v = cfg.hindsight.apiKeyEnv
    argv.push('--variable', `%${v}`, '--expand-header', `Authorization: Bearer {{${v}}}`)
  }
  argv.push('-w', '\n%{http_code}')
  return argv
}

export const parseCurl = (stdout: string): { status: number; body: unknown } => {
  const i = stdout.lastIndexOf('\n')
  const status = Number(stdout.slice(i + 1).trim())
  const raw = i >= 0 ? stdout.slice(0, i) : ''
  let body: unknown = raw
  try {
    body = JSON.parse(raw)
  } catch {
    // keep raw text
  }
  return { status: Number.isFinite(status) ? status : 0, body }
}

export const memoriesFromRecall = (body: unknown): string[] => {
  const r = (body as { results?: unknown })?.results
  if (!Array.isArray(r)) return []
  return r.map(x => (typeof x === 'string' ? x : typeof (x as { text?: unknown })?.text === 'string' ? (x as { text: string }).text : '')).filter(Boolean)
}

export const textFromReflect = (body: unknown): string => {
  const b = body as { text?: unknown; answer?: unknown } | null
  return typeof b?.text === 'string' ? b.text : typeof b?.answer === 'string' ? b.answer : ''
}

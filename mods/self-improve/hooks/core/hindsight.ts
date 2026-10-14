// Hindsight, the optional memory server. On only when the Hindsight address setting, or else
// ~/.hindsight/coding-agent.json's apiUrl, names a server that answers.
// Ported from Operant (core/hindsight.ts recall and retain), over the Io's fetch.

import type { Io } from './io'
import { joinPath } from './paths'

export const HINDSIGHT_TIMEOUT_MS = 5000

export type HindsightConfig = { url: string; token: string }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export const hindsightConfigPath = (io: Pick<Io, 'home' | 'isWindows'>): string => joinPath(io.isWindows, io.home, '.hindsight', 'coding-agent.json')

// The URL and optional token from the config file's text; null when the file does not name a usable server.
export function parseHindsightConfig(text: string | null): HindsightConfig | null {
  if (!text) return null
  let j: Obj
  try {
    j = obj(JSON.parse(text))
  } catch {
    return null
  }
  const url = str(j.apiUrl).replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/]+/i.test(url)) return null
  if (j.serverMode !== undefined && j.serverMode !== 'self-hosted' && j.serverMode !== 'remote') return null
  return { url, token: str(j.apiToken) || str(j.apiKey) || str(j.token) }
}

export type HindsightState = { on: true; client: Hindsight } | { on: false; reason: string }

export type Memory = { id: string; text: string; type: string; tags: string[] }

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export class Hindsight {
  constructor(
    private readonly io: Io,
    readonly config: HindsightConfig,
  ) {}

  private headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = json ? { 'content-type': 'application/json' } : {}
    if (this.config.token) h.authorization = `Bearer ${this.config.token}`
    return h
  }

  private async call(method: string, path: string, body?: unknown): Promise<Result<unknown>> {
    const r = await this.io.fetch(`${this.config.url}${path}`, {
      method,
      headers: this.headers(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      timeoutMs: HINDSIGHT_TIMEOUT_MS,
    })
    if (!r) return { ok: false, error: `no answer in ${HINDSIGHT_TIMEOUT_MS / 1000} s` }
    if (!r.ok) return { ok: false, error: `answered ${r.status}` }
    try {
      return { ok: true, value: JSON.parse(r.text) as unknown }
    } catch {
      return { ok: true, value: null }
    }
  }

  async health(): Promise<boolean> {
    const r = await this.io.fetch(`${this.config.url}/health`, { headers: this.headers(false), timeoutMs: HINDSIGHT_TIMEOUT_MS })
    return !!r?.ok
  }

  // Memories matching the query, as plain text. Tolerant of the response shape (results / memories / items).
  async recall(bank: string, query: string, limit = 8): Promise<Result<string[]>> {
    const r = await this.call('POST', `/v1/default/banks/${encodeURIComponent(bank)}/memories/recall`, { query, max_tokens: 2000 })
    if (!r.ok) return r
    const body = obj(r.value)
    const list = [body.results, body.memories, body.items, r.value].find(Array.isArray) as unknown[] | undefined
    const items = (list ?? [])
      .map(m => (typeof m === 'string' ? m : String(obj(m).text ?? obj(m).content ?? '')))
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, limit)
    return { ok: true, value: items }
  }

  // Hindsight's own answer about the bank (why something was decided); taken from the old self-improve plugin's recall tool.
  async reflect(bank: string, query: string): Promise<Result<string>> {
    const r = await this.call('POST', `/v1/default/banks/${encodeURIComponent(bank)}/reflect`, { query, budget: 'low' })
    if (!r.ok) return r
    const b = obj(r.value)
    return { ok: true, value: str(b.text) || str(b.answer) }
  }

  async retain(bank: string, content: string, tags: string[], context: string): Promise<Result<true>> {
    const r = await this.call('POST', `/v1/default/banks/${encodeURIComponent(bank)}/memories`, { items: [{ content, tags, context }], async: true })
    return r.ok ? { ok: true, value: true } : r
  }

  // Every memory of a bank, newest first, up to `max`.
  async list(bank: string, max = 500): Promise<Result<Memory[]>> {
    const out: Memory[] = []
    for (let offset = 0; offset < max; offset += 100) {
      const r = await this.call('GET', `/v1/default/banks/${encodeURIComponent(bank)}/memories/list?limit=100&offset=${offset}`)
      if (!r.ok) return offset === 0 ? r : { ok: true, value: out }
      const items = (obj(r.value).items as unknown[] | undefined) ?? []
      for (const m of items) {
        const o = obj(m)
        out.push({ id: str(o.id), text: str(o.text), type: str(o.fact_type), tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [] })
      }
      if (items.length < 100) break
    }
    return { ok: true, value: out }
  }
}

// Reads the config file and checks that the server answers. Never throws.
// `address`: the mod's Hindsight address setting; when set it is used in place of the file's apiUrl, with the file's
// token if it has one.
export async function connectHindsight(io: Io, address = ''): Promise<HindsightState> {
  let text: string | null = null
  try {
    text = await io.read(hindsightConfigPath(io))
  } catch {
    text = null
  }
  const fromFile = parseHindsightConfig(text)
  let config: HindsightConfig | null
  if (address) {
    const set = parseHindsightConfig(JSON.stringify({ apiUrl: address }))
    if (!set) return { on: false, reason: `address ${address} is not an http:// or https:// address` }
    config = { url: set.url, token: fromFile?.token ?? '' }
  } else {
    if (text === null) return { on: false, reason: 'not set up' }
    config = fromFile
  }
  if (!config) return { on: false, reason: 'not set up (no apiUrl in ~/.hindsight/coding-agent.json)' }
  const client = new Hindsight(io, config)
  try {
    if (await client.health()) return { on: true, client }
  } catch {
    // fall through
  }
  return { on: false, reason: `no answer from ${config.url} in ${HINDSIGHT_TIMEOUT_MS / 1000} s; will retry next run` }
}

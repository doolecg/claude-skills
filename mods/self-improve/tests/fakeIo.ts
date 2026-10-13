// An in-memory Io for the learner's tests: files in a map, git, CodeGraph and Hindsight answered by handlers.

import type { FetchResult, Io, ModelAsk, ModelReply, RunResult } from '../hooks/core/io'

export type Fake = Io & {
  files: Map<string, string>
  runs: (readonly string[])[]
  asks: ModelAsk[]
  answers: (string | ModelReply)[]
  fetches: { url: string; method: string; body: string }[]
  // Hindsight: banks of memories, or null for "no server answers".
  banks: Map<string, { id: string; text: string; fact_type: string; tags: string[] }[]> | null
  clock: number
}

export type FakeOptions = {
  isWindows?: boolean
  diffFiles?: string[]
  diff?: string
  codegraph?: boolean
  hindsight?: boolean
}

export const HOME = '/home/me'
export const CONFIG = '/home/me/.claude'

export function fakeIo(o: FakeOptions = {}): Fake {
  const files = new Map<string, string>()
  const io: Fake = {
    isWindows: o.isWindows ?? false,
    home: HOME,
    config: CONFIG,
    files,
    runs: [],
    asks: [],
    answers: [],
    fetches: [],
    banks: o.hindsight ? new Map() : null,
    clock: Date.UTC(2026, 9, 13, 12, 0, 0),
    now: async () => io.clock,
    read: async p => files.get(p) ?? null,
    write: async (p, t) => {
      files.set(p, t)
    },
    exists: async p => files.has(p) || [...files.keys()].some(k => k.startsWith(p.replace(/[\\/]+$/, '') + '/')),
    list: async p => {
      const base = p.replace(/[\\/]+$/, '') + '/'
      const names = new Map<string, 'file' | 'dir'>()
      for (const k of files.keys()) {
        if (!k.startsWith(base)) continue
        const rest = k.slice(base.length)
        const [first, ...more] = rest.split('/')
        names.set(first!, more.length ? 'dir' : 'file')
      }
      if (!names.size && !files.has(p)) throw new Error('ENOENT')
      return [...names].map(([name, kind]) => ({ name, kind }))
    },
    remove: async p => {
      files.delete(p)
    },
    run: async (argv): Promise<RunResult> => {
      io.runs.push(argv)
      const cmd = argv.join(' ')
      if (argv[0] === 'git') {
        if (o.diffFiles === undefined) return { code: 128, stdout: '', stderr: 'not a git repository' }
        if (cmd.includes('--name-only') && cmd.includes('diff')) return { code: 0, stdout: o.diffFiles.join('\n'), stderr: '' }
        if (cmd.includes('ls-files')) return { code: 0, stdout: '', stderr: '' }
        if (cmd.includes('-U0')) return { code: 0, stdout: o.diff ?? '', stderr: '' }
        if (cmd.includes('log')) return { code: 0, stdout: o.diffFiles.join('\n'), stderr: '' }
        if (cmd.includes('rev-parse')) return { code: 0, stdout: 'abc1234\n', stderr: '' }
        return { code: 0, stdout: '', stderr: '' }
      }
      if (cmd.includes('codegraph')) {
        if (!o.codegraph) throw new Error('codegraph: not found')
        return { code: 0, stdout: cmd.includes('explore') ? 'cartTotal is called by checkout (2 callers)' : '1.6.2', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: 'unknown command' }
    },
    fetch: async (url, init): Promise<FetchResult | null> => {
      io.fetches.push({ url, method: init.method ?? 'GET', body: init.body ?? '' })
      if (!io.banks) return null
      const path = url.replace(/^https?:\/\/[^/]+/, '')
      if (path === '/health') return { ok: true, status: 200, text: '{"status":"healthy"}' }
      const m = /^\/v1\/default\/banks\/([^/]+)\/memories(\/recall|\/list)?/.exec(path)
      if (!m) return { ok: false, status: 404, text: '' }
      const bank = decodeURIComponent(m[1]!)
      const items = io.banks.get(bank)
      if (m[2] === '/list') {
        if (!items) return { ok: false, status: 404, text: '{"detail":"not found"}' }
        const offset = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0)
        return { ok: true, status: 200, text: JSON.stringify({ items: items.slice(offset, offset + 100) }) }
      }
      if (m[2] === '/recall') return { ok: true, status: 200, text: JSON.stringify({ results: (items ?? []).map(i => ({ text: i.text })) }) }
      const body = JSON.parse(init.body ?? '{}') as { items: { content: string; tags: string[] }[] }
      const list = items ?? []
      for (const it of body.items) list.push({ id: `m${list.length + 1}-${bank}`, text: it.content, fact_type: 'world', tags: it.tags })
      io.banks.set(bank, list)
      return { ok: true, status: 200, text: '{"success":true}' }
    },
    model: async (ask): Promise<ModelReply> => {
      io.asks.push(ask)
      const a = io.answers.shift() ?? '[]'
      if (typeof a !== 'string') return a
      return { ok: true, text: a, inputTokens: Math.ceil(ask.prompt.length / 4), outputTokens: Math.ceil(a.length / 4) }
    },
  }
  return io
}

// A transcript as Claude Code writes it: one JSON row per line.
export function jsonl(turns: { user: string; assistant?: string; tools?: { name: string; input: Record<string, unknown>; error?: boolean }[] }[]): string {
  const rows: unknown[] = []
  for (const t of turns) {
    rows.push({ type: 'user', message: { role: 'user', content: t.user } })
    for (const tool of t.tools ?? []) {
      rows.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: tool.name, input: tool.input }] } })
      rows.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: tool.error ? 'Error: it failed' : 'ok', is_error: !!tool.error }] } })
    }
    if (t.assistant) rows.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: t.assistant }] } })
  }
  return rows.map(r => JSON.stringify(r)).join('\n')
}

export const LONG = ' '.padEnd(400, 'x')

export const turns = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ user: `please change the cart rounding, step ${i}${LONG}`, assistant: `Done with step ${i}.${LONG}` }))

export const lesson = (o: Record<string, unknown> = {}) =>
  JSON.stringify([{ kind: 'convention', text: 'Cart totals are computed in cents, not floats', files: ['core/cart.ts'], symbols: ['cartTotal'], scope: 'project', ...o }])

export const hindsightConfig = (io: Fake) => io.files.set(`${HOME}/.hindsight/coding-agent.json`, JSON.stringify({ serverMode: 'self-hosted', apiUrl: 'http://hs.local:8888' }))

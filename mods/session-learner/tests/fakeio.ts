import type { FsEntry } from 'claude-code'

import type { Io } from '../hooks/lib/io'

export type FakeOptions = {
  files?: Record<string, string>
  /** Paths that exist as symlinks to a folder or file already in `files`. */
  links?: string[]
  /** Paths whose read throws this message. */
  unreadable?: Record<string, string>
  env?: Partial<Record<keyof Io['env'], string>>
  fetch?: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; ok: boolean; headers: Record<string, string>; text: string }>
  run?: (argv: readonly string[], init?: { cwd?: string; timeoutMs?: number }) => Promise<{ exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }>
  /** 'never' (default): waits until aborted. 'now': every wait ends at once, as when the time is up. */
  sleep?: 'never' | 'now'
}

const slash = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')

export function reply(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return { status, ok: status >= 200 && status < 300, headers: {}, text }
}

export function fakeIo(opts: FakeOptions = {}) {
  const files = new Map<string, string>(Object.entries(opts.files ?? {}).map(([k, v]) => [slash(k), v]))
  const links = new Set((opts.links ?? []).map(slash))
  const calls = { fetch: [] as Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }>, run: [] as Array<{ argv: readonly string[]; init?: { cwd?: string; timeoutMs?: number } }>, reads: [] as string[] }
  const isDir = (p: string): boolean => [...files.keys()].some(k => k.startsWith(`${p}/`))
  const enoent = (p: string) => new Error(`ENOENT: no such file or directory, '${p}'`)

  const io: Io = {
    fs: {
      read: async p => {
        const k = slash(p)
        calls.reads.push(k)
        if (opts.unreadable?.[k]) throw new Error(opts.unreadable[k])
        const v = files.get(k)
        if (v === undefined) throw enoent(p)
        return v
      },
      exists: async p => files.has(slash(p)) || isDir(slash(p)),
      list: async p => {
        const dir = slash(p)
        if (!isDir(dir)) throw enoent(p)
        const names = new Set<string>()
        for (const k of files.keys()) if (k.startsWith(`${dir}/`)) names.add(k.slice(dir.length + 1).split('/')[0]!)
        return [...names].sort().map((name): FsEntry => {
          const full = `${dir}/${name}`
          const isLink = links.has(full)
          const kind = isLink ? 'other' : files.has(full) ? 'file' : 'dir'
          return { name, kind, size: 0, mtimeMs: 0, isLink }
        })
      },
      stat: async p => {
        const k = slash(p)
        if (files.has(k)) return { kind: 'file', size: 0, mtimeMs: 0, isLink: links.has(k) }
        if (isDir(k)) return { kind: 'dir', size: 0, mtimeMs: 0, isLink: links.has(k) }
        throw enoent(p)
      },
    },
    http: {
      fetch: (url, init) => {
        calls.fetch.push({ url, init })
        return opts.fetch ? opts.fetch(url, init) : Promise.reject(new Error('no fetch handler'))
      },
    },
    process: {
      run: (argv, init) => {
        calls.run.push({ argv, init })
        return opts.run ? opts.run(argv, init) : Promise.reject(new Error('spawn codegraph ENOENT'))
      },
    },
    clock: {
      sleep: (_ms, options) =>
        opts.sleep === 'now'
          ? Promise.resolve()
          : new Promise<void>((_, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    },
    env: {
      OS: async () => opts.env?.OS,
      USERPROFILE: async () => opts.env?.USERPROFILE,
      HOME: async () => opts.env?.HOME,
      HOMEDRIVE: async () => opts.env?.HOMEDRIVE,
      HOMEPATH: async () => opts.env?.HOMEPATH,
      TMPDIR: async () => opts.env?.TMPDIR,
      TEMP: async () => opts.env?.TEMP,
      TMP: async () => opts.env?.TMP,
      HINDSIGHT_CHANNEL_ID: async () => opts.env?.HINDSIGHT_CHANNEL_ID,
      HINDSIGHT_USER_ID: async () => opts.env?.HINDSIGHT_USER_ID,
    },
  }
  return { io, calls, files }
}

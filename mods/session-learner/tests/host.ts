import type { CompleteRequest, CompleteResult, Host } from '../hooks/pipeline'
import { fakeIo, reply } from './fakeio'

export const HOME = '/home/me'
export const CWD = '/work/proj'
export const SESSION = 'sess-1'
export const TRANSCRIPT = `${HOME}/.claude/projects/-work-proj/${SESSION}.jsonl`
export const HINDSIGHT = 'http://hs.local:8888'

export type World = {
  host: Host
  files: Map<string, string>
  store: Map<string, unknown>
  prompts: CompleteRequest[]
  fetches: Array<{ url: string; body: unknown }>
  runs: Array<readonly string[]>
  /** What the model answers; a function gets the request. */
  answer: string | ((req: CompleteRequest) => CompleteResult)
  diff: string
  head: string
  hindsight: 'up' | 'down' | 'none'
  removed: string[]
  clock: number
}

export function world(over: { files?: Record<string, string>; diff?: string; hindsight?: 'up' | 'down' | 'none' } = {}): World {
  const w = {} as World
  w.prompts = []
  w.fetches = []
  w.runs = []
  w.answer = '[]'
  w.diff = over.diff ?? ''
  w.head = 'abc123'
  w.hindsight = over.hindsight ?? 'up'
  w.removed = []
  w.clock = Date.UTC(2026, 9, 11, 12)
  w.store = new Map()
  const files: Record<string, string> = { ...(over.files ?? {}) }
  if (w.hindsight !== 'none') files[`${HOME}/.hindsight/coding-agent.json`] = JSON.stringify({ serverMode: 'self-hosted', apiUrl: HINDSIGHT })
  const fake = fakeIo({
    files,
    env: { HOME },
    sleep: 'never',
    fetch: async (url, init) => {
      w.fetches.push({ url, body: init?.body ? JSON.parse(init.body) : null })
      if (w.hindsight === 'down') throw new Error('connect ECONNREFUSED')
      if (url.endsWith('/memories/recall')) return reply(200, { results: [] })
      if (url.endsWith('/memories')) return reply(200, { operation_id: 'op1' })
      return reply(404, {})
    },
    run: async argv => {
      w.runs.push(argv)
      const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
      if (argv[0] === 'git' && argv[1] === 'diff') return ok(w.diff)
      if (argv[0] === 'git' && argv[1] === 'status') return ok('')
      if (argv[0] === 'git' && argv[1] === 'log') return ok('src/api.ts\n')
      if (argv[0] === 'git' && argv[1] === 'rev-parse') return ok(`${w.head}\n`)
      return { exitCode: 1, stdout: '', stderr: 'not found', isStdoutTruncated: false, isStderrTruncated: false }
    },
  })
  w.files = fake.files
  w.host = {
    io: fake.io,
    home: HOME,
    configDir: `${HOME}/.claude`,
    write: async (path, text) => {
      fake.files.set(path.replace(/\\/g, '/'), text)
    },
    remove: async path => {
      w.removed.push(path)
      return fake.files.delete(path.replace(/\\/g, '/'))
    },
    now: async () => w.clock,
    complete: async req => {
      w.prompts.push(req)
      if (typeof w.answer === 'function') return w.answer(req)
      return { isAnswered: true, text: w.answer, usage: { input_tokens: 3000, output_tokens: 300 } }
    },
    storeGet: async key => (w.store.has(key) ? JSON.parse(JSON.stringify(w.store.get(key))) : undefined),
    storeSet: async (key, value) => {
      w.store.set(key, JSON.parse(JSON.stringify(value)))
    },
  }
  return w
}

export const job = (over: Record<string, unknown> = {}) => ({
  id: 'job1',
  sessionId: SESSION,
  cwd: CWD,
  transcriptPath: TRANSCRIPT,
  startHead: 'abc123',
  note: '',
  reason: '/done',
  createdAt: 0,
  state: 'pending' as const,
  ...over,
})

export const API_DIFF = [
  'diff --git a/src/api.ts b/src/api.ts',
  '--- a/src/api.ts',
  '+++ b/src/api.ts',
  '@@ -1,0 +1,3 @@ export async function fetchUser(id) {',
  '+export function withRetry(fn) {',
  '+  return fn()',
  '+}',
].join('\n')

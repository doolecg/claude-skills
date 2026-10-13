// What the learner needs from the outside world. register.tsx builds one from `$`; tests build one in memory.

export type RunResult = { code: number; stdout: string; stderr: string }

export type FetchResult = { ok: boolean; status: number; text: string }

export type ModelReply =
  | { ok: true; text: string; inputTokens: number; outputTokens: number }
  | { ok: false; error: string; inputTokens: number; outputTokens: number }

export type ModelAsk = { model: string; prompt: string; maxTokens: number; effort?: 'low' | 'medium' | 'high'; timeoutMs: number }

export type Io = {
  isWindows: boolean
  home: string
  // The host's config folder (paths.hostConfigDir).
  config: string
  now(): Promise<number>
  read(path: string): Promise<string | null>
  write(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  list(path: string): Promise<{ name: string; kind: 'file' | 'dir' | 'other' }[]>
  remove(path: string): Promise<void>
  run(argv: readonly string[], opts?: { cwd?: string; timeoutMs?: number }): Promise<RunResult>
  // Resolves null when nothing answered within timeoutMs.
  fetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs: number }): Promise<FetchResult | null>
  model(ask: ModelAsk): Promise<ModelReply>
  log?(line: string): void
}

export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

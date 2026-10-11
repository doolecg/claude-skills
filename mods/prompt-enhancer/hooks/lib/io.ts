import type { FsEntry, FsStat, HttpInit, HttpResponse, ProcessRunInit, ProcessRunResult, SleepOptions } from 'claude-code'

/**
 * What the shared libraries need from `$`. The validator follows `$` only into functions declared
 * in the same file, never across an import, and wants `$.env.get` called with a literal name, so a
 * mod builds this object in its own register file (copy `makeIo` from _shared/hooks/register.ts)
 * and hands it to the libraries. Tests hand them a fake one.
 */
export type Io = {
  fs: {
    read: (path: string) => Promise<string>
    exists: (path: string) => Promise<boolean>
    list: (path: string) => Promise<FsEntry[]>
    stat: (path: string) => Promise<FsStat>
  }
  http: { fetch: (url: string, init?: HttpInit) => Promise<HttpResponse> }
  process: { run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult> }
  clock: { sleep: (ms: number, options?: SleepOptions) => Promise<void> }
  env: {
    OS: () => Promise<string | undefined>
    USERPROFILE: () => Promise<string | undefined>
    HOME: () => Promise<string | undefined>
    HOMEDRIVE: () => Promise<string | undefined>
    HOMEPATH: () => Promise<string | undefined>
    TMPDIR: () => Promise<string | undefined>
    TEMP: () => Promise<string | undefined>
    TMP: () => Promise<string | undefined>
    HINDSIGHT_CHANNEL_ID: () => Promise<string | undefined>
    HINDSIGHT_USER_ID: () => Promise<string | undefined>
  }
}

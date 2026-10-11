import type { EngineInterface, Register } from 'claude-code'

import { explore, findIndex } from '../lib/codegraph'
import { loadHindsight, projectBank, recall, resolveProjectBank, retain, userBank } from '../lib/hindsight'
import type { Io } from '../lib/io'
import { homeDir } from '../lib/paths'
import { listSkills } from '../lib/skills'

// Copy this function into the register file of any mod that uses the libraries: `$` can only be
// followed into a function of the same file, and `$.env.get` needs literal names.
export const makeIo = ($: EngineInterface): Io => ({
  fs: {
    read: path => $.fs.read(path),
    exists: path => $.fs.exists(path),
    list: path => $.fs.list(path),
    stat: path => $.fs.stat(path),
  },
  http: { fetch: (url, init) => $.http.fetch(url, init) },
  process: { run: (argv, init) => $.process.run(argv, init) },
  clock: { sleep: (ms, options) => $.clock.sleep(ms, options) },
  env: {
    OS: () => $.env.get('OS'),
    USERPROFILE: () => $.env.get('USERPROFILE'),
    HOME: () => $.env.get('HOME'),
    HOMEDRIVE: () => $.env.get('HOMEDRIVE'),
    HOMEPATH: () => $.env.get('HOMEPATH'),
    TMPDIR: () => $.env.get('TMPDIR'),
    TEMP: () => $.env.get('TEMP'),
    TMP: () => $.env.get('TMP'),
    HINDSIGHT_CHANNEL_ID: () => $.env.get('HINDSIGHT_CHANNEL_ID'),
    HINDSIGHT_USER_ID: () => $.env.get('HINDSIGHT_USER_ID'),
  },
})

// Test-only: `session.start` with a cwd of "selftest:<folder>" drives every library through
// makeIo and hands the outcome back as JSON in `cwd`, so tests can check the adapter against
// the engine. A real session never has such a cwd.
export async function exerciseLibs(io: Io, cwd: string) {
  const home = await homeDir(io)
  const skills = await listSkills(io, cwd)
  const loaded = await loadHindsight(io)
  let recalled: unknown = loaded
  if (loaded.ok) {
    recalled = await recall(io, loaded.config, await resolveProjectBank(io, loaded.config, cwd), 'x')
    void [projectBank, userBank, retain]
  }
  const root = await findIndex(io, cwd)
  const graph = root ? await explore(io, root, 'x') : null
  return { home, skills, recalled, root, graph }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (!e.cwd.startsWith('selftest:')) return started
    return { ...started, cwd: JSON.stringify(await exerciseLibs(makeIo($), e.cwd.slice('selftest:'.length))) }
  })
}

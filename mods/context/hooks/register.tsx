import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type { CtxFooter } from '../types'
import {
  HINDSIGHT,
  THROTTLE,
  afterTool,
  contextOf,
  emptyFooter,
  gitInfo,
  hindsightFrom,
  isDue,
  isPersonPrompt,
  parseExtra,
  parseHindsightConfig,
  parseLimit,
  passesText,
  resetPasses,
} from './logic'
import type { HindsightConfig } from './logic'

type $ = EngineInterface

const footerAtom = atom({ plugin: 'context', key: 'footer' } as const, emptyFooter())

/** A failure in the footer's own bookkeeping never reaches the session. */
async function quiet(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch {}
}

// ---------------------------------------------------------------- readers
// Each answers or throws; the caller leaves its field as it was on a throw.

const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

export async function homeDir($: $): Promise<string> {
  return slash((await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || '')
}

async function exists($: $, path: string): Promise<boolean> {
  try {
    return await $.fs.exists(path)
  } catch {
    return false
  }
}

async function git($: $, cwd: string, args: string[]): Promise<string | null> {
  try {
    const r = await $.process.run(['git', ...args], { cwd, timeoutMs: 5000 })
    return r.exitCode === 0 ? r.stdout.trim() : null
  } catch {
    return null
  }
}

async function hindsightConfig($: $): Promise<HindsightConfig | null> {
  try {
    return parseHindsightConfig(await $.fs.read(`${await homeDir($)}/.hindsight/coding-agent.json`))
  } catch {
    return null
  }
}

// The health answer's status, or null when the server did not answer within the limit.
async function healthStatus($: $, cfg: HindsightConfig): Promise<number | null> {
  const stop = new AbortController()
  try {
    return await Promise.race([
      $.http.fetch(`${cfg.url}/health`, { headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {} }).then(r => r.status),
      $.clock.sleep(HINDSIGHT.timeoutMs, { signal: stop.signal }).then(
        () => null,
        () => null,
      ),
    ])
  } catch {
    return null
  } finally {
    stop.abort()
  }
}

// ---------------------------------------------------------------- the footer

let limit = 3
let extra: string[] = []

/** Writes the footer, the pass limit and extra words always the options' current ones. */
const setFooter = ($: $, fn: (f: CtxFooter) => CtxFooter) =>
  update($, footerAtom, f => {
    const next = fn(f ?? emptyFooter(limit, extra))
    return { ...next, passes: { ...next.passes, limit, extra } }
  })

const setPasses = ($: $, fn: (p: CtxFooter['passes']) => CtxFooter['passes']) => setFooter($, f => ({ ...f, passes: fn(f.passes) }))

async function refreshContext($: $): Promise<void> {
  const context = contextOf(await $.session.usage())
  await setFooter($, f => ({ ...f, context }))
}

async function refreshHindsight($: $): Promise<void> {
  const cfg = await hindsightConfig($)
  const hindsight = cfg ? hindsightFrom(await healthStatus($, cfg)) : 'off'
  await setFooter($, f => ({ ...f, hindsight }))
}

async function refreshCodegraph($: $): Promise<void> {
  const root = slash(await $.session.root())
  const top = await git($, root, ['rev-parse', '--show-toplevel'])
  const places = [top ? slash(top) : '', root].filter(Boolean)
  let found = false
  for (const p of places) {
    if (await exists($, `${p}/.codegraph`)) {
      found = true
      break
    }
  }
  const codegraph = found ? 'indexed' : 'none'
  await setFooter($, f => ({ ...f, codegraph }))
}

async function refreshGit($: $): Promise<void> {
  const root = await $.session.root()
  const branch = await git($, root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  let info: CtxFooter['git'] = null
  if (branch) {
    const porcelain = await git($, root, ['status', '--porcelain'])
    const counts = await git($, root, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
    info = gitInfo(branch, porcelain, counts)
  }
  await setFooter($, f => ({ ...f, git: info }))
}

let lastContext = 0
let lastGit = 0

/** Runs `fn` when the throttle gap has passed since the last run it allowed. */
async function throttled($: $, which: 'context' | 'git', fn: () => Promise<void>): Promise<void> {
  const now = await $.clock.now()
  if (which === 'context') {
    if (!isDue(lastContext, now, THROTTLE.contextMs)) return
    lastContext = now
  } else {
    if (!isDue(lastGit, now, THROTTLE.gitMs)) return
    lastGit = now
  }
  await fn()
}

const SHELL_OR_EDIT = new Set(['Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

let timer: Timer | undefined

export const register: Register = (on, options: PluginOptions) => {
  limit = parseLimit(options.passLimit)
  extra = parseExtra(options.extraChecks)

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await quiet(() => $.command.register({ name: 'passes', description: 'Show how many test and fix passes this problem has had, or reset the count', argumentHint: '[reset]', immediate: true }))
    await quiet(() => setFooter($, f => f))
    await quiet(() => refreshContext($))
    await quiet(() => refreshCodegraph($))
    await quiet(() => refreshGit($))
    timer?.cancel()
    timer = $.clock.every(HINDSIGHT.everyMs, () => void quiet(() => refreshHindsight($)))
    await quiet(() => refreshHindsight($))
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      await quiet(() => refreshContext($))
      await quiet(() => refreshCodegraph($))
      await quiet(() => refreshGit($))
    }
    return done
  })

  // Counts check runs and edits once the tool has answered; the call itself is never held back or changed.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran && 'deny' in ran && ran.deny) return ran
    await quiet(async () => {
      const tool = String(e.tool)
      if (!SHELL_OR_EDIT.has(tool)) {
        await throttled($, 'context', () => refreshContext($))
        return
      }
      const command = (e as { command?: unknown }).command
      await setPasses($, p => afterTool(p, tool, command))
      await throttled($, 'git', () => refreshGit($))
      await throttled($, 'context', () => refreshContext($))
    })
    return ran
  })

  // A prompt the person types starts a new problem.
  on('prompt.submit', async ($, e, next) => {
    if (isPersonPrompt(e.origin, e.command !== undefined, e.isMeta === true)) await quiet(() => setPasses($, resetPasses))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'passes' }, async ($, e) => {
    if (/^\s*reset\b/i.test(e.args)) {
      await quiet(() => setPasses($, resetPasses))
      return { text: 'Passes reset.' }
    }
    const f = (await read($, footerAtom)) ?? emptyFooter(limit, extra)
    return { text: passesText({ ...f.passes, limit }) }
  }).catch(() => ({ text: 'Passes are not available right now.' }))
}

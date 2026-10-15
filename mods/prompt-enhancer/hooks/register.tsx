import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { LastRun, Phase, PublishedSegment, Rewrite } from '../types'
import {
  COMMAND,
  DEFAULTS,
  HOST_KEY,
  LIMITS,
  SYSTEM_PROMPT,
  autoMemoryDir,
  bankFor,
  buildPrompt,
  configDir,
  conversationLines,
  recallsText,
  describeContext,
  folderList,
  gatherContext,
  gitLines,
  memoryFileLine,
  memoryIndex,
  mergeSkills,
  parseHindsightConfig,
  parseRecall,
  parseReply,
  parseSkillFile,
  parseSymbols,
  projectName,
  queryWords,
  resolveEffort,
  resolveModel,
  segmentFor,
  soulLines,
  subCommand,
  treeHasKey,
} from './enhance'
import type { GatherDeps, HindsightConfig, Recall, RecentMessage, Skill } from './enhance'

type $ = EngineInterface

// ---------------------------------------------------------------- readers
// What Enhance Prompt reads before the model call. Each reader answers or throws; gatherContext() in
// enhance.ts decides what a failure means, so none of them stops a rewrite.
const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

export async function homeDir($: $): Promise<string> {
  return slash((await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || '')
}

async function claudeDir($: $): Promise<string> {
  return configDir(await homeDir($), await $.env.get('CLAUDE_CONFIG_DIR'))
}

async function isWindows($: $): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
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

// ---------------------------------------------------------------- Hindsight

export async function hindsightConfig($: $): Promise<HindsightConfig | null> {
  try {
    return parseHindsightConfig(await $.fs.read(`${await homeDir($)}/.hindsight/coding-agent.json`))
  } catch {
    return null
  }
}

function recaller($: $, cfg: HindsightConfig, bank: string): Recall {
  return async q => {
    const r = await $.http.fetch(`${cfg.url}/v1/default/banks/${encodeURIComponent(bank)}/memories/recall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) },
      body: JSON.stringify({ query: q, budget: 'low', max_tokens: 1500 }),
    })
    if (!r.ok) return { items: [], error: r.status === 404 ? `no bank ${bank}` : `answered ${r.status}` }
    return { items: parseRecall(r.text), error: '' }
  }
}

// ---------------------------------------------------------------- markdown files

async function readSoul($: $): Promise<string[] | null> {
  try {
    return soulLines(await $.fs.read(`${await claudeDir($)}/soul.md`))
  } catch {
    return null
  }
}

async function readMemoryFiles($: $, project: string): Promise<string[] | null> {
  const dir = autoMemoryDir(await claudeDir($), project)
  let index: string
  try {
    index = await $.fs.read(`${dir}/MEMORY.md`)
  } catch {
    return null
  }
  const { lines, files } = memoryIndex(index)
  const facts: string[] = []
  for (const f of files.slice(0, 12)) {
    try {
      const line = memoryFileLine(await $.fs.read(`${dir}/${f}`))
      if (line) facts.push(line)
    } catch {}
  }
  return facts.length ? facts : lines
}

// ---------------------------------------------------------------- CodeGraph

// Symbol lines from the repo's existing index; null without a .codegraph/ folder, 'missing' without
// the CLI. Never indexes. On Windows the CLI is a .cmd shim, which runs through cmd; the query is
// letters, digits, _ and spaces only, so nothing in it reaches cmd as syntax.
async function readSymbols($: $, roots: readonly string[], q: string): Promise<string[] | null | 'missing'> {
  let root = ''
  for (const r of roots) {
    if (r && (await exists($, `${r}/.codegraph`))) {
      root = r
      break
    }
  }
  if (!root) return null
  const words = queryWords(q)
  if (!words) return []
  const args = ['query', words, '--limit', '40', '--json']
  const run = (argv: string[]) => $.process.run(argv, { cwd: root, timeoutMs: 8000 })
  let r
  try {
    r = await run(['codegraph', ...args])
  } catch {
    if (!(await isWindows($))) return 'missing'
    try {
      r = await run(['cmd.exe', '/d', '/c', 'codegraph', ...args])
    } catch {
      return 'missing'
    }
    if (r.exitCode !== 0 && /not recognized/i.test(r.stderr)) return 'missing'
  }
  if (r.exitCode !== 0) throw new Error('codegraph failed')
  return parseSymbols(r.stdout)
}

// ---------------------------------------------------------------- session

async function readSession($: $, root: string): Promise<string[]> {
  const lines = [`Folder: ${root}`]
  const status = await git($, root, ['status', '--porcelain=v1', '--branch'])
  if (status !== null) lines.push(...gitLines(status))
  try {
    const rows = await $.session.messages()
    const recent: RecentMessage[] = rows.slice(-12).map(m => ({
      role: m.role,
      text: m.text,
      tools: m.toolUses.map(t => String((t as { name?: unknown }).name ?? '')).filter(Boolean),
    }))
    const talk = conversationLines(recent)
    if (talk.length) lines.push('Recent conversation:', ...talk)
  } catch {}
  return lines
}

// ---------------------------------------------------------------- all of it

export type Settings = { hindsightMs: number; soulBank: string }

export async function contextDeps($: $, s: Settings): Promise<{ deps: GatherDeps; project: string }> {
  const root = slash(await $.session.root())
  const common = await git($, root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const top = await git($, root, ['rev-parse', '--show-toplevel'])
  const project = projectName(common, root)
  const cfg = await hindsightConfig($)
  const deps: GatherDeps = {
    hindsight: cfg ? { project: recaller($, cfg, bankFor(project)), soul: s.soulBank ? recaller($, cfg, s.soulBank) : undefined } : null,
    soul: () => readSoul($),
    memoryFiles: () => readMemoryFiles($, top ? slash(top) : root),
    symbols: q => readSymbols($, [...new Set([root, top ? slash(top) : ''])], q),
    session: () => readSession($, root),
    hindsightMs: s.hindsightMs,
  }
  return { deps, project }
}

// ---------------------------------------------------------------- skills

async function skillFolder($: $, dir: string, prefix = ''): Promise<Skill[]> {
  const out: Skill[] = []
  let entries
  try {
    entries = await $.fs.list(dir)
  } catch {
    return out
  }
  for (const entry of entries.slice(0, 400)) {
    if (entry.kind !== 'dir' && !entry.isLink) continue
    try {
      const parsed = parseSkillFile(await $.fs.read(`${dir}/${entry.name}/SKILL.md`))
      out.push({ name: `${prefix}${parsed.name ?? entry.name}`, description: parsed.description ?? '' })
    } catch {}
  }
  return out
}

type Installed = { plugins?: Record<string, Array<{ installPath?: string }>> }

// Every skill the session can use: the slash-command list (user and plugin skills and commands, as the
// typeahead has them), then the skill folders: the config folder's, the project's, each enabled
// installed plugin's and any extra folders from the setting. The first of a name wins.
export async function listSkills($: $, extraFolders: unknown): Promise<{ lists: Skill[][]; note: string }> {
  const lists: Skill[][] = []
  const notes: string[] = []
  try {
    lists.push(
      (await $.command.list())
        .filter(c => c.source === 'plugin' || c.source === 'user')
        .map(c => ({ name: c.name, description: c.description })),
    )
  } catch {
    notes.push('could not list commands')
  }
  const config = await claudeDir($)
  const root = slash(await $.session.root())
  lists.push(await skillFolder($, `${config}/skills`))
  lists.push(await skillFolder($, `${root}/.claude/skills`))
  try {
    const installed = JSON.parse(await $.fs.read(`${config}/plugins/installed_plugins.json`)) as Installed
    const settings = (await $.settings.read()) as { enabledPlugins?: Record<string, boolean> }
    const enabled = settings.enabledPlugins ?? {}
    for (const [id, installs] of Object.entries(installed.plugins ?? {})) {
      if (enabled[id] !== true) continue
      const path = installs.find(i => typeof i.installPath === 'string')?.installPath
      if (path) lists.push(await skillFolder($, `${slash(path)}/skills`, `${id.split('@')[0]}:`))
    }
  } catch {}
  for (const dir of folderList(extraFolders)) lists.push(await skillFolder($, slash(dir)))
  return { lists, note: notes.join('; ') }
}

const phase = atom({ plugin: 'prompt-enhancer', key: 'phase' } as const, 'idle' as Phase)
const undo = atom({ plugin: 'prompt-enhancer', key: 'undo' } as const, null as Rewrite | null)
const held = atom({ plugin: 'prompt-enhancer', key: 'held' } as const, null as Rewrite | null)
const sessionEffort = atom({ plugin: 'prompt-enhancer', key: 'sessionEffort' } as const, '')
const lastRun = atom({ plugin: 'prompt-enhancer', key: 'lastRun' } as const, null as LastRun | null)
const segmentsOut = atom({ plugin: 'prompt-enhancer', key: 'segments' } as const, {} as Record<string, PublishedSegment>)

type Options = { model: unknown; effort: unknown; hindsightSeconds: number; soulBank: string; skillFolders: unknown }

function readOptions(options: PluginOptions): Options {
  const seconds = Number(options.hindsightSeconds)
  const bank = typeof options.soulBank === 'string' && options.soulBank.trim() ? options.soulBank.trim() : DEFAULTS.soulBank
  return {
    model: options.model ?? DEFAULTS.model,
    effort: options.effort ?? DEFAULTS.effort,
    hindsightSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(60, seconds) : DEFAULTS.hindsightSeconds,
    soulBank: bank,
    skillFolders: options.skillFolders ?? '',
  }
}

// The run that is current: a Cancel or a newer press makes an older run drop its result.
let current = 0
let stop: AbortController | null = null

const say = ($: $, text: string) => $.ui.toast(`Enhance Prompt: ${text}`)

// The segment a status bar draws (Bottom Bar's `segments` contract), written whenever what it shows changes.
async function publish($: $): Promise<void> {
  const seg = segmentFor(await read($, phase), await read($, lastRun), (await read($, undo)) !== null, (await read($, held)) !== null)
  const now = await read($, segmentsOut)
  if (JSON.stringify(now.enhance) !== JSON.stringify(seg)) await update($, segmentsOut, () => ({ enhance: seg }))
}

async function setPhase($: $, to: Phase): Promise<void> {
  await update($, phase, () => to)
  await publish($)
}

async function finish($: $, run: number): Promise<void> {
  if (run !== current) return
  stop = null
  $.ui.status(undefined)
  await setPhase($, 'idle')
}

export async function cancel($: $): Promise<void> {
  current++
  stop?.abort()
  stop = null
  $.ui.status(undefined)
  await setPhase($, 'idle')
  say($, 'stopped. Your prompt is unchanged.')
}

async function sessionEffortNow($: $): Promise<string> {
  const seen = await read($, sessionEffort)
  if (seen) return seen
  try {
    const s = (await $.settings.read()) as { effortLevel?: unknown }
    return typeof s.effortLevel === 'string' ? s.effortLevel : ''
  } catch {
    return ''
  }
}

async function failed($: $, run: number, text: string): Promise<void> {
  if (run !== current) return
  await update($, lastRun, last => ({ counts: last?.counts ?? '', ok: false }))
  say($, text)
}

// Reads the prompt box (or the text given to the command), gathers the context, asks the model and puts the
// rewrite in the box. Nothing is sent. On any failure the box is left as it was.
export async function enhance($: $, opts: Options, typed?: string): Promise<void> {
  if ((await read($, phase)) !== 'idle') return cancel($)
  const fromBox = typed === undefined || typed.trim() === ''
  const original = fromBox ? (await $.prompt.read()).text : typed!
  if (!original.trim()) {
    say($, 'type your prompt in the box first, then press Enhance Prompt (or run /enhance-prompt <your prompt>).')
    return
  }
  const run = ++current
  const controller = new AbortController()
  stop = controller
  try {
    await setPhase($, 'context')
    $.ui.status('gathering context...')
    const [{ deps }, skills] = await Promise.all([
      contextDeps($, { hindsightMs: opts.hindsightSeconds * 1000, soulBank: opts.soulBank }),
      listSkills($, opts.skillFolders),
    ])
    const context = await gatherContext(original, deps)
    if (run !== current) return
    await update($, lastRun, () => ({ counts: recallsText(context), ok: true }))
    const picked = mergeSkills(original, ...skills.lists)

    const model = resolveModel(opts.model, await $.session.model().catch(() => ''))
    const effort = resolveEffort(opts.effort, await sessionEffortNow($))
    await setPhase($, 'rewrite')
    $.ui.status(`rewriting with ${model}...`)
    let reply
    try {
      reply = await $.model.complete(
        {
          model,
          system: SYSTEM_PROMPT,
          prompt: buildPrompt(original, picked, context),
          maxTokens: LIMITS.maxTokens,
          timeoutMs: LIMITS.modelMs,
          ...(effort ? { effort } : {}),
        },
        { signal: controller.signal },
      )
    } catch (err) {
      await failed($, run, `could not use the model ${model} (${err instanceof Error ? err.message : 'refused'}). Your prompt is unchanged.`)
      return
    }
    if (run !== current) return
    if (!reply.isAnswered) {
      const why = reply.reason === 'api-error' ? `the API answered ${reply.status ?? 'an error'}` : reply.reason === 'aborted' ? 'it took too long' : 'it sent nothing back'
      await failed($, run, `the model ${model} did not answer (${why}). Your prompt is unchanged.`)
      return
    }
    const enhanced = parseReply(reply.text)
    if (!enhanced) {
      await failed($, run, `the model ${model} sent back nothing usable. Your prompt is unchanged.`)
      return
    }
    const done: Rewrite = { original, enhanced, note: describeContext(context, picked.length) }

    // The person may have typed while it ran: their text wins, and the rewrite waits for "Use rewrite".
    if (fromBox && (await $.prompt.read()).text.trim() !== original.trim()) {
      await update($, held, () => done)
      say($, 'you changed the prompt while it was being enhanced, so your text was kept. Press Use rewrite to put the rewrite in the box.')
      return
    }
    const filled = await $.prompt.fill({ text: enhanced, mode: 'replace' })
    if (!filled.isFilled) {
      await update($, held, () => done)
      say($, `the prompt box could not take the rewrite${filled.refusal === 'dialog' ? ' while a dialog is open' : ''}. Press Use rewrite when it is free.`)
      return
    }
    await update($, held, () => null)
    await update($, undo, () => done)
    say($, `ready to review (${done.note}). Press Enter to send it, or Undo to get your text back.`)
  } catch (err) {
    await failed($, run, `something went wrong (${err instanceof Error ? err.message : 'unknown error'}). Your prompt is unchanged.`)
  } finally {
    await finish($, run)
  }
}

export async function undoRewrite($: $): Promise<void> {
  const last = await read($, undo)
  if (!last) {
    say($, 'there is nothing to undo.')
    return
  }
  const filled = await $.prompt.fill({ text: last.original, mode: 'replace' })
  if (!filled.isFilled) {
    say($, 'the prompt box could not take your text back right now. Try Undo again.')
    return
  }
  await update($, undo, () => null)
  await publish($)
}

async function useHeld($: $): Promise<void> {
  const h = await read($, held)
  if (!h) return
  const filled = await $.prompt.fill({ text: h.enhanced, mode: 'replace' })
  if (!filled.isFilled) {
    say($, 'the prompt box could not take the rewrite right now. Try again.')
    return
  }
  await update($, held, () => null)
  // Undo puts back what the box held before this, which may be newer than the text that was enhanced.
  await update($, undo, () => h)
  await publish($)
}

async function discardHeld($: $): Promise<void> {
  await update($, held, () => null)
  await publish($)
}

// `/enhance-prompt [prompt | undo | cancel | use | discard]`, from the command, the button or a status bar.
async function run($: $, opts: Options, args: string): Promise<void> {
  const sub = subCommand(args)
  if (sub === 'undo') await undoRewrite($)
  else if (sub === 'cancel') {
    if ((await read($, phase)) !== 'idle') await cancel($)
  } else if (sub === 'use') await useHeld($)
  else if (sub === 'discard') await discardHeld($)
  else await enhance($, opts, args)
}

const SEGMENT_KEY = 'seg:prompt-enhancer:enhance'

export const register: Register = (on, options) => {
  const opts = readOptions(options)

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Rewrite the prompt in the box with context, memory and skills (or: undo, cancel)',
        argumentHint: '[prompt | undo | cancel]',
        immediate: true,
      })
      await $.command.register({ name: 'doole_prompt-enhancer', description: 'Enhance the prompt in the box', immediate: true })
    } catch {
      say($, 'could not add /enhance-prompt.')
    }
    // A reload starts with no run in flight.
    if ((await read($, phase)) !== 'idle') await update($, phase, () => 'idle' as Phase)
    await publish($)
    return ran
  })

  on('command.run', { command: ['enhance-prompt', 'doole_prompt-enhancer'] }, async ($, e) => {
    await run($, opts, e.args)
    return {}
  }).catch(() => ({}))

  // A status bar's click on the published segment or its actions is taken here, so the run's progress
  // writes reach the bar as they happen (a command the bar ran would write under the bar's own call).
  on('ui.press', async ($, e, next) => {
    if (e.element !== SEGMENT_KEY && !e.element.startsWith(`${SEGMENT_KEY}:`)) return next(e)
    const seg = (await read($, segmentsOut)).enhance
    const at = e.element === SEGMENT_KEY ? -1 : Number(e.element.slice(SEGMENT_KEY.length + 1))
    const command = at < 0 ? seg?.command : seg?.actions?.[at]?.command
    if (!command) return next(e)
    const args = command === COMMAND ? '' : command.slice(COMMAND.length + 1)
    void run($, opts, args)
    return { element: e.element }
  }).catch(($, e, next) => next(e))

  // The model's effort for "session": the main loop's last request says it.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && typeof e.effort === 'string') {
      const effort = e.effort
      void read($, sessionEffort)
        .then(seen => (seen === effort ? undefined : update($, sessionEffort, () => effort)))
        .catch(() => {})
    }
    return yield* next(e)
  })

  // Once a prompt is sent, its Undo has nothing left to undo.
  on('prompt.submit', async ($, e, next) => {
    const ran = await next(e)
    if (!e.text.trimStart().startsWith('/') && (await read($, undo)) !== null) {
      await update($, undo, () => null)
      await publish($)
    }
    return ran
  }).catch(($, e, next) => next(e))

  // The button's own row, used only where no status bar hosts the published segment: it sits at the
  // left of the row under the prompt, before whatever draws that row.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return below
    if (treeHasKey(below, HOST_KEY)) return below
    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await read($, phase)
    const last = await read($, undo)
    const waiting = await read($, held)
    const counts = (await read($, lastRun))?.counts ?? ''

    const controls =
      now !== 'idle'
        ? [
            <Button key="pe-enhance" label="Enhancing!" variant="primary" onPress={() => void cancel($)} />,
            <Button key="pe-cancel" label="Cancel" onPress={() => void cancel($)} />,
          ]
        : [
            <Button key="pe-enhance" label="Enhance Prompt" variant="primary" onPress={() => void enhance($, opts)} />,
            ...(counts
              ? [
                  <Text key="pe-counts" dimColor>
                    {counts}
                  </Text>,
                ]
              : []),
            ...(waiting
              ? [
                  <Button key="pe-use" label="Use rewrite" onPress={() => void useHeld($)} />,
                  <Button key="pe-discard" label="Discard" onPress={() => void discardHeld($)} />,
                ]
              : last
                ? [<Button key="pe-undo" label="Undo" onPress={() => void undoRewrite($)} />]
                : []),
          ]

    return (
      <Box flexDirection="row" width="100%" alignItems="center">
        <Box flexShrink={0} marginRight={1} columnGap={1} alignItems="center">
          {controls}
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          {below}
        </Box>
      </Box>
    )
  })
}

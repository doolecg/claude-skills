import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { AgentsPanelAgent, AgentsPanelMemory } from '../types'
import { brainPixels, brainSvg, critterOf, critterPixels, rasterOf, svgOf } from './critter'
import type { Io } from './lib/io'
import { basename, dirname, homeDir, joinPath } from './lib/paths'
import {
  EFFORT_COLOR,
  MCP_COLOR,
  SPINNER,
  UNKNOWN,
  addMemoryWrite,
  addSkill,
  agentBar,
  agentMetrics,
  bandLine,
  barText,
  contextOf,
  costOf,
  diffOf,
  effortWord,
  emptyTurn,
  fileRows,
  groupAgents,
  headline,
  hookMessagesFrom,
  isEditTool,
  isFileTool,
  isFinished,
  isMemoryPath,
  isServerFailure,
  mcpFromTools,
  mcpSummary,
  mcpTiles,
  memoryLine,
  mergeMcp,
  parseGitStatus,
  parseLearner,
  permissionText,
  questionText,
  serverOfTool,
  shortModel,
  shownStatus,
  skillTiles,
  statusFromList,
  statusFromReason,
  summaryOf,
  targetOf,
  todoCounts,
  touchFile,
  transcriptPathOf,
  windowOf,
} from './logic'

// Copied from mods/_shared/hooks/register.ts: `$` is only followed into functions of this file.
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

const PANE = 'agents-panel'
const TITLE = 'Agents'

const calls = atom({ plugin: 'agents-panel', key: 'calls' } as const, [])
const pending = atom({ plugin: 'agents-panel', key: 'pending' } as const, null)
const turn = atom({ plugin: 'agents-panel', key: 'turn' } as const, emptyTurn())
const files = atom({ plugin: 'agents-panel', key: 'files' } as const, [])
const lastFile = atom({ plugin: 'agents-panel', key: 'lastFile' } as const, null)
const git = atom({ plugin: 'agents-panel', key: 'git' } as const, null)
const memory = atom({ plugin: 'agents-panel', key: 'memory' } as const, { learner: null, isLearnerInstalled: false, writes: [] })
const agents = atom({ plugin: 'agents-panel', key: 'agents' } as const, [])
const mcp = atom({ plugin: 'agents-panel', key: 'mcp' } as const, [])
const mcpFailed = atom({ plugin: 'agents-panel', key: 'mcpFailed' } as const, [])
const skills = atom({ plugin: 'agents-panel', key: 'skills' } as const, [])
const hookMessages = atom({ plugin: 'agents-panel', key: 'hookMessages' } as const, null)
const transcriptPath = atom({ plugin: 'agents-panel', key: 'transcriptPath' } as const, null)
const mainModel = atom({ plugin: 'agents-panel', key: 'mainModel' } as const, null)
const sessionWindow = atom({ plugin: 'agents-panel', key: 'sessionWindow' } as const, null)
const view = atom({ plugin: 'agents-panel', key: 'view' } as const, null)
const stick = atom({ plugin: 'agents-panel', key: 'stick' } as const, true)
const cleared = atom({ plugin: 'agents-panel', key: 'cleared' } as const, [])
const collapsed = atom({ plugin: 'agents-panel', key: 'collapsed' } as const, { running: false, finished: false })
const statusOpen = atom({ plugin: 'agents-panel', key: 'statusOpen' } as const, true)
const tick = atom({ plugin: 'agents-panel', key: 'tick' } as const, 0)
const rev = atom({ plugin: 'agents-panel', key: 'rev' } as const, 0)
const isDark = atom({ plugin: 'agents-panel', key: 'isDark' } as const, true)
const bandPick = atom({ plugin: 'agents-panel', key: 'bandPick' } as const, null)

// Timers do not survive a reload, so these only steer the one ticker this load started.
let ticker: { cancel: () => void } | undefined
let isBobDown = false
let wantScroll = false
const dirty = new Set<'git' | 'memory' | 'mcp'>()

const quiet = async (work: () => Promise<unknown>) => {
  try {
    await work()
  } catch {}
}

async function cwdOf($: any): Promise<string> {
  try {
    return await $.session.cwd()
  } catch {
    return ''
  }
}

async function patchAgent($: any, id: string, change: (a: AgentsPanelAgent) => AgentsPanelAgent): Promise<void> {
  await update($, agents, list => list.map(a => (a.id === id ? change(a) : a)))
}

async function ensureAgent($: any, id: string, type: string, at: number): Promise<void> {
  await update($, agents, list =>
    list.some(a => a.id === id) ? list : [...list, { id, description: type || UNKNOWN, type: type || UNKNOWN, status: 'running' as const, startedAt: at }],
  )
}

async function refreshGit($: any): Promise<void> {
  const cwd = await cwdOf($)
  let repo: { root: string } | null = null
  try {
    repo = await $.session.repo()
  } catch {}
  if (!repo || cwd === '') {
    await update($, git, () => null)
    return
  }
  const run = await $.process.run(['git', '-C', cwd, 'status', '--porcelain=v1', '--branch', '--untracked-files=all'], { timeoutMs: 10_000 })
  if (run.exitCode !== 0) return
  const status = parseGitStatus(run.stdout, repo.root)
  await update($, git, () => status)
}

async function refreshMemory($: any): Promise<void> {
  const io = makeIo($)
  const home = await homeDir(io)
  if (!home) return
  const cwd = await cwdOf($)
  const lastRun = joinPath(home, '.claude/mods-data/session-learner/last-run.json')
  let isInstalled = false
  let learner: AgentsPanelMemory['learner'] = null
  try {
    const listing = await io.fs.read(joinPath(home, '.claude/plugins/installed_plugins.json'))
    isInstalled = /"session-learner@/.test(listing)
  } catch {}
  try {
    if (await io.fs.exists(lastRun)) {
      isInstalled = true
      learner = parseLearner(await io.fs.read(lastRun), cwd)
    }
  } catch {}
  await update($, memory, m => ({ ...m, isLearnerInstalled: isInstalled, learner }))
}

async function refreshMcp($: any): Promise<void> {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const tools = usage?.context?.breakdown?.mcpTools
  if (Array.isArray(tools)) await update($, mcp, () => mcpFromTools(tools))
  if (typeof usage?.context?.window === 'number') await update($, sessionWindow, () => usage.context.window)
}

async function refreshAgentList($: any): Promise<void> {
  const listed = await $.agent.list()
  const at = await $.clock.now()
  await update($, agents, list => {
    const out = [...list]
    for (const info of listed) {
      const status = statusFromList(info.status)
      const i = out.findIndex(a => a.id === info.id)
      if (i < 0) {
        out.push({ id: info.id, description: info.description || UNKNOWN, type: info.type || UNKNOWN, status: status ?? 'running', startedAt: at, ...(status && status !== 'running' && status !== 'waiting' ? { endedAt: at } : {}) })
        continue
      }
      const a = out[i]!
      const description = a.description === UNKNOWN || a.description === a.type ? info.description || a.description : a.description
      const merged = { ...a, description }
      if (status && !isFinished(a) && (status === 'done' || status === 'failed' || status === 'stopped')) {
        merged.status = status
        merged.endedAt = at
      } else if (status === 'waiting' && a.status === 'running') merged.status = 'waiting'
      else if (status === 'running' && a.status === 'waiting') merged.status = 'running'
      out[i] = merged
    }
    return out
  })
}

async function loadHookMessages($: any): Promise<void> {
  let path = await read($, transcriptPath)
  if (!path) {
    const home = await homeDir(makeIo($))
    const cwd = await cwdOf($)
    const id = await $.session.id()
    if (!home || cwd === '' || !id) return
    path = transcriptPathOf(home, cwd, id)
  }
  if (!(await $.fs.exists(path))) {
    await update($, hookMessages, () => [])
    return
  }
  const text = await $.fs.read(path)
  await update($, hookMessages, () => hookMessagesFrom(text))
}

async function refreshTheme($: any): Promise<void> {
  const rows = await $.config.list()
  const theme = rows.find((r: { key: string }) => r.key === 'theme')?.value
  await update($, isDark, () => !(typeof theme === 'string' && /light/i.test(theme)))
}

async function bandIsOn($: any, showBand: boolean): Promise<boolean> {
  const pick = await read($, bandPick)
  return pick && pick.from === showBand ? pick.value : showBand
}

// Writes the plugin's own config row; if that is refused, keeps the choice in the store instead.
async function setBand($: any, showBand: boolean, value: boolean): Promise<void> {
  await update($, bandPick, () => ({ value, from: showBand }))
  let isSaved = false
  try {
    const res = await $.config.set({ key: 'agents-panel.showBand', value })
    isSaved = res?.deny === undefined
  } catch {}
  await quiet(async () => {
    if (isSaved) await $.store.delete('bandPick')
    else await $.store.set('bandPick', { value, from: showBand })
  })
}

async function remember($: any, key: 'collapsed' | 'statusOpen', value: unknown): Promise<void> {
  await quiet(() => $.store.set(key, value))
}

async function bumpRev($: any, agentId: string | undefined): Promise<void> {
  await update($, rev, n => n + 1)
  if (agentId === undefined) return
  const [viewed, isStuck] = [await read($, view), await read($, stick)]
  if (viewed === agentId && isStuck) {
    wantScroll = true
    await quiet(() => $.ui.scroll({ in: PANE, to: 'end' }))
  }
}

// Started once by session.start, whose `$` outlives the other dispatches; it idles when there is nothing to do.
function startTicker($: any): void {
  if (ticker) return
  ticker = $.clock.every(600, () => {
    void onTick($)
  })
}

// Slow work (git, files, the context report) waits for the ticker, so no tool result or turn end waits on it.
function later($: any, work: 'git' | 'memory' | 'mcp'): void {
  dirty.add(work)
}

async function onTick($: any): Promise<void> {
  try {
    const list = await read($, agents)
    const hidden = await read($, cleared)
    const running = list.filter(a => !isFinished(a) && !hidden.includes(a.id))
    const mem = await read($, memory)
    const isLearning = mem.isLearnerInstalled && mem.learner?.state === 'running'
    if (running.length === 0 && !isLearning && !wantScroll && dirty.size === 0) return
    const work = [...dirty]
    dirty.clear()
    if (work.includes('git')) await quiet(() => refreshGit($))
    if (work.includes('memory') || isLearning) await quiet(() => refreshMemory($))
    const panes = await $.ui.panes()
    const isOpen = panes.some((p: { id: string }) => p.id === PANE)
    if (work.includes('mcp') && isOpen) await quiet(() => refreshMcp($))
    if (wantScroll) {
      wantScroll = false
      if (isOpen) await quiet(() => $.ui.scroll({ in: PANE, to: 'end' }))
    }
    isBobDown = !isBobDown
    if (isOpen) {
      for (const a of running) {
        const { cells } = rasterOf(critterPixels(a.id, isBobDown))
        await quiet(() => $.ui.blit({ requestId: PANE, key: `critter:${a.id}`, cells }))
      }
    }
    if (isLearning) await update($, tick, n => n + 1)
  } catch {}
}

async function resetSession($: any): Promise<void> {
  await update($, calls, () => [])
  await update($, pending, () => null)
  await update($, turn, () => emptyTurn())
  await update($, files, () => [])
  await update($, lastFile, () => null)
  await update($, agents, () => [])
  await update($, mcpFailed, () => [])
  await update($, skills, () => [])
  await update($, hookMessages, () => null)
  await update($, view, () => null)
  await update($, cleared, () => [])
  await update($, memory, m => ({ ...m, writes: [] }))
}

const MARK: Record<string, { glyph: string; color: string; word: string }> = {
  running: { glyph: '●', color: 'claude', word: 'running' },
  waiting: { glyph: '●', color: 'warning', word: 'waiting' },
  done: { glyph: '✓', color: 'success', word: 'done' },
  failed: { glyph: '✗', color: 'error', word: 'failed' },
  stopped: { glyph: '●', color: 'inactive', word: 'stopped' },
}

const READ_COLOR = 'merged'
const EDIT_COLOR = 'claude'
const DIRTY_COLOR = 'warning'

export const register: Register = (on, options) => {
  const showBand = options.showBand === true

  on('session.start', async ($, e, next) => {
    const out = await next(e)
    await quiet(async () => {
      const saved = (await $.store.get('bandPick')) as { value?: unknown; from?: unknown } | undefined
      if (saved && typeof saved.value === 'boolean') await update($, bandPick, () => ({ value: saved.value as boolean, from: saved.from === true }))
    })
    await quiet(async () => {
      const saved = (await $.store.get('collapsed')) as { running?: unknown; finished?: unknown } | undefined
      if (saved) await update($, collapsed, () => ({ running: saved.running === true, finished: saved.finished === true }))
    })
    await quiet(async () => {
      const saved = await $.store.get('statusOpen')
      if (typeof saved === 'boolean') await update($, statusOpen, () => saved)
    })
    await $.command.register({
      name: 'agents-panel',
      description: 'Show what Claude and its sub-agents are doing, in a pane',
      argumentHint: '[band on|off]',
      immediate: true,
    })
    await quiet(() => refreshGit($))
    await quiet(() => refreshMemory($))
    startTicker($)
    return out
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await quiet(() => resetSession($))
    return next(e)
  })

  on('command.run', { command: 'agents-panel' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words[0] === 'band') {
      if (words[1] === 'on' || words[1] === 'off') {
        await setBand($, showBand, words[1] === 'on')
        return { text: `Agents band above the prompt: ${words[1]}.` }
      }
      return { text: `Agents band above the prompt: ${(await bandIsOn($, showBand)) ? 'on' : 'off'}. Use /agents-panel band on or /agents-panel band off.` }
    }
    await quiet(() => refreshGit($))
    await quiet(() => refreshMemory($))
    await quiet(() => refreshMcp($))
    await quiet(() => refreshAgentList($))
    await quiet(() => refreshTheme($))
    if ((await read($, hookMessages)) === null) await quiet(() => loadHookMessages($))
    const placed = await $.ui.open({ id: PANE, title: TITLE })
    if (placed.isPlaced) return { text: 'Agents panel opened.' }
    const hl = headline(await read($, calls), await read($, pending), await read($, turn), await read($, lastFile))
    return { text: `${bandLine(hl, await read($, git), memoryLine(await read($, memory)))}. Make the window wider to see the agents panel.` }
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const isMain = e.agentId === undefined
    let at = 0
    let cwd = ''
    await quiet(async () => {
      at = await $.clock.now()
      cwd = await cwdOf($)
      const t = targetOf(e.tool, input, cwd)
      if (isMain) {
        await update($, calls, list => [...list.filter(c => c.id !== e.tool_use_id), { id: e.tool_use_id, tool: e.tool, at, path: t.path, command: t.command }])
        if (e.tool === 'AskUserQuestion') await update($, pending, () => ({ kind: 'question' as const, text: questionText(input), tool: e.tool }))
      }
      if (!isMain && e.tool === 'TodoWrite') {
        const counts = todoCounts(input)
        if (counts) await patchAgent($, e.agentId!, a => ({ ...a, todosDone: counts.done, todosTotal: counts.total }))
      }
    })

    let ran: ToolCallResult | undefined
    try {
      ran = await next(e)
      return ran
    } finally {
      await quiet(async () => {
        if (isMain) {
          await update($, calls, list => list.filter(c => c.id !== e.tool_use_id))
          await update($, pending, p => (p && p.tool === e.tool ? null : p))
        } else {
          await patchAgent($, e.agentId!, a => (a.isAsking ? { ...a, isAsking: false } : a))
        }
        const isOk = ran !== undefined && ran.deny === undefined && ran.isError !== true
        const t = targetOf(e.tool, input, cwd)
        if (isOk && isFileTool(e.tool) && t.path) {
          const kind = isEditTool(e.tool) ? 'edit' : 'read'
          const diff = kind === 'edit' ? diffOf(e.tool, ran!.result) : undefined
          await update($, files, list => touchFile(list, t.path!, kind, at, diff))
          if (isMain) await update($, lastFile, () => t.path!)
          if (kind === 'edit' && isMain) {
            await update($, turn, tu => {
              const edited = [...tu.edited.filter(p => p !== t.path), t.path!]
              const same = tu.edited[tu.edited.length - 1] === t.path
              const added = diff ? (same ? (tu.added ?? 0) : 0) + diff.added : undefined
              const removed = diff ? (same ? (tu.removed ?? 0) : 0) + diff.removed : undefined
              return { ...tu, edited, added, removed }
            })
          }
          if (kind === 'edit' && isMemoryPath(t.path)) await update($, memory, m => ({ ...m, writes: addMemoryWrite(m.writes, t.path!) }))
          if (kind === 'edit') later($, 'git')
        }
        if (isOk && e.tool === 'Skill' && typeof input.skill === 'string') await update($, skills, list => addSkill(list, input.skill as string))
        if (e.tool.startsWith('mcp__') && ran?.isError === true && isServerFailure(ran.text)) {
          const known = await read($, mcp)
          const server = serverOfTool(e.tool, known)
          if (server) await update($, mcpFailed, list => [...list.filter(s => s.server !== server), { server, state: 'failed' as const, reason: ran!.text }])
        } else if (e.tool.startsWith('mcp__') && isOk) {
          const server = serverOfTool(e.tool, await read($, mcp))
          if (server) await update($, mcpFailed, list => list.filter(s => s.server !== server))
        }
        if (!isMain) await bumpRev($, e.agentId)
      })
    }
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    const out = await next(e)
    if (out.decision !== undefined) return out
    await quiet(async () => {
      if (e.agent_id) await patchAgent($, e.agent_id, a => ({ ...a, isAsking: true }))
      else await update($, pending, () => ({ kind: 'permission', text: permissionText(e.tool_name, e.tool_input), tool: e.tool_name }))
    })
    return out
  })

  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    if (out.agentId) {
      const id = out.agentId
      await quiet(async () => {
        const at = await $.clock.now()
        const model = out.model
        await update($, agents, list => [
          ...list.filter(a => a.id !== id),
          { id, description: e.description || UNKNOWN, type: e.subagentType || UNKNOWN, status: 'running' as const, startedAt: at, prompt: e.prompt.slice(0, 4000), ...(model && model.startsWith('claude-') ? { model } : {}) },
        ])
      })
    }
    return out
  })

  on('classic.SubagentStart', async ($, e, next) => {
    const out = await next(e)
    await quiet(async () => {
      await ensureAgent($, e.agent_id, e.agent_type, await $.clock.now())
    })
    return out
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const out = await next(e)
    await quiet(async () => {
      const at = await $.clock.now()
      const effort = effortWord(e.effort)
      await patchAgent($, e.agent_id, a => ({
        ...a,
        ...(effort && !a.effort ? { effort } : {}),
        ...(isFinished(a) ? {} : { status: 'done' as const, endedAt: at }),
        isAsking: false,
      }))
      await bumpRev($, e.agent_id)
    })
    return out
  })

  on('turn.step', { agentId: /./ }, async function* ($, e, next) {
    const result = yield* next(e)
    const id = e.agentId
    if (id) {
      await quiet(async () => {
        const usage = result.usage
        const model = usage?.model || e.model
        const [main, win] = [await read($, mainModel), await read($, sessionWindow)]
        const effort = effortWord(e.effort)
        await patchAgent($, id, a => {
          const merged: AgentsPanelAgent = { ...a, model, ...(effort ? { effort } : {}) }
          const w = windowOf(model, main, win)
          if (w) merged.window = w
          if (usage) {
            merged.ctxTokens = contextOf(usage)
            const cost = costOf(usage, model)
            merged.costUsd = (a.costUsd ?? 0) + (cost ?? 0)
            merged.isCostKnown = (a.isCostKnown ?? true) && cost !== undefined
          }
          return merged
        })
        await bumpRev($, id)
      })
    }
    return result
  })

  on('turn.start', async ($, e, next) => {
    const out = await next(e)
    await quiet(async () => {
      await update($, turn, () => ({ isRunning: true, edited: [] }))
      await update($, pending, () => null)
    })
    return out
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    await quiet(async () => {
      const at = await $.clock.now()
      if (e.agentId) {
        const status = statusFromReason(e.reason)
        const model = e.usage?.model
        await patchAgent($, e.agentId, a => ({ ...a, status, endedAt: at, isAsking: false, ...(model && !a.model ? { model } : {}) }))
        await bumpRev($, e.agentId)
        return
      }
      await update($, turn, tu => ({ ...tu, isRunning: false }))
      await update($, calls, () => [])
      await update($, pending, () => null)
      if (e.usage?.model) await update($, mainModel, () => e.usage!.model)
      later($, 'git')
      later($, 'memory')
      later($, 'mcp')
    })
    return out
  })

  on('session.measure', async ($, e, next) => {
    const out = await next(e)
    await quiet(() => update($, sessionWindow, () => e.context.window))
    return out
  })

  on('classic.SessionStart', async ($, e, next) => {
    const out = await next(e)
    await quiet(async () => {
      if (e.transcript_path) await update($, transcriptPath, () => e.transcript_path)
      await update($, hookMessages, () => null)
    })
    return out
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const out = await next(e)
    await quiet(async () => {
      if (e.transcript_path && !(await read($, transcriptPath))) await update($, transcriptPath, () => e.transcript_path)
    })
    return out
  })

  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    const out = await next(e)
    await quiet(() => update($, stick, () => e.offset >= e.contentRows - e.bodyRows))
    return out
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || !(await bandIsOn($, showBand))) return below
    const { Box, Text, Button } = $.ui.resolve(e)
    const hl = headline(await read($, calls), await read($, pending), await read($, turn), await read($, lastFile))
    const mem = memoryLine(await read($, memory))
    const mine = (
      <Box flexDirection="row" gap={1}>
        <Text color={hl.isWaiting ? 'warning' : undefined} wrap="truncate-end">
          {bandLine(hl, await read($, git), mem)}
        </Text>
        <Button key="band-off" plain label="Off" onPress={() => setBand($, showBand, false)} />
      </Box>
    )
    return <Box flexDirection="column">{below ? [mine, below] : [mine]}</Box>
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // Raster is the terminal's alone and Svg every other surface's; each is used only on its own surface.
    const Raster = (els as { Raster?: any }).Raster
    const Svg = (els as { Svg?: any }).Svg
    const isTerminal = e.surface === 'terminal'
    const width = Math.max(20, e.props.bodyColumns)
    const now = await $.clock.now()
    const list = await read($, agents)
    const hidden = await read($, cleared)
    const viewed = await read($, view)
    const dark = await read($, isDark)
    await read($, rev)

    const critter = (a: AgentsPanelAgent) => {
      const isRunning = !isFinished(a)
      if (isTerminal) {
        const r = rasterOf(critterPixels(a.id))
        return <Raster key={`critter:${a.id}`} columns={r.columns} rows={r.rows} cells={r.cells} />
      }
      return (
        <Svg
          source={svgOf(a.id, isRunning)}
          alt={`${critterOf(a.id).name}, a ${critterOf(a.id).tint} critter in a ${critterOf(a.id).hat}`}
          width={24}
          height={24}
          isInteractive={isRunning ? true : undefined}
        />
      )
    }

    const mark = (a: AgentsPanelAgent) => {
      const m = MARK[shownStatus(a)]!
      if (!isTerminal && shownStatus(a) === 'running') {
        const svg =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="8" height="8"><circle cx="4" cy="4" r="3" fill="#d97757"><animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/></circle></svg>'
        return <Svg source={svg} alt="running" width={8} height={8} isInteractive />
      }
      return <Text color={m.color}>{m.glyph}</Text>
    }

    const modelLine = (a: AgentsPanelAgent) => {
      const model = shortModel(a.model)
      if (!a.effort && !model) return <Text dimColor>{UNKNOWN}</Text>
      return (
        <Box flexDirection="row" gap={1}>
          {a.effort && <Text color={EFFORT_COLOR[a.effort] ?? 'text'}>{a.effort}</Text>}
          {model && <Text>{model}</Text>}
        </Box>
      )
    }

    const bar = (a: AgentsPanelAgent, cols: number) => {
      const b = agentBar(a)
      if (!b) return null
      const color = b.kind === 'todos' ? 'success' : b.ratio >= 0.85 ? 'error' : b.ratio >= 0.7 ? 'warning' : 'suggestion'
      if (isTerminal) return <Text color={color}>{barText(b.ratio, cols)}</Text>
      const px = cols * 8
      const fill = b.kind === 'todos' ? '#4eba65' : b.ratio >= 0.85 ? '#d9534f' : b.ratio >= 0.7 ? '#e5a22a' : '#5b8def'
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="3"><rect width="${px}" height="3" rx="1.5" fill="#8884"/><rect width="${Math.round(px * b.ratio)}" height="3" rx="1.5" fill="${fill}"/></svg>`
      return <Svg source={svg} alt={b.label} width={px} height={3} />
    }

    // ---------- one agent's conversation ----------
    const agent = viewed ? list.find(a => a.id === viewed) : undefined
    if (agent) {
      const c = critterOf(agent.id)
      let rows: { role: string; text: string; toolUses: { tool: string; input: Record<string, unknown>; text?: string; isError?: true }[] }[] = []
      let note: string | undefined
      try {
        const found = await $.session.messages({ agentId: agent.id })
        if ('deny' in found) note = 'This agent\'s conversation is not available.'
        else rows = found as typeof rows
      } catch {
        note = 'This agent\'s conversation is not available.'
      }
      const first = rows[0]?.role === 'user' ? rows[0] : undefined
      const prompt = first?.text || agent.prompt || UNKNOWN
      const body = (first ? rows.slice(1) : rows).filter(r => r.role === 'assistant')
      const shown = body.slice(-60)
      const b = agentBar(agent)
      return (
        <Box flexDirection="column" gap={1}>
          <Button key="back" plain label="Back to the agents list" onPress={() => update($, view, () => null)}>
            {'< Agents'}
          </Button>
          <Box flexDirection="row" gap={1}>
            {critter(agent)}
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                {mark(agent)}
                <Text bold>{agent.description}</Text>
              </Box>
              <Text dimColor>{`${c.name} · ${agent.type}`}</Text>
              {modelLine(agent)}
              <Text dimColor>{agentMetrics(agent, now)}</Text>
            </Box>
          </Box>
          <Box flexDirection="column">
            <Text dimColor>{b ? b.label : `Context ${UNKNOWN}`}</Text>
            {bar(agent, Math.min(40, width - 4))}
          </Box>
          <Box borderStyle="round" borderColor="suggestion" paddingX={1} flexDirection="column">
            <Text dimColor>Prompt</Text>
            <Text wrap="wrap">{prompt.length > 1500 ? `${prompt.slice(0, 1500)}…` : prompt}</Text>
          </Box>
          {body.length > shown.length && <Text dimColor>{`${body.length - shown.length} earlier steps not shown`}</Text>}
          {shown.map(r => (
            <Box flexDirection="column">
              {r.text.trim() !== '' && <Text wrap="wrap">{r.text.trim()}</Text>}
              {r.toolUses.map(u => {
                const t = targetOf(u.tool, u.input ?? {})
                const what = t.path ? basename(t.path) : t.command ? t.command.replace(/\s+/g, ' ').slice(0, 60) : ''
                return (
                  <Text dimColor={!u.isError} color={u.isError ? 'error' : undefined}>
                    {`› ${u.tool}${what ? ` ${what}` : ''}${u.isError ? ' (failed)' : u.text === undefined ? ' …' : ''}`}
                  </Text>
                )
              })}
            </Box>
          ))}
          {note && <Text dimColor>{note}</Text>}
          {!isFinished(agent) && <Text dimColor>Working…</Text>}
        </Box>
      )
    }

    // ---------- Right Now ----------
    const hl = headline(await read($, calls), await read($, pending), await read($, turn), await read($, lastFile))
    const g = await read($, git)
    const mem = await read($, memory)
    const memLine = memoryLine(mem)
    const spin = memLine.isRunning ? `${SPINNER[(await read($, tick)) % SPINNER.length]} ` : ''
    const fileList = fileRows(await read($, files), g)
    const brain = isTerminal
      ? (() => {
          const r = rasterOf(brainPixels())
          return <Raster key="brain" columns={r.columns} rows={r.rows} cells={r.cells} />
        })()
      : <Svg source={brainSvg()} alt="Memory" width={18} height={12} />

    const rightNow = (
      <Box borderStyle="round" paddingX={1} flexDirection="column">
        <Text dimColor>Right now</Text>
        <Text bold color={hl.isWaiting ? 'warning' : undefined} wrap="wrap">
          {hl.title}
        </Text>
        {hl.detail && (
          <Box flexDirection="row" gap={1}>
            <Text wrap="wrap">{hl.detail}</Text>
            {hl.added !== undefined && <Text color="diffAdded">{`+${hl.added}`}</Text>}
            {hl.removed !== undefined && <Text color="diffRemoved">{`−${hl.removed}`}</Text>}
          </Box>
        )}
        <Text dimColor>{hl.sub}</Text>
        {g && (
          <Box flexDirection="row" gap={1}>
            <Text bold>{g.branch}</Text>
            {g.changed.length > 0 ? <Text color={DIRTY_COLOR}>{`${g.changed.length} changed`}</Text> : <Text dimColor>clean, nothing changed</Text>}
          </Box>
        )}
        <Box flexDirection="row" gap={1}>
          {brain}
          <Text color={memLine.isError ? 'error' : undefined}>{`${spin}${memLine.text}`}</Text>
        </Box>
        <Box flexDirection="row" gap={2} flexWrap="wrap">
          {(
            [
              [READ_COLOR, 'Claude read'],
              [EDIT_COLOR, 'Claude edited'],
              [DIRTY_COLOR, 'Not committed'],
            ] as const
          ).map(([color, label]) => (
            <Box flexDirection="row" gap={1}>
              <Text color={color}>■</Text>
              <Text dimColor>{label}</Text>
            </Box>
          ))}
        </Box>
        {fileList.rows.map(f => (
          <Box flexDirection="row" gap={1}>
            <Text color={f.kind === 'edit' ? EDIT_COLOR : READ_COLOR}>■</Text>
            <Text wrap="truncate-middle">{f.name}</Text>
            <Text dimColor wrap="truncate-start">{basename(dirname(f.path))}</Text>
            {f.isUncommitted && <Text color={DIRTY_COLOR}>●</Text>}
          </Box>
        ))}
        {fileList.more > 0 && <Text dimColor>{`+${fileList.more} more`}</Text>}
      </Box>
    )

    // ---------- summary cards ----------
    const groups = groupAgents(list, hidden)
    const sum = summaryOf(groups.visible, now)
    const card = (label: string, value: string) => (
      <Box borderStyle="round" paddingX={1} flexDirection="column" minWidth={10}>
        <Text dimColor>{label}</Text>
        <Text bold>{value}</Text>
      </Box>
    )
    const cards = (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {card('Cost', sum.cost)}
        {card('Tokens', sum.tokens)}
        {card('Time', sum.time)}
      </Box>
    )

    // ---------- sub-agents ----------
    const fold = await read($, collapsed)
    const isAllCollapsed = fold.running && fold.finished
    const setFold = async (want: { running: boolean; finished: boolean }) => {
      await update($, collapsed, () => want)
      await remember($, 'collapsed', want)
    }
    const row = (a: AgentsPanelAgent) => {
      const c = critterOf(a.id)
      return (
        <Box key={`row:${a.id}`} flexDirection="row" gap={1}>
          {critter(a)}
          <Box flexDirection="column" flexGrow={1}>
            <Box flexDirection="row" gap={1}>
              {mark(a)}
              <Button key={`open:${a.id}`} plain label={`Open ${a.description}, ${MARK[shownStatus(a)]!.word}`} onPress={async () => {
                await update($, view, () => a.id)
                await update($, stick, () => true)
                wantScroll = true
                await quiet(() => $.ui.scroll({ in: PANE, to: 'end' }))
              }}>
                <Text bold>{a.description}</Text>
              </Button>
              {isFinished(a) && (
                <Box display="none" hover={{ display: 'flex' }}>
                  <Button key={`clear:${a.id}`} plain label={`Clear ${a.description}`} onPress={() => update($, cleared, ids => [...ids, a.id])}>
                    X
                  </Button>
                </Box>
              )}
            </Box>
            <Text dimColor>{`${c.name} · ${a.type}`}</Text>
            {modelLine(a)}
            <Text dimColor>{agentMetrics(a, now)}</Text>
            {bar(a, 24)}
          </Box>
        </Box>
      )
    }
    const groupHeader = (key: 'running' | 'finished', label: string, n: number) => (
      <Button key={`group:${key}`} plain label={`${fold[key] ? 'Expand' : 'Collapse'} ${label.toLowerCase()} agents`} onPress={() => setFold({ ...fold, [key]: !fold[key] })}>
        {`${fold[key] ? '>' : 'v'} ${label} · ${n}`}
      </Button>
    )
    const subAgents = (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={2}>
          <Text bold>Sub-agents</Text>
          {list.length > 0 && (
            <Button key="toggle-all" plain label={isAllCollapsed ? 'Expand all groups' : 'Collapse all groups'} onPress={() => setFold({ running: !isAllCollapsed, finished: !isAllCollapsed })}>
              {isAllCollapsed ? 'Expand all' : 'Collapse all'}
            </Button>
          )}
          {groups.finished.length > 0 ? (
            <Button key="clear-finished" plain label="Clear finished agents" onPress={() => update($, cleared, ids => [...new Set([...ids, ...groups.finished.map(a => a.id)])])}>
              Clear finished
            </Button>
          ) : (
            <Text dimColor>Clear finished</Text>
          )}
        </Box>
        {list.length === 0 && <Text dimColor>No agents in this session yet.</Text>}
        {list.length > 0 && groups.visible.length === 0 && <Text dimColor>All agents cleared.</Text>}
        {groups.running.length > 0 && groupHeader('running', 'Running', groups.running.length)}
        {groups.running.length > 0 && !fold.running && groups.running.map(row)}
        {groups.finished.length > 0 && groupHeader('finished', 'Finished', groups.finished.length)}
        {groups.finished.length > 0 && !fold.finished && groups.finished.map(row)}
      </Box>
    )

    // ---------- Status ----------
    const isStatusOpen = await read($, statusOpen)
    const servers = mergeMcp(await read($, mcp), await read($, mcpFailed))
    const skillList = await read($, skills)
    const messages = (await read($, hookMessages)) ?? []
    const hasFailed = servers.some(s => s.state === 'failed')
    const tint = (state: string) =>
      state === 'failed' ? (dark ? '#3d1c1c' : '#fde4e4') : state === 'needs-auth' ? (dark ? '#3b3117' : '#fff3d6') : undefined
    const tileWidth = Math.min(24, Math.max(14, Math.floor((width - 2) / 3)))
    const status = (
      <Box flexDirection="column" gap={1}>
        <Button key="status" plain label={isStatusOpen ? 'Collapse status' : `Expand status${hasFailed ? ', a server failed' : ''}`} onPress={async () => {
          await update($, statusOpen, () => !isStatusOpen)
          await remember($, 'statusOpen', !isStatusOpen)
        }}>
          {!isStatusOpen && hasFailed ? ['> Status', <Text color="error"> ●</Text>] : `${isStatusOpen ? 'v' : '>'} Status`}
        </Button>
        {isStatusOpen && servers.length === 0 && skillList.length === 0 && messages.length === 0 && <Text dimColor>Nothing to report.</Text>}
        {isStatusOpen && servers.length > 0 && (
          <Box flexDirection="column">
            <Text bold>{mcpSummary(servers)}</Text>
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {mcpTiles(servers).map(t => (
                <Box key={`mcp:${t.key}`} borderStyle="round" borderColor={MCP_COLOR[t.state]} backgroundColor={tint(t.state)} paddingX={1} flexDirection="column" width={tileWidth}>
                  {t.prefix && <Text dimColor>{t.prefix}</Text>}
                  <Text bold wrap="truncate-end">{t.name}</Text>
                  <Text color={MCP_COLOR[t.state]}>{t.word}</Text>
                  {t.reason && (
                    <Box display="none" hover={{ display: 'flex' }}>
                      <Text dimColor wrap="wrap">{t.reason}</Text>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {isStatusOpen && skillList.length > 0 && (
          <Box flexDirection="column">
            <Text bold>{`Skills · ${skillList.length} loaded`}</Text>
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {skillTiles(skillList).map(t => (
                <Box key={`skill:${t.key}`} borderStyle="round" paddingX={1} flexDirection="column" width={tileWidth}>
                  {t.prefix && <Text dimColor wrap="truncate-end">{t.prefix}</Text>}
                  <Text bold wrap="truncate-end">{t.name}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {isStatusOpen && messages.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Session</Text>
            {messages.map(m => (
              <Box flexDirection="column">
                <Text dimColor>{m.origin}</Text>
                <Text wrap="wrap">{m.text}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )

    const isBandOn = await bandIsOn($, showBand)
    return (
      <Box flexDirection="column" gap={1}>
        {rightNow}
        {cards}
        {subAgents}
        {status}
        <Button key="band-toggle" label={`Band: ${isBandOn ? 'on' : 'off'}`} onPress={() => setBand($, showBand, !isBandOn)} />
      </Box>
    )
  })
}

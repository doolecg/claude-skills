import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { FdAgent } from '../types'
import {
  EMPTY_MAIN,
  EMPTY_USAGE,
  applyStep,
  effortWord,
  finish,
  isWorking,
  limitOf,
  newAgent,
  paletteFor,
  reconcile,
  statusFromReason,
  wantOpen,
} from './logic'
import { drawPane } from './pane'
import { SIDEBAR_COLUMNS, isSidebarTab, type SbStrip } from './sidebar-kit'

type Dollar = EngineInterface

const PANE = 'flightdeck'
const TITLE = 'Flightdeck'

const isOpenAtom = atom({ plugin: 'flightdeck', key: 'isOpen' } as const, false)
const mainAtom = atom({ plugin: 'flightdeck', key: 'main' } as const, EMPTY_MAIN)
const usageAtom = atom({ plugin: 'flightdeck', key: 'usage' } as const, EMPTY_USAGE)
const agentsAtom = atom({ plugin: 'flightdeck', key: 'agents' } as const, [])
const tickAtom = atom({ plugin: 'flightdeck', key: 'tick' } as const, 0)
const themeAtom = atom({ plugin: 'flightdeck', key: 'theme' } as const, 'dark')
const modesAtom = atom({ plugin: 'flightdeck', key: 'modes' } as const, {})

let ticker: Timer | undefined
let frames = 0

/** The Sidebar's strip; undefined when that mod is not installed. */
async function stripOf($: Dollar): Promise<SbStrip | undefined> {
  try {
    return (await $.state.get({ plugin: 'sidebar', key: 'strip' })).value
  } catch {
    return undefined
  }
}

/** A failure in the sidebar's own bookkeeping never reaches the session. */
async function quiet(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch {}
}

async function isLive($: Dollar): Promise<boolean> {
  if (!(await read($, isOpenAtom))) return false
  if ((await read($, mainAtom)).isRunning) return true
  return (await read($, agentsAtom)).some(isWorking)
}

/** The 250ms frame clock runs only while the sidebar is open and something in it moves. */
async function syncTicker($: Dollar): Promise<void> {
  const live = await isLive($)
  if (live && !ticker) {
    ticker = $.clock.every(250, () => {
      frames += 1
      void quiet(async () => {
        await update($, tickAtom, n => n + 1)
        if (frames % 8 === 0) await reconcileAgents($)
        if (!(await isLive($))) await syncTicker($)
      })
    })
  } else if (!live && ticker) {
    ticker.cancel()
    ticker = undefined
  }
}

async function changeAgents($: Dollar, fn: (list: FdAgent[]) => FdAgent[]): Promise<void> {
  await update($, agentsAtom, list => fn(list ?? []))
  await syncTicker($)
}

async function reconcileAgents($: Dollar): Promise<void> {
  const listed = await $.agent.list()
  const now = await $.clock.now()
  const was = await read($, agentsAtom)
  const next = reconcile(was, listed, now)
  if (next !== was) await changeAgents($, () => next)
}

async function refreshUsage($: Dollar): Promise<void> {
  const u = await $.session.usage()
  await update($, usageAtom, () => ({
    ctxPct: u.context.percent ?? null,
    ctxTokens: u.context.tokens ?? null,
    window: u.context.window,
    costUsd: u.cost?.usd ?? null,
    limits: u.rateLimits.map(limitOf),
  }))
}

async function readSettings($: Dollar): Promise<void> {
  const s = (await $.settings.read()) as Record<string, unknown>
  if (typeof s.theme === 'string' && s.theme !== (await read($, themeAtom))) await update($, themeAtom, () => s.theme as string)
  const model = (await read($, mainAtom)).model || (await $.session.model())
  const perModel = (s.modelSettings as Record<string, { effortLevel?: unknown }> | undefined)?.[model.replace(/\[[^\]]*\]$/, '')]
  const effort = effortWord(perModel?.effortLevel ?? s.effortLevel)
  if (effort && !(await read($, mainAtom)).effort) await update($, mainAtom, m => ({ ...m, effort }))
}

/** Tells the bottom bar (and any mod that reads it) whether the sidebar is open. */
const publishMode = ($: Dollar, isOn: boolean) => update($, modesAtom, () => ({ flightdeck: { label: 'Flightdeck', isOn } }))

async function setOpen($: Dollar, isOn: boolean): Promise<void> {
  if ((await read($, isOpenAtom)) !== isOn) await update($, isOpenAtom, () => isOn)
  await publishMode($, isOn)
  await quiet(() => $.store.set('isOpen', isOn))
  await syncTicker($)
}

const openPane = ($: Dollar) => $.ui.open({ id: PANE, title: TITLE, columns: SIDEBAR_COLUMNS })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({
      name: 'flightdeck',
      description: 'Open or close the Flightdeck sidebar: the main session and every subagent working now',
      argumentHint: '[open|close]',
    })
    await quiet(() => readSettings($))
    await quiet(() => refreshUsage($))
    await quiet(async () => {
      const model = await $.session.model()
      if (!(await read($, mainAtom)).model) await update($, mainAtom, m => ({ ...m, model }))
    })
    await quiet(() => reconcileAgents($))
    // A reload finds its pane still up; a new session reopens it if it was left open.
    let isOpen = false
    await quiet(async () => {
      isOpen = (await $.ui.panes()).some(p => p.id === PANE)
      if (!isOpen && (await $.store.get('isOpen')) === true) {
        await openPane($)
        isOpen = true
      }
    })
    await update($, isOpenAtom, () => isOpen)
    await publishMode($, isOpen)
    await syncTicker($)
    return ran
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await quiet(async () => {
        await changeAgents($, () => [])
        await update($, mainAtom, m => ({ ...EMPTY_MAIN, model: m.model, effort: m.effort }))
      })
    }
    return next(e)
  })

  on('command.run', { command: 'flightdeck' }, async ($, e) => {
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (!wantOpen(e.args, isOpen)) {
      await $.ui.close({ id: PANE })
      await setOpen($, false)
      return { text: 'Flightdeck closed.' }
    }
    const opened = await openPane($)
    await setOpen($, true)
    await quiet(() => refreshUsage($))
    await quiet(() => reconcileAgents($))
    return { text: opened.isPlaced ? 'Flightdeck opened.' : `Flightdeck opened; it shows once there is room: ${opened.reason}` }
  })

  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (e.command === 'theme' || e.command === 'config') await quiet(() => readSettings($))
    return ran
  }).catch(($, e, next) => next(e))

  // The person's close mark or key, or an unload: the mode reads off.
  on('ui.close', async ($, e, next) => {
    const ran = await next(e)
    if (e.id === PANE && e.origin.kind !== 'unload') {
      await quiet(() => setOpen($, false))
      if (e.origin.kind === 'person') {
        const strip = await stripOf($)
        if (strip && isSidebarTab(strip, PANE)) await quiet(() => $.command.run({ command: 'sidebar', args: `closed ${PANE}` }))
      }
    }
    return ran
  })

  on('turn.start', async ($, e, next) => {
    await quiet(async () => {
      const now = await $.clock.now()
      await update($, mainAtom, m => ({ ...m, isRunning: true, turnStartedAt: now, turnEndedAt: 0 }))
      await syncTicker($)
    })
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id === undefined) {
      await quiet(() =>
        update($, mainAtom, m => ({ ...m, model: e.model || m.model, effort: effortWord(e.effort) || m.effort, steps: m.steps + 1 })),
      )
      return yield* next(e)
    }
    const result = yield* next(e)
    // Ids no agent has (a workflow's agents, compaction and memory forks) are left out.
    await quiet(() =>
      changeAgents($, list => (list.some(a => a.id === id) ? list.map(a => (a.id === id ? applyStep(a, { model: e.model, usage: result.usage }) : a)) : list)),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await quiet(async () => {
      const now = await $.clock.now()
      const id = e.agentId
      if (id !== undefined) {
        await changeAgents($, list => list.map(a => (a.id === id ? finish(a, statusFromReason(e.reason), now) : a)))
        return
      }
      await update($, mainAtom, m => ({ ...m, isRunning: false, turnEndedAt: now }))
      await refreshUsage($)
      await syncTicker($)
    })
    return done
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const id = started.agentId
    if (id) {
      await quiet(async () => {
        const at = await $.clock.now()
        const agent = newAgent(id, at, {
          description: e.description,
          type: e.name ?? e.subagentType,
          model: started.model ?? '',
        })
        await changeAgents($, list => [...list.filter(a => a.id !== id), agent].slice(-40))
      })
    }
    return started
  })

  on('session.measure', async ($, e, next) => {
    await quiet(() =>
      update($, usageAtom, () => ({
        ctxPct: e.context.percent ?? null,
        ctxTokens: e.context.tokens ?? null,
        window: e.context.window,
        costUsd: e.cost?.usd ?? null,
        limits: e.rateLimits.map(limitOf),
      })),
    )
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e) as unknown as Record<string, any>
    const theme = await read($, themeAtom)
    const strip = await stripOf($)
    return drawPane(els, e.surface, {
      pal: paletteFor(theme),
      theme,
      strip: isSidebarTab(strip, PANE) ? strip : undefined,
      run: c => $.command.run(c),
      main: await read($, mainAtom),
      usage: await read($, usageAtom),
      agents: await read($, agentsAtom),
      tick: await read($, tickAtom),
      now: await $.clock.now(),
      columns: e.props.bodyColumns,
    })
  })
}

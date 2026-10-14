import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, StateWrite, Timer } from 'claude-code'

import type { SbJob, SbMode } from '../types'
import { CATALOG, SETTINGS_PREFIX, SIDEBAR_TAB, entryOf, installedFrom, jobOf, modesOf, move, orderedIds, parseArg, pickTab, tabsFor } from './logic'
import { EMPTY_STRIP, SIDEBAR_COLUMNS, sbActions, sbFrame, sbKit, sbPalette, type SbSetting } from './sidebar-kit'
import { viewRows } from './tabs'

type Dollar = EngineInterface

const PANE = 'sidebar'
const TITLE = 'Sidebar'

const stripAtom = atom({ plugin: 'sidebar', key: 'strip' } as const, EMPTY_STRIP)
const viewAtom = atom({ plugin: 'sidebar', key: 'view' } as const, SIDEBAR_TAB)
const tickAtom = atom({ plugin: 'sidebar', key: 'tick' } as const, 0)
const settingsAtom = atom({ plugin: 'sidebar', key: 'settings' } as const, [])
const modModesAtom = atom({ plugin: 'sidebar', key: 'modModes' } as const, {})
const modesAtom = atom({ plugin: 'sidebar', key: 'modes' } as const, {})
const badgesAtom = atom({ plugin: 'sidebar', key: 'badges' } as const, {})
const jobAtom = atom({ plugin: 'sidebar', key: 'job' } as const, null)
const enhanceAtom = atom({ plugin: 'sidebar', key: 'enhance' } as const, null)
const hiddenAtom = atom({ plugin: 'sidebar', key: 'hidden' } as const, [])
const orderAtom = atom({ plugin: 'sidebar', key: 'order' } as const, [])
const installedAtom = atom({ plugin: 'sidebar', key: 'installed' } as const, [])

/** The commands each mod registers, so a mod loaded with --plugin-dir counts as installed too. */
const COMMAND_OF: Record<string, string> = {
  flightdeck: 'flightdeck',
  'self-improve': 'learn',
  'idea-shelf': 'ideas',
  'folder-tracker': 'folders',
  'clean-view': 'simple',
}

let ticker: Timer | undefined
/** The mod commands the sidebar ran for a tab switch: their replies stay out of the transcript. */
const quietRuns = new Set<string>()
let runs: Promise<void> = Promise.resolve()

async function quiet(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch {}
}

/** Rebuilds the strip every tab draws from: the tabs, their badges, the open one, the look. */
async function syncStrip($: Dollar, patch: { isOn?: boolean; active?: string } = {}): Promise<void> {
  const tabs = tabsFor(await read($, installedAtom), await read($, orderAtom), await read($, hiddenAtom), await read($, badgesAtom))
  await update($, stripAtom, s => ({ ...(s ?? EMPTY_STRIP), ...patch, tabs }))
  // Tells the bottom bar (and any mod that reads it) whether the sidebar is open.
  const isOn = (await read($, stripAtom)).isOn
  if ((await read($, modesAtom)).sidebar?.isOn !== isOn) await update($, modesAtom, () => ({ sidebar: { label: 'Sidebar', isOn } }))
}

/** The 250ms frame clock runs while the sidebar's own pane shows a moving Clean View job. */
async function syncTicker($: Dollar): Promise<void> {
  const strip = await read($, stripAtom)
  const job = await read($, jobAtom)
  const moving = strip.isOn && (await read($, viewAtom)) === 'clean-view' && job !== null && job.phase !== 'done'
  if (moving && !ticker) ticker = $.clock.every(250, () => void quiet(() => update($, tickAtom, n => n + 1)))
  else if (!moving && ticker) {
    ticker.cancel()
    ticker = undefined
  }
}

async function loadSettings($: Dollar): Promise<void> {
  const rows = await $.config.list()
  const list: SbSetting[] = []
  for (const r of rows) {
    if (!r.key.includes('.') || r.provider.plugin === 'engine') continue
    if (r.kind !== 'boolean' && r.kind !== 'choice' && r.kind !== 'text' && r.kind !== 'number') continue
    const value = typeof r.value === 'boolean' || typeof r.value === 'number' ? r.value : String(r.value ?? '')
    list.push({ key: r.key, label: r.label, description: r.description ?? '', kind: r.kind, value, options: [...(r.options ?? [])], isLocked: r.isLocked })
  }
  await update($, settingsAtom, () => list)
}

async function loadLook($: Dollar): Promise<void> {
  const s = (await $.settings.read()) as Record<string, unknown>
  const theme = typeof s.theme === 'string' ? s.theme : 'dark'
  const colourRow = (await read($, settingsAtom)).find(r => r.key === 'bottom-bar.colour')
  const colour = typeof colourRow?.value === 'string' ? colourRow.value : 'Coral'
  const strip = await read($, stripAtom)
  if (strip.theme !== theme || strip.colour !== colour) await update($, stripAtom, st => ({ ...st, theme, colour }))
}

/** The installed mods: `claude plugin list`, plus any whose commands or options are loaded here. */
async function loadInstalled($: Dollar): Promise<void> {
  const found = new Set<string>()
  await quiet(async () => {
    for (const c of await $.command.list()) {
      for (const [id, command] of Object.entries(COMMAND_OF)) if (c.name === command) found.add(id)
      if (c.plugin) found.add(c.plugin)
    }
  })
  await quiet(async () => {
    for (const r of await $.config.list()) if (r.provider.plugin) found.add(r.provider.plugin)
  })
  // What is loaded here shows at once; `claude plugin list` takes a few seconds and adds the rest.
  const known = (await read($, installedAtom)).filter(id => found.has(id) || CATALOG.some(c => c.id === id))
  await update($, installedAtom, () => CATALOG.map(c => c.id).filter(id => found.has(id) || known.includes(id)))
  await syncStrip($)
  await quiet(async () => {
    const ran = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 30000 })
    if (ran.exitCode === 0) for (const id of installedFrom(JSON.parse(ran.stdout))) found.add(id)
  })
  const ids = CATALOG.map(c => c.id).filter(id => found.has(id))
  await update($, installedAtom, () => ids)
  await syncStrip($)
}

const openOwnPane = ($: Dollar) => $.ui.open({ id: PANE, title: TITLE, columns: SIDEBAR_COLUMNS })

async function closeOwnPane($: Dollar): Promise<void> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.close({ id: PANE })
}

/**
 * Runs another mod's open or close command. A `command.run` hook may not wait on `$.command.run`
 * (the turn is waiting on it), so it runs from a timer, after the hook has answered. A mod that is
 * gone or refuses leaves the sidebar as it was, and `onFail` hears of it.
 */
function runMod($: Dollar, command: string, then: { onOk?: () => Promise<void>; onFail?: () => Promise<void> } = {}): void {
  const [name = '', ...rest] = command.split(' ')
  quietRuns.add(command)
  // One at a time: a command run while another is still running is refused.
  $.clock.after(0, () => {
    runs = runs.then(async () => {
      try {
        await $.command.run({ command: name, args: rest.join(' ') })
      } catch {
        await quiet(async () => then.onFail?.())
        return
      }
      await quiet(async () => then.onOk?.())
    })
  })
}

/** Shows tab `id`: its mod's own pane, or the sidebar's pane on the right view; the tab before it goes. */
async function showTab($: Dollar, id: string): Promise<void> {
  const before = await read($, stripAtom)
  const was = before.isOn ? before.active : ''
  const wasEntry = entryOf(was.startsWith(SETTINGS_PREFIX) ? '' : was)
  const entry = id === SIDEBAR_TAB || id.startsWith(SETTINGS_PREFIX) ? undefined : entryOf(id)

  await syncStrip($, { isOn: true, active: id.startsWith(SETTINGS_PREFIX) ? id.slice(SETTINGS_PREFIX.length) : id })
  await quiet(() => $.store.set('active', id))
  await quiet(() => $.store.set('isOn', true))

  if (entry?.pane) {
    // The mod draws this tab itself: open its pane, then take the sidebar's own away. A mod that
    // will not open leaves its settings page in the sidebar's pane instead.
    runMod($, entry.pane.open, {
      onOk: () => closeOwnPane($),
      onFail: async () => {
        await update($, viewAtom, () => `${SETTINGS_PREFIX}${id}`)
        await openOwnPane($)
        await syncTicker($)
      },
    })
  } else {
    await update($, viewAtom, () => id)
    await quiet(() => openOwnPane($))
  }
  if (wasEntry?.pane && wasEntry.id !== id) runMod($, wasEntry.pane.close)
  await syncTicker($)
}

async function closeAll($: Dollar): Promise<void> {
  const strip = await read($, stripAtom)
  const entry = entryOf(strip.active)
  await syncStrip($, { isOn: false })
  await quiet(() => $.store.set('isOn', false))
  await quiet(() => closeOwnPane($))
  if (entry?.pane) runMod($, entry.pane.close)
  await syncTicker($)
}

async function openSidebar($: Dollar): Promise<void> {
  await quiet(() => $.store.set('isOn', true))
  const strip = await read($, stripAtom)
  const saved = await $.store.get('active').catch(() => undefined)
  await showTab($, pickTab(typeof saved === 'string' ? saved : strip.active, strip.tabs))
}

async function setOption($: Dollar, s: SbSetting, value: string | number | boolean): Promise<void> {
  const set = await $.config.set({ key: s.key, value })
  if (set.deny !== undefined) $.ui.toast(`Could not change ${s.label}: ${set.deny}`)
  await loadSettings($)
  if (s.key === 'bottom-bar.colour') await loadLook($)
}

async function setLayout($: Dollar, hidden: string[], order: string[]): Promise<void> {
  await update($, hiddenAtom, () => hidden)
  await update($, orderAtom, () => order)
  await quiet(() => $.store.set('hidden', hidden))
  await quiet(() => $.store.set('order', order))
  await syncStrip($)
}

/** Another mod's write of a key the sidebar follows; read untyped, as the contract does not declare it. */
const writeOf = (e: unknown) => e as unknown as StateWrite

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({
      name: 'sidebar',
      description: 'Open or close the Sidebar: one tab per mod, each with its settings',
      argumentHint: '[open|close|<mod>]',
    })
    await quiet(async () => {
      const hidden = await $.store.get('hidden')
      const order = await $.store.get('order')
      if (Array.isArray(hidden)) await update($, hiddenAtom, () => hidden.filter((x): x is string => typeof x === 'string'))
      if (Array.isArray(order)) await update($, orderAtom, () => order.filter((x): x is string => typeof x === 'string'))
    })
    await quiet(() => loadSettings($))
    await quiet(() => loadLook($))
    await quiet(async () => {
      const job = jobOf((await $.state.get({ plugin: 'clean-view', key: 'checklist' })).value)
      await update($, jobAtom, () => job)
    })
    await quiet(async () => {
      const last = (await $.state.get({ plugin: 'prompt-enhancer', key: 'lastRun' })).value
      if (last) await update($, enhanceAtom, () => ({ counts: String(last.counts ?? ''), ok: last.ok === true }))
    })
    await syncStrip($)
    // The mod list takes a moment (`claude plugin list`); the sidebar reopens once it is in.
    void (async () => {
      await loadInstalled($)
      if ((await $.store.get('isOn').catch(() => false)) === true) await openSidebar($)
    })().catch(() => {})
    return ran
  })

  on('command.run', { command: 'sidebar' }, async ($, e) => {
    const arg = parseArg(e.args)
    const strip = await read($, stripAtom)
    if (arg.kind === 'close' || (arg.kind === 'flip' && strip.isOn)) {
      await closeAll($)
      return { text: 'Sidebar closed.' }
    }
    if (arg.kind === 'closed') {
      // A mod's own pane was closed by the person: the sidebar reads off with it.
      if (strip.isOn && strip.active === arg.id) {
        await syncStrip($, { isOn: false })
        await quiet(() => $.store.set('isOn', false))
        await syncTicker($)
      }
      return {}
    }
    if (arg.kind === 'tab') {
      if (arg.id === SIDEBAR_TAB) await loadInstalled($)
      await quiet(() => loadSettings($))
      await showTab($, arg.id)
      return {}
    }
    if (arg.kind === 'settings') {
      await quiet(() => loadSettings($))
      await syncStrip($, { isOn: true, active: arg.id })
      await update($, viewAtom, () => `${SETTINGS_PREFIX}${arg.id}`)
      await quiet(() => openOwnPane($))
      const entry = entryOf(arg.id)
      if (entry?.pane) runMod($, entry.pane.close)
      await syncTicker($)
      return {}
    }
    await openSidebar($)
    return { text: 'Sidebar opened.' }
  })

  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (e.command === 'theme' || e.command === 'config') await quiet(() => loadLook($))
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.close', async ($, e, next) => {
    const ran = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') {
      await quiet(async () => {
        await syncStrip($, { isOn: false })
        await $.store.set('isOn', false)
        await syncTicker($)
      })
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Other mods' on/off modes, their tab badges, Clean View's job and Prompt Enhancer's last run, followed live.
  on('state.set', { key: 'modes' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = writeOf(e)
    if (w.plugin !== 'sidebar') await quiet(() => update($, modModesAtom, all => ({ ...(all ?? {}), [w.plugin]: modesOf(w.value) })))
    return ran
  }).catch(($, e, next) => next(e))

  on('state.set', { key: 'sidebarBadge' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = writeOf(e)
    if (typeof w.value === 'number') {
      await quiet(async () => {
        await update($, badgesAtom, all => ({ ...(all ?? {}), [w.plugin]: w.value as number }))
        await syncStrip($)
      })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('state.set', { key: 'checklist' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = writeOf(e)
    if (w.plugin === 'clean-view') {
      await quiet(async () => {
        await update($, jobAtom, () => jobOf(w.value))
        await syncTicker($)
      })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('state.set', { key: 'lastRun' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = writeOf(e)
    const v = w.value as { counts?: unknown; ok?: unknown } | null
    if (w.plugin === 'prompt-enhancer' && v) await quiet(() => update($, enhanceAtom, () => ({ counts: String(v.counts ?? ''), ok: v.ok === true })))
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (!quietRuns.has(`${e.props.command} ${e.props.args}`.trim())) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e) as unknown as Record<string, any>
    const strip = await read($, stripAtom)
    const view = await read($, viewAtom)
    const k = sbKit(els, e.surface, sbPalette(strip.theme, strip.colour), e.props.bodyColumns, await read($, tickAtom))
    const installed = await read($, installedAtom)
    const run = (c: { command: string; args: string }) => $.command.run(c)
    const body = viewRows(k, {
      view,
      settings: await read($, settingsAtom),
      modes: (await read($, modModesAtom)) as Record<string, Record<string, SbMode>>,
      job: (await read($, jobAtom)) as SbJob | null,
      enhance: await read($, enhanceAtom),
      all: orderedIds(installed, await read($, orderAtom)),
      hidden: await read($, hiddenAtom),
      tabs: strip.tabs,
      now: await $.clock.now(),
      setOption: (s, value) => void setOption($, s, value).catch(() => {}),
      flipMode: command => void run({ command, args: '' }).catch(() => {}),
      openTab: id => void run({ command: 'sidebar', args: `tab ${id}` }).catch(() => {}),
      setHidden: (id, isHidden) =>
        void (async () => {
          const hidden = await read($, hiddenAtom)
          await setLayout($, isHidden ? [...hidden.filter(h => h !== id), id] : hidden.filter(h => h !== id), await read($, orderAtom))
        })().catch(() => {}),
      moveTab: (id, by) =>
        void (async () => {
          const order = move(orderedIds(await read($, installedAtom), await read($, orderAtom)), id, by)
          await setLayout($, await read($, hiddenAtom), order)
        })().catch(() => {}),
    })
    return sbFrame(k, strip, sbActions(run), body)
  })
}

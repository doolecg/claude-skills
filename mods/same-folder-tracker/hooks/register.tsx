import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TrackerPhase, TrackerView } from '../types'
import {
  ENTRY_PREFIX,
  PRUNE_MS,
  addPath,
  bandLines,
  claimToast,
  editedPath,
  entryKey,
  folderKey,
  folderPrefix,
  liveOthers,
  parseEntry,
  resolvePath,
  toView,
  toastText,
} from './logic'
import type { Entry } from './logic'

type Api = EngineInterface

const others = atom({ plugin: 'same-folder-tracker', key: 'others' } as const, [] as TrackerView[])

const REFRESH_MS = 20_000
const TOUCH_MS = 60_000
// A turn can run longer than the 30-minute drop-out, so a busy session refreshes its entry now and then.
const BUSY_REFRESH_MS = 5 * 60_000

// How sessions share state: the plugin store ($.store) is one JSON file under
// ~/.claude/plugins/store/, and I checked that a get in one process sees another
// process's set, and that three processes writing different keys at once all
// land. So no separate files are needed. The rule that keeps it safe: a session
// writes only its own key ("s|<folder>|<session id>") and reads the rest, so a
// lost write can only cost a session's own entry, which its next event writes again.
type State = {
  sid: string
  cwd: string
  folder: string
  key: string
  phase: TrackerPhase
  files: string[]
  updatedAt: number
  lastWrite: number
}

const fresh = (): State => ({ sid: '', cwd: '', folder: '', key: '', phase: 'idle', files: [], updatedAt: 0, lastWrite: 0 })

// Module variables are lost on a hot reload; identity() reloads this session's entry from the store.
let S = fresh()
let queue: Promise<unknown> = Promise.resolve()
let timerStarted = false
const warned = new Set<string>()

async function safely($: Api, what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    try {
      $.ui.log(`same-folder-tracker: ${what} failed: ${String(error)}`, { to: 'debug' })
    } catch {
      // nothing more to do
    }
  }
}

async function identity($: Api): Promise<void> {
  const sid = await $.session.id()
  const cwd = await $.session.cwd()
  if (sid !== S.sid) {
    S = fresh()
    S.sid = sid
    warned.clear()
    const old = parseEntry(await $.store.get(entryKey(folderKey(cwd), sid)))
    if (old !== null && old.phase !== 'done') {
      S.phase = old.phase
      S.files = old.files
      S.updatedAt = old.updatedAt
      S.key = entryKey(old.folder, sid)
    }
  }
  S.cwd = cwd
  S.folder = folderKey(cwd)
}

async function writeNow($: Api): Promise<void> {
  const now = await $.clock.now()
  const key = entryKey(S.folder, S.sid)
  const previous = S.key
  const entry: Entry = { sid: S.sid, folder: S.folder, phase: S.phase, updatedAt: now, files: S.files }
  S.updatedAt = now
  S.lastWrite = now
  S.key = key
  await $.store.set(key, entry)
  // The folder changed under the same session (/cd): drop the entry under the old folder.
  if (previous !== '' && previous !== key) await $.store.delete(previous)
}

// Writes run one at a time so an older snapshot never lands after a newer one.
function persist($: Api): Promise<unknown> {
  queue = queue.then(() => writeNow($)).catch(() => undefined)
  return queue
}

async function refresh($: Api): Promise<Entry[]> {
  const now = await $.clock.now()
  const prefix = folderPrefix(S.folder)
  const entries: Entry[] = []
  for (const key of await $.store.keys()) {
    if (!key.startsWith(prefix)) continue
    const entry = parseEntry(await $.store.get(key))
    if (entry !== null) entries.push(entry)
  }
  const live = liveOthers(entries, S.sid, S.folder, now)
  const views = live.map(toView)
  const shown = await read($, others)
  if (JSON.stringify(shown) !== JSON.stringify(views)) await update($, others, () => views)
  return live
}

async function prune($: Api): Promise<void> {
  const now = await $.clock.now()
  for (const key of await $.store.keys()) {
    if (!key.startsWith(ENTRY_PREFIX) || key === S.key) continue
    const entry = parseEntry(await $.store.get(key))
    if (entry === null || now - entry.updatedAt > PRUNE_MS) await $.store.delete(key)
  }
}

async function setPhase($: Api, phase: TrackerPhase): Promise<void> {
  await identity($)
  if (S.phase === phase && phase !== 'done') return
  S.phase = phase
  await persist($)
  if (phase !== 'done') await refresh($)
}

async function resumeIfWaiting($: Api): Promise<void> {
  if (S.phase === 'waiting') await safely($, 'resume', () => setPhase($, 'working'))
}

async function tick($: Api): Promise<void> {
  await identity($)
  const now = await $.clock.now()
  const isBusy = S.phase === 'working' || S.phase === 'waiting'
  if (S.updatedAt === 0 || (isBusy && now - S.lastWrite > BUSY_REFRESH_MS)) await persist($)
  await refresh($)
}

// Once per loaded copy of the module: a config change or hot reload starts a fresh one without a session.start.
function ensureStarted($: Api): void {
  if (timerStarted) return
  timerStarted = true
  $.clock.every(REFRESH_MS, () => {
    void safely($, 'refresh', () => tick($))
  })
  void safely($, 'command', () =>
    $.command.register({
      name: 'folder-tracker',
      description: 'Show or hide the line about other sessions in this folder',
      argumentHint: 'band on|off',
      immediate: true,
    }),
  )
}

// The band starts hidden. The showBand setting holds the choice; if the engine
// will not let this plugin set its own field, the choice is kept in the store instead.
let bandChoice: boolean | undefined

async function isBandOn($: Api, setting: unknown): Promise<boolean> {
  if (bandChoice !== undefined) return bandChoice
  const stored = await $.store.get('showBand')
  return typeof stored === 'boolean' ? stored : setting === true
}

async function setBand($: Api, value: boolean): Promise<void> {
  bandChoice = value
  try {
    const set = await $.config.set({ key: 'same-folder-tracker.showBand', value })
    if (set.deny === undefined) {
      await $.store.delete('showBand')
      return
    }
  } catch {
    // fall through to the store
  }
  await $.store.set('showBand', value)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await safely($, 'start', async () => {
      await identity($)
      S.phase = 'idle'
      await persist($)
      await prune($)
      await refresh($)
    })
    ensureStarted($)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await safely($, 'end', async () => {
      await identity($)
      S.phase = 'done'
      await persist($)
    })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await safely($, 'turn start', async () => {
      ensureStarted($)
      await setPhase($, 'working')
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await safely($, 'turn end', () => setPhase($, 'idle'))
    return next(e)
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    await safely($, 'permission', () => setPhase($, 'waiting'))
    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt') await safely($, 'permission', () => setPhase($, 'waiting'))
    return next(e)
  })

  on('classic.PostToolUse', async ($, e, next) => {
    await resumeIfWaiting($)
    return next(e)
  })

  on('classic.PostToolUseFailure', async ($, e, next) => {
    await resumeIfWaiting($)
    return next(e)
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    await resumeIfWaiting($)
    return next(e)
  })

  // Observes Edit, Write and NotebookEdit and passes every call on unchanged and unblocked.
  on('tool.call', async ($, e, next) => {
    const target: { path: string | null } = { path: null }
    await safely($, 'before tool', async () => {
      ensureStarted($)
      await identity($)
      const raw = editedPath(String(e.tool), e as unknown as { file_path?: unknown; notebook_path?: unknown })
      if (raw === null) return
      const path = resolvePath(raw, S.cwd)
      target.path = path
      const live = await refresh($)
      if (claimToast(warned, live, path)) $.ui.toast(toastText(path))
    })

    const ran = await next(e)

    await safely($, 'after tool', async () => {
      const result = ran as { deny?: unknown; isError?: boolean }
      const edited = result.deny === undefined && result.isError !== true ? target.path : null
      const now = await $.clock.now()
      // A finished tool call means the session is working again (a permission was answered).
      const phase: TrackerPhase = S.phase === 'done' ? 'done' : 'working'
      const phaseChanged = S.phase !== phase
      if (edited !== null) S.files = addPath(S.files, edited)
      S.phase = phase
      if (edited !== null || phaseChanged || now - S.lastWrite > TOUCH_MS) {
        await persist($)
        await refresh($)
      }
    })

    return ran
  })

  on('command.run', { command: 'folder-tracker' }, async ($, e) => {
    const match = /^band\s+(on|off)\s*$/i.exec(e.args.trim())
    if (match === null) {
      const isOn = await isBandOn($, options.showBand)
      return { text: `The line above the prompt is ${isOn ? 'on' : 'off'}. Type /folder-tracker band on or /folder-tracker band off to change it.` }
    }
    const value = match[1]?.toLowerCase() === 'on'
    await setBand($, value)
    return { text: value ? 'The line above the prompt is on.' : 'The line above the prompt is off. Toasts still warn about shared files.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    ensureStarted($)
    if (e.props.hasSurvey) return below
    if (!(await isBandOn($, options.showBand))) return below
    const lines = bandLines(await read($, others))
    if (lines.length === 0) return below
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Box flexDirection="column">
            {lines.map(line => (
              <Text>{line}</Text>
            ))}
          </Box>
          <Button key="band-off" label="Off" onPress={() => setBand($, false)} />
        </Box>
        {below}
      </Box>
    )
  })
}

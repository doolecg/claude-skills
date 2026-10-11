import { mock } from 'claude-code/testing'
import type { On, RenderElement, RenderInput, RenderNode, SessionStartInput } from 'claude-code'

export const PLUGIN = 'same-folder-tracker'
export const T0 = 1_800_000_000_000
export const MIN = 60_000

export const SESSION: SessionStartInput = { surface: 'terminal', isInteractive: true, cwd: 'F:\\Proj' }

export const bandFor = <S extends 'terminal' | 'desktop'>(surface: S): RenderInput<'AbovePrompt', S> =>
  ({
    component: 'AbovePrompt',
    surface,
    requestId: 'band',
    viewport: { columns: 160, rows: 40, isFullscreen: true },
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 19 }, view: {} },
  }) as RenderInput<'AbovePrompt', S>

/** Another session's stored entry, as that session would have written it. */
export function other(sid: string, over: Record<string, unknown> = {}, folder = 'f:/proj') {
  return [`s|${folder}|${sid}`, { sid, folder, phase: 'working', updatedAt: T0, files: [], ...over }] as const
}

export type World = {
  toasts: string[]
  clock: ReturnType<typeof mock.clock>
  toolCalls: unknown[]
  /** What the plugin store holds, readable and writable by the test. */
  store: Map<string, unknown>
  commands: string[]
  configSets: { key: string; value: unknown }[]
}

/** The engine beneath the plugin: this session's id and folder, a store and clock in memory, and a record of toasts. */
export function worldOf(
  on: On,
  options: {
    sid?: string
    cwd?: string
    entries?: Record<string, unknown>
    /** What a tool call beneath the plugin answers. */
    answer?: (e: { tool: string }) => unknown
    /** What another mod's band draws below this one. */
    below?: string
    /** The engine refuses the plugin's own config change. */
    denyConfig?: boolean
  } = {},
): World {
  const world: World = {
    toasts: [],
    clock: mock.clock(on, { now: T0 }),
    toolCalls: [],
    store: new Map(Object.entries(options.entries ?? {})),
    commands: [],
    configSets: [],
  }

  on('command.register', (_$, e) => {
    world.commands.push(e.name)
    return { value: { command: e.name } } as never
  })
  on('config.set', (_$, e) => {
    world.configSets.push({ key: e.key, value: e.value })
    return (options.denyConfig ? { deny: 'not allowed' } : { value: e.value }) as never
  })

  on('store.get', (_$, e) => ({ value: world.store.get(e.key) }))
  on('store.set', (_$, e) => {
    world.store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    world.store.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...world.store.keys()] }))
  on('session.id', () => ({ value: options.sid ?? 'me' }))
  on('session.cwd', () => ({ value: options.cwd ?? SESSION.cwd }))
  on('ui.toast', (_$, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', () => ({ type: 'Text', children: [options.below ?? ''] }) as never)
  on('tool.call', (_$, e) => {
    world.toolCalls.push(e)
    return (options.answer?.(e) ?? { result: 'ok', text: 'ok' }) as never
  })
  on('classic.PermissionRequest', () => ({}))
  on('classic.Notification', () => ({}))
  on('classic.PostToolUse', () => ({}))
  on('classic.PostToolUseFailure', () => ({}))
  on('classic.PermissionDenied', () => ({}))
  return world
}

export function stringsOf(node: RenderNode | RenderElement | null | undefined): string[] {
  if (node === null || node === undefined) return []
  if (typeof node === 'string') return [node]
  const children = (node as { children?: readonly RenderNode[] }).children ?? []
  return children.flatMap(child => stringsOf(child))
}

export const textOf = (node: RenderNode | RenderElement | null | undefined): string[] =>
  stringsOf(node).filter(s => s !== '')

export const command = (args: string) => ({
  command: 'folder-tracker',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 160 },
})

export const SHOWN = { options: { showBand: true } }

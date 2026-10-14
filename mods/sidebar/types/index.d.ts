/** One tab in the strip. `id` is the mod's plugin name. */
export type SbTab = { id: string; icon: string; name: string; badge: number }

/** What every mod's tab pane reads to draw the strip: the tabs, the open one, and whether the sidebar is up. */
export type SbStrip = { isOn: boolean; active: string; tabs: SbTab[]; theme: string; colour: string }

/** A step of Clean View's checklist, as the Clean View tab mirrors it. */
export type SbStep = { id: string; name: string; status: string; percent: number; hasReported: boolean }

/** Clean View's current job, as its `checklist` state holds it (the fields the tab draws). */
export type SbJob = { title: string; phase: string; tasks: SbStep[]; startedAt: number; finishedAt: number }

/** An on/off mode another mod publishes in its `modes` state, keyed by the command that flips it. */
export type SbMode = { label: string; isOn: boolean }

declare module 'claude-code' {
  interface PluginState {
    /** Read only: the job Clean View shows, and Prompt Enhancer's last run. */
    'clean-view': { checklist: unknown }
    'prompt-enhancer': { lastRun: { counts: string; ok: boolean } | null }
    sidebar: {
      strip: SbStrip
      /** What the sidebar's own pane shows: a mod's id, `sidebar` for its own settings, or `settings:<id>`. */
      view: string
      tick: number
      /** Every mod's options, from `$.config.list()`. */
      settings: {
        key: string
        label: string
        description: string
        kind: 'boolean' | 'choice' | 'text' | 'number'
        value: string | number | boolean
        options: string[]
        isLocked: boolean
      }[]
      /** Other mods' published modes, keyed by plugin, then by command. */
      modModes: Record<string, Record<string, SbMode>>
      /** The sidebar's own on/off mode, as the bottom bar reads it, keyed by its command. */
      modes: Record<string, SbMode>
      /** Other mods' published badges (a count on their tab icon), keyed by plugin. */
      badges: Record<string, number>
      job: SbJob | null
      /** Prompt Enhancer's last run: what each source gave, and whether a rewrite came back. */
      enhance: { counts: string; ok: boolean } | null
      /** Tab ids the person hid, and the order they put the tabs in. */
      hidden: string[]
      order: string[]
      /** The mods installed and enabled here, by plugin name. */
      installed: string[]
    }
  }
}

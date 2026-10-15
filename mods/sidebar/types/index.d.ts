/** One tab in the strip. `id` is the mod's plugin name. */
export type SbTab = { id: string; icon: string; name: string; label?: string; badge: number; isOff?: boolean }

/** The Context mod's `footer`, drawn at the bottom of every tab. */
export type SbFooter = {
  hindsight: 'up' | 'down' | 'off' | 'checking'
  codegraph: 'indexed' | 'none'
  git: { branch: string; changed: number; ahead: number; behind: number } | null
  passes: { count: number; limit: number; editedSince: boolean; extra: string[] }
}

/** A tool call Rule Guard stopped. */
export type SbBlock = { at: number; rule: string; label: string; what: string }

/** What every mod's tab pane reads to draw the strip: the tabs, the open one, whether the sidebar is up, and the Context footer. */
export type SbStrip = { isOn: boolean; active: string; tabs: SbTab[]; theme: string; colour: string; footer?: SbFooter | null }

/** A step of Task View's checklist, as the Task View tab mirrors it. */
export type SbStep = { id: string; name: string; status: string; percent: number; hasReported: boolean }

/** Task View's current job, as its `checklist` state holds it (the fields the tab draws). */
export type SbJob = { title: string; phase: string; tasks: SbStep[]; startedAt: number; finishedAt: number }

/** An on/off mode another mod publishes in its `modes` state, keyed by the command that flips it. */
export type SbMode = { label: string; isOn: boolean }

declare module 'claude-code' {
  interface PluginState {
    /** Read only: the job Task View shows, Prompt Enhancer's last run, Context's footer and Rule Guard's stops. */
    'clean-view': { checklist: unknown }
    'prompt-enhancer': { lastRun: { counts: string; ok: boolean } | null }
    context: { footer: unknown }
    'rule-guard': { blocks: unknown }
    sidebar: {
      strip: SbStrip
      /** What the sidebar's own pane shows: a mod's id, or `sidebar` for its own page. */
      view: string
      tick: number
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
      /** Mods switched off (their `<id>.enabled` setting is false): their tabs are dimmed. */
      off: string[]
      /** Rule Guard's stops this session, newest first. */
      blocks: SbBlock[]
    }
  }
}

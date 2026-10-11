export type TrackerPhase = 'working' | 'waiting' | 'idle' | 'done'

/** One other live session, as the band draws it. */
export type TrackerView = {
  sid: string
  phase: Exclude<TrackerPhase, 'done'>
  /** Name of the file that session edited last, or null if it has edited none. */
  file: string | null
  /** How many files it has edited (at most 50 are kept). */
  count: number
}

declare module 'claude-code' {
  interface PluginState {
    'same-folder-tracker': { others: TrackerView[] }
  }
}

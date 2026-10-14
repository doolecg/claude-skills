export type BarFigures = {
  model: string
  window: number
  effort: string
  ctx: number | null
  /** Tokens in the context window now. */
  tokens: number | null
  fiveHour: number | null
  sevenDay: number | null
  agents: number
}

/** A mod's on/off mode, as the mod publishes it in its own `modes` state, keyed by its command. */
/** One item of Task View's list, as the bar draws it. */
export type BarTodoItem = { name: string; status: 'done' | 'active' | 'upcoming' }

/** Task View's published to-do list (its `checklist` state), drawn above the bar while Claude works. */
export type BarTodo = { phase: string; items: BarTodoItem[]; finishedAt: number }

export type BarMode = {
  label: string
  isOn: boolean
  plugin: string
}

/** How a published segment's run is going; it picks the label's colour. */
export type BarSegmentState = 'idle' | 'working' | 'done' | 'error'

/** A smaller press after a segment's text (`Undo`, `Cancel`): a command and its words. */
export type BarSegmentAction = { label: string; command: string }

/**
 * A segment another mod publishes in its own `segments` state, keyed by an id of its choosing,
 * as the bar keeps it: drawn first on the left of the bar and pressed to run `command`.
 */
export type BarSegment = {
  plugin: string
  id: string
  label: string
  detail: string
  command: string
  state: BarSegmentState
  actions: BarSegmentAction[]
}

export type BarTool = {
  name: string
  description: string
  plugin: string
  source: string
}

/** An installed mod (a plugin with a hooks module), as `claude plugin list` reports it. */
export type BarMod = {
  id: string
  name: string
  label: string
  description: string
  scope: string
  isEnabled: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'bottom-bar': {
      figures: BarFigures
      theme: string
      menu: string
      isWorking: boolean
      models: string[]
      tools: string[]
      toolStates: Record<string, 'on' | 'off'>
      modeStates: Record<string, BarMode>
      /** Other mods' published segments, keyed `<plugin>:<id>`, in drawing order. */
      published: Record<string, BarSegment>
      choices: BarTool[]
      filter: string
      /** The tools pill's name, from the `name` option; the toolbox is headed with it. */
      label: string
      mods: BarMod[]
      /** Task View's to-do list, followed live. */
      todo: BarTodo
    }
  }
}

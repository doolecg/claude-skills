export type BarFigures = {
  model: string
  window: number
  effort: string
  ctx: number | null
  fiveHour: number | null
  agents: number
}

/** A mod's on/off mode, as the mod publishes it in its own `modes` state, keyed by its command. */
export type BarMode = {
  label: string
  isOn: boolean
  plugin: string
}

export type BarTool = {
  name: string
  description: string
  plugin: string
  source: string
}

/** A plugin's `userConfig` field as `/config` lists it, for the toolbox. */
export type BarSetting = {
  key: string
  label: string
  description: string
  kind: 'boolean' | 'choice' | 'text' | 'number'
  value: string | number | boolean
  options: string[]
  isLocked: boolean
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
      choices: BarTool[]
      filter: string
      /** The tools pill's name, from the `name` option; the toolbox is headed with it. */
      label: string
      settings: BarSetting[]
      /** The toolbox page shown: `home` or `settings`. */
      view: string
      mods: BarMod[]
    }
  }
}

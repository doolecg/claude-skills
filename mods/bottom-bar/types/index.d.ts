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
    }
  }
}

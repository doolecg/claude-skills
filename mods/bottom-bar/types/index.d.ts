export type BarFigures = {
  model: string
  window: number
  effort: string
  ctx: number | null
  fiveHour: number | null
  agents: number
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
      choices: BarTool[]
      filter: string
    }
  }
}

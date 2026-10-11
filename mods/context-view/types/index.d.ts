declare module 'claude-code' {
  interface PluginState {
    'context-view': {
      snapshot: { breakdown: SessionContextBreakdown; detail: ContextBreakdownDetail } | null
      error: string | null
      selected: string | null
      detail: string | null
      open: Record<string, boolean>
      isCounting: boolean
      hasToasted: boolean
      bandPick: { value: boolean; from: boolean } | null
    }
  }
}

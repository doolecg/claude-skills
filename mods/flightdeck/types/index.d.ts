export type FdStatus = 'running' | 'waiting' | 'done' | 'failed' | 'stopped'

/** One subagent of this session, as the sidebar keeps it. */
export type FdAgent = {
  id: string
  description: string
  type: string
  status: FdStatus
  startedAt: number
  /** 0 while it runs. */
  endedAt: number
  model: string
  /** Tokens in its context after its latest response. */
  ctxTokens: number
  /** Requests it has made. */
  steps: number
  /** Summed over its responses at list prices; 0 with isCostKnown false when its model has no price here. */
  costUsd: number
  isCostKnown: boolean
}

/** The main loop. */
export type FdMain = {
  model: string
  effort: string
  steps: number
  isRunning: boolean
  turnStartedAt: number
  turnEndedAt: number
}

export type FdLimit = { kind: string; pct: number }

export type FdUsage = {
  ctxPct: number | null
  ctxTokens: number | null
  window: number
  costUsd: number | null
  limits: FdLimit[]
}

/** An on/off mode as the bottom bar reads it, keyed by the command that flips it. */
export type FdMode = { label: string; isOn: boolean }

declare module 'claude-code' {
  interface PluginState {
    'flightdeck': {
      isOpen: boolean
      main: FdMain
      usage: FdUsage
      agents: FdAgent[]
      tick: number
      theme: string
      modes: Record<string, FdMode>
      /** The Sidebar request a strip press or pane close writes (what `/sidebar <args>` does); `n` counts up so a repeat is a new value. */
      sidebarAsk: { args: string; n: number }
      /** The first running card and the first finished row the pane's two lists show. */
      runOffset: number
      doneOffset: number
      /** Agents the person cleared off the list this session. */
      cleared: string[]
    }
    /** The Sidebar mod's strip, as it publishes it (the same shape as its SbStrip). */
    'sidebar': {
      strip: {
        isOn: boolean
        active: string
        tabs: { id: string; icon: string; name: string; label?: string; badge: number }[]
        theme: string
        colour: string
        isSettings?: boolean
      }
    }
  }
}

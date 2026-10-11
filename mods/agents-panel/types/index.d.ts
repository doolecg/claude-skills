export type AgentsPanelKind = 'read' | 'edit'

/** One file Claude read or edited this session. */
export type AgentsPanelFile = { path: string; kind: AgentsPanelKind; at: number; added?: number; removed?: number }

/** A top-level tool call in flight. */
export type AgentsPanelCall = { id: string; tool: string; at: number; path?: string; command?: string }

export type AgentsPanelPending = { kind: 'question' | 'permission'; text: string; tool: string }

export type AgentsPanelTurn = {
  isRunning: boolean
  /** Files edited in the running turn, or in the last one once it ended. */
  edited: string[]
  /** The last edited file's diff in that turn, when known. */
  added?: number
  removed?: number
}

export type AgentsPanelStatus = 'running' | 'waiting' | 'done' | 'failed' | 'stopped'

export type AgentsPanelAgent = {
  id: string
  description: string
  type: string
  status: AgentsPanelStatus
  startedAt: number
  endedAt?: number
  prompt?: string
  model?: string
  effort?: string
  /** Tokens in the agent's context after its last response. */
  ctxTokens?: number
  /** The context window its model has, when known. */
  window?: number
  /** Summed over every response, priced per model where the price is known. */
  costUsd?: number
  isCostKnown?: boolean
  todosDone?: number
  todosTotal?: number
  /** True while a permission dialog of this agent is up. */
  isAsking?: boolean
}

export type AgentsPanelGit = { root: string; branch: string; changed: string[] }

export type AgentsPanelLearner = {
  state: 'running' | 'done' | 'error'
  found: number
  saved: number
  review: number
  error?: string
}

export type AgentsPanelMemory = { learner: AgentsPanelLearner | null; isLearnerInstalled: boolean; writes: string[] }

export type AgentsPanelMcp = { server: string; state: 'connected' | 'needs-auth' | 'failed' | 'other'; reason?: string }

export type AgentsPanelHookMessage = { origin: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'agents-panel': {
      calls: AgentsPanelCall[]
      pending: AgentsPanelPending | null
      turn: AgentsPanelTurn
      files: AgentsPanelFile[]
      lastFile: string | null
      git: AgentsPanelGit | null
      memory: AgentsPanelMemory
      agents: AgentsPanelAgent[]
      mcp: AgentsPanelMcp[]
      mcpFailed: AgentsPanelMcp[]
      skills: string[]
      hookMessages: AgentsPanelHookMessage[] | null
      transcriptPath: string | null
      mainModel: string | null
      sessionWindow: number | null
      view: string | null
      stick: boolean
      cleared: string[]
      collapsed: { running: boolean; finished: boolean }
      statusOpen: boolean
      tick: number
      rev: number
      isDark: boolean
      bandPick: { value: boolean; from: boolean } | null
    }
  }
}

export type CvTaskStatus = 'done' | 'active' | 'upcoming'

export type CvTask = {
  id: string
  name: string
  status: CvTaskStatus
  percent: number
  hasReported: boolean
}

/** An on/off mode as the bottom bar reads it, keyed by the command that flips it. */
export type CvMode = { label: string; isOn: boolean }

export type CvPhase = 'idle' | 'working' | 'needs-you' | 'stuck' | 'stopped' | 'done'

export type CvChecklist = {
  title: string
  phase: CvPhase
  tasks: CvTask[]
  needsYouReason: string
  stuckReason: string
  startedAt: number
  finishedAt: number
  isCollapsed: boolean
  /** Background helpers (subagents) still running after the main turn ended. */
  helpers: number
}

declare module 'claude-code' {
  interface PluginState {
    'clean-view': {
      cleanViewEnabled: boolean
      checklist: CvChecklist
      tick: number
      /** The tool_use_id of the latest to-do tool call: the row that is drawn live. */
      todoUse: string
      theme: string
      colour: string
      modes: Record<string, CvMode>
    }
  }
}

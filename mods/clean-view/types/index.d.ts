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
}

declare module 'claude-code' {
  interface PluginState {
    'clean-view': {
      cleanViewEnabled: boolean
      checklist: CvChecklist
      tick: number
      theme: string
      modes: Record<string, CvMode>
    }
  }
}

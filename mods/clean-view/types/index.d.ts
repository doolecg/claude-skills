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

export type CvAskOption = { label: string; description: string }

export type CvAskQuestion = {
  header: string
  question: string
  multiSelect: boolean
  options: CvAskOption[]
}

/** The questions Claude is asking, shown in the band beside the checklist; `isOpen` is false when none are. */
export type CvAsk = {
  isOpen: boolean
  toolUseId: string
  questions: CvAskQuestion[]
  /** The question tab showing. */
  current: number
  /** Per question, the answer given (the labels comma-joined, or typed text), or null. */
  answers: (string | null)[]
  /** Per multi-select question, the labels ticked so far. */
  picks: string[][]
}

declare module 'claude-code' {
  interface PluginState {
    'clean-view': {
      cleanViewEnabled: boolean
      checklist: CvChecklist
      ask: CvAsk
      tick: number
      theme: string
      colour: string
      modes: Record<string, CvMode>
    }
  }
}

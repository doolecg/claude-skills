export type CvTaskStatus = 'done' | 'active' | 'upcoming'

export type CvTask = {
  id: string
  name: string
  status: CvTaskStatus
  percent: number
  hasReported: boolean
}

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

export type DockCardStatus = 'queued' | 'working' | 'done' | 'stuck'

export type DockCard = {
  id: string
  name: string
  status: DockCardStatus
  percent: number
  hasReported: boolean
  startedAt: number
  endedAt: number
  agentId: string
}

export type DockState = {
  teamSize: number
  helperModel: 'fast' | 'same'
  pendingSize: number
  isCustomOpen: boolean
  isFolded: boolean
  limit: number
  missionName: string
  missionStartedAt: number
  missionFinishedAt: number
  cards: DockCard[]
}

declare module 'claude-code' {
  interface PluginState {
    'clean-view': {
      cleanViewEnabled: boolean
      checklist: CvChecklist
      tick: number
      dock: DockState
      dockTick: number
    }
  }
}

export type Learning = { id: string; text: string; kind: string; project: string; at: number; synced: boolean }
export type Proposal = {
  id: string
  action: 'create' | 'rewrite' | 'merge' | 'prune'
  name: string
  description: string
  body: string
  reason: string
  mergeInto?: string
  at: number
}
export type SkillStat = { uses: number; corrections: number; lastUsed: number; created: number }
export type SelfImproveData = {
  turns: number
  paused: boolean
  pending: Proposal[]
  learnings: Learning[]
  skills: Record<string, SkillStat>
  prefs: string[]
  usage: { day: string; tokens: number }
  status: string
}

declare module 'claude-code' {
  interface PluginState {
    'self-improve': { data: SelfImproveData; editing: string | null }
  }
}

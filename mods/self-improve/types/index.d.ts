export type SessionInfo = {
  id: string
  cwd: string
  startHead: string
  transcriptPath: string
  edits: number
  editsAtLearn: number
  learnedAt: number
  note: string
  isOff: boolean
}

export type BandInfo = { line: string; isRunning: boolean }

export type Confirm = { action: 'delete-lessons' | 'delete-stale' | 'rollback'; ids: number[]; label: string }

export type Editing = { key: string; value: string }

export type PaneUi = {
  tab: 'lessons' | 'drafts' | 'skills' | 'changes' | 'runs' | 'soul'
  kind: string
  store: string
  query: string
  confirm: Confirm | null
  editing: Editing | null
  section: string
  message: string
}

declare module 'claude-code' {
  interface PluginState {
    'self-improve': {
      session: SessionInfo | null
      brief: string
      band: BandInfo
      ui: PaneUi
      sidebarBadge: number
      /** The Sidebar request a strip press or pane close writes (what `/sidebar <args>` does); `n` counts up so a repeat is a new value. */
      sidebarAsk: { args: string; n: number }
    }
    sidebar: {
      strip: { isOn: boolean; active: string; tabs: { id: string; icon: string; name: string; badge: number }[]; theme: string; colour: string; isSettings?: boolean }
    }
  }
}

export type Phase = 'working' | 'waiting' | 'idle' | 'done'

export type TrackedFile = { path: string; at: number }

export type Tracker = {
  id: string
  cwd: string
  phase: Phase
  at: number
  files: TrackedFile[]
}

declare module 'claude-code' {
  interface PluginState {
    'folder-tracker': {
      /** How many other live sessions share this folder: the count on this tab's sidebar icon. */
      sidebarBadge: number
    }
    sidebar: {
      strip: { isOn: boolean; active: string; tabs: { id: string; icon: string; name: string; badge: number }[]; theme: string; colour: string }
    }
  }
}

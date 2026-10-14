export type Idea = { text: string; at: number }

export type Editing = { id: string; draft: string }

declare module 'claude-code' {
  interface PluginState {
    'idea-shelf': {
      editing: Editing | null
      /** This project's idea count, for the Sidebar's tab badge. */
      sidebarBadge: number
      /** The Sidebar request a strip press or pane close writes (what `/sidebar <args>` does); `n` counts up so a repeat is a new value. */
      sidebarAsk: { args: string; n: number }
    }
    sidebar: {
      strip: { isOn: boolean; active: string; tabs: { id: string; icon: string; name: string; badge: number }[]; theme: string; colour: string; isSettings?: boolean }
    }
  }
}

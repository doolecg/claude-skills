export type Idea = { id: string; text: string; at: number }

export type Board = {
  shelf: Idea[]
  folder: string
  editing: string | null
  draft: string
  notice: string | null
  sending: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'idea-shelf': { board: Board }
  }
}

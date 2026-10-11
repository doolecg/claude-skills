export type DesignPickerOption = {
  label: string
  description: string
  style: string | null
}

export type DesignPickerQuestion = {
  header: string
  question: string
  why: 'words' | 'styles'
  options: DesignPickerOption[]
}

export type DesignPickerBand = {
  // The tool call this band belongs to.
  id: string
  // working: the page is being written; ready: it is saved; unavailable: no page.
  status: 'working' | 'ready' | 'unavailable'
  questions: DesignPickerQuestion[]
}

declare module 'claude-code' {
  interface PluginState {
    'design-picker': { band: DesignPickerBand | null }
  }
}

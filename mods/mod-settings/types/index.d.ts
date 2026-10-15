/** One mod setting as the pane keeps it: a `/config` row a plugin owns. */
export type MsRow = {
  /** `<plugin>.<field>`, what `$.config.set` takes. */
  key: string
  plugin: string
  label: string
  description: string
  kind: 'boolean' | 'choice' | 'text' | 'number'
  value: string | number | boolean
  options: string[]
  isLocked: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'mod-settings': {
      rows: MsRow[]
      /** The last change's result, shown under the header: `''`, a confirmation or why it was refused. */
      note: string
      /** The mod whose card is open; `''` shows them all folded. */
      open: string
      /** The Main Menu request a strip press or pane close writes (what `/sidebar <args>` does); `n` counts up so a repeat is a new value. */
      sidebarAsk: { args: string; n: number }
    }
    sidebar: {
      strip: { isOn: boolean; active: string; tabs: { id: string; icon: string; name: string; badge: number; isOff?: boolean }[]; theme: string; colour: string }
    }
  }
}

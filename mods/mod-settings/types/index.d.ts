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
    }
  }
}

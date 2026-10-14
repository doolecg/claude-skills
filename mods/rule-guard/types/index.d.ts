export type RgBlock = {
  // Milliseconds since the epoch.
  at: number
  // The option name of the rule, such as plainTags.
  rule: string
  // The rule's plain title.
  label: string
  // The command that was stopped, clipped to 80 characters.
  what: string
}

declare module 'claude-code' {
  interface PluginState {
    'rule-guard': {
      // The last 10 stops this session, newest first.
      blocks: RgBlock[]
      // Stops this session, for the Sidebar's tab icon.
      sidebarBadge: number
      // The latest prompt the person typed.
      lastPrompt: string
    }
    // Read only: the Context mod's footer, whose `passes` field the pass cap reads.
    context: { footer: unknown }
  }
}

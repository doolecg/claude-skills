export type CtxFooter = {
  context: { percent: number | null; tokens: number | null; window: number | null }
  /** off: no ~/.hindsight/coding-agent.json (self-hosted). up: the server answered. down: it did not within 5 s. */
  hindsight: 'up' | 'down' | 'off' | 'checking'
  /** indexed: a .codegraph/ folder at the git root or session root. */
  codegraph: 'indexed' | 'none'
  git: { branch: string; changed: number; ahead: number; behind: number } | null
  passes: { count: number; limit: number; editedSince: boolean; extra: string[] }
}

declare module 'claude-code' {
  interface PluginState {
    context: { footer: CtxFooter }
  }
}

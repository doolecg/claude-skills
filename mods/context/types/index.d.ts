export type CtxFooter = {
  /** off: no self-hosted ~/.hindsight/coding-agent.json (Hindsight not set up). up: the server answered. down: it did not within 5 s. */
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

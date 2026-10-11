export type PlainEnglishVerdict = { isOk: true } | { isOk: false; rule: string }

export type PlainEnglishTool = { id: string; tool: string }

export type PlainEnglishState = {
  goal: string
  tools: PlainEnglishTool[]
  checks: number
  tokens: number
  verdict: PlainEnglishVerdict | null
}

declare module 'claude-code' {
  interface PluginState {
    'plain-english': { session: PlainEnglishState }
  }
}

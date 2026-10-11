export type PromptEnhancerParts = {
  /** The cleaned-up task. */
  task: string
  /** Lines under "Load these skills:". */
  skills: string[]
  /** Lines under "Ask me first about:". */
  ask: string[]
  /** Lines under "Done when:". */
  done: string[]
}

export type PromptEnhancerState = {
  /** idle: nothing on screen; working: waiting for the model; ready: a rewrite waits for Use, Edit or Cancel. */
  phase: 'idle' | 'working' | 'ready'
  /** Bumped for every request and when one is cancelled, so a late answer is ignored. */
  requestId: number
  /** The text as the user typed it, put back on Cancel or on a failure. */
  original: string
  /** The rewrite as it would be sent (empty unless ready). */
  text: string
  parts: PromptEnhancerParts | null
  /** A line shown in the band under the buttons, such as a failed Use. */
  note: string | null
  /** Rewrites started this session. */
  count: number
  /** Tokens the model calls used this session. */
  tokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': { session: PromptEnhancerState }
  }
}

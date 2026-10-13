/** Where a press of Enhance Prompt is: waiting, gathering context, or waiting on the model. */
export type Phase = 'idle' | 'context' | 'rewrite'

/** One finished rewrite: the text it replaced, the rewrite, and what it was given. */
export type Rewrite = { original: string; enhanced: string; note: string }

/** The last run: what each optional source gave (`Hindsight 6 · CodeGraph 3`), and whether a rewrite came back. */
export type LastRun = { counts: string; ok: boolean }

/** The segment a status bar draws for Enhance Prompt (Bottom Bar's `segments` contract). */
export type PublishedSegment = {
  label: string
  detail?: string
  command: string
  state?: 'idle' | 'working' | 'done' | 'error'
  actions?: { label: string; command: string }[]
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': {
      phase: Phase
      /** The last rewrite put in the box, so Undo can put the original back. */
      undo: Rewrite | null
      /** A rewrite that could not go in the box (it changed meanwhile, or a dialog held it). */
      held: Rewrite | null
      /** The main loop's effort, from its last model request. */
      sessionEffort: string
      lastRun: LastRun | null
      /** Published for a status bar that hosts other mods' segments, keyed by id. */
      segments: Record<string, PublishedSegment>
    }
  }
}

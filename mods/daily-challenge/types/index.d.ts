export type ChallengeProgress = {
  done: Record<string, string>
  today: { day: string; idx: number } | null
}

declare module 'claude-code' {
  interface PluginState {
    'daily-challenge': { progress: ChallengeProgress }
  }
}

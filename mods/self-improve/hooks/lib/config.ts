export type Config = {
  enabled: boolean
  nudgeModel: string
  skillModel: string
  nudgeEveryTurns: number
  minToolCallsForSkill: number
  approvalMode: 'ask' | 'auto'
  maxInjectTokens: number
  dailyTokenCap: number
  nudge: { maxIn: number; maxOut: number }
  skill: { maxIn: number; maxOut: number }
  rewrite: { maxIn: number; maxOut: number }
  hindsight: { enabled: boolean; baseUrl: string; apiKeyEnv: string; bank: string }
  codegraph: { enabled: boolean }
}

export const clamp = (v: unknown, min: number, max: number, dflt: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, Math.round(n)))
}

const str = (v: unknown, dflt: string): string =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : dflt

const bool = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt)

export const parseConfig = (o: Readonly<Record<string, unknown>> = {}): Config => ({
  enabled: bool(o.enabled, true),
  nudgeModel: str(o.nudgeModel, 'haiku'),
  skillModel: str(o.skillModel, 'haiku'),
  nudgeEveryTurns: clamp(o.nudgeEveryTurns, 1, 200, 6),
  minToolCallsForSkill: clamp(o.minToolCallsForSkill, 1, 200, 8),
  approvalMode: o.approvalMode === 'auto' ? 'auto' : 'ask',
  maxInjectTokens: clamp(o.maxInjectTokens, 50, 4000, 600),
  dailyTokenCap: clamp(o.dailyTokenCap, 0, 100_000_000, 200_000),
  nudge: { maxIn: clamp(o.nudgeMaxInputTokens, 200, 50_000, 4000), maxOut: clamp(o.nudgeMaxOutputTokens, 50, 8000, 500) },
  skill: { maxIn: clamp(o.skillMaxInputTokens, 200, 50_000, 6000), maxOut: clamp(o.skillMaxOutputTokens, 50, 8000, 1200) },
  rewrite: { maxIn: clamp(o.rewriteMaxInputTokens, 200, 50_000, 6000), maxOut: clamp(o.rewriteMaxOutputTokens, 50, 8000, 1200) },
  hindsight: {
    enabled: bool(o.hindsightEnabled, true),
    baseUrl: str(o.hindsightBaseUrl, '').replace(/\/+$/, ''),
    apiKeyEnv: /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(str(o.hindsightApiKeyEnv, '')) ? str(o.hindsightApiKeyEnv, '') : 'HINDSIGHT_API_KEY',
    bank: str(o.hindsightBank, 'self-improve').replace(/[^A-Za-z0-9._:-]/g, '-'),
  },
  codegraph: { enabled: bool(o.codegraphEnabled, true) },
})

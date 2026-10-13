export const estimateTokens = (s: string): number => Math.ceil(s.length / 4)

export const truncateToTokens = (s: string, max: number): string =>
  estimateTokens(s) <= max ? s : s.slice(0, Math.max(0, max * 4 - 1)).trimEnd() + '…'

export const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

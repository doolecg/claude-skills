export const shouldNudge = (turns: number, every: number): boolean => every > 0 && turns > 0 && turns % every === 0

export const shouldProposeSkill = (toolCalls: number, corrected: boolean, min: number): boolean =>
  corrected ? toolCalls >= 1 : toolCalls >= min

const CORRECTION: RegExp[] = [
  /^\s*(no|nope|wrong|incorrect|stop)\b[\s,.!:;-]/i,
  /\bthat'?s (not|wrong|incorrect)\b/i,
  /\bnot what i (asked|wanted|meant)\b/i,
  /\bi (said|asked for|meant|wanted)\b/i,
  /\b(don'?t|do not|never) (do|use|add|change|touch|make)\b/i,
  /\b(actually|instead),? /i,
  /\bundo (that|this|it)\b/i,
  /\bwhy did you\b/i,
]

export const isCorrection = (text: string): boolean => text.length < 600 && CORRECTION.some(r => r.test(text))

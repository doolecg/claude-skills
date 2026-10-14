// Which shell commands count as a test run. Self-contained (no imports): Context keeps the same copy.
const CHECK = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|typecheck|lint|check|build|verify)\b|\bclaude\s+plugin\s+(test|validate)\b|\b(pytest|tsc|vitest|jest|mocha|ctest)\b|\bcargo\s+(test|check|build)\b|\bgo\s+(test|vet|build)\b|\bmvn\b.*\b(test|verify|package)\b|\bgradlew?(\.bat)?\b.*\b(test|check|build)\b|\bdotnet\s+(test|build)\b|\bmake\s+(test|check)\b/i

// True when the command runs a test, build or check, or contains one of the extra words (whole word, any case).
export function isCheckCommand(command: string, extra: readonly string[] = []): boolean {
  for (const word of extra) {
    const trimmed = word.trim()
    if (trimmed === '') continue
    const escaped = trimmed.replace(/\W/g, '\\$&')
    if (new RegExp('(^|\\W)' + escaped + '($|\\W)', 'i').test(command)) return true
  }

  return CHECK.test(command)
}

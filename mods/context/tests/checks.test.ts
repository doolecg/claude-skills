import { describe, expect, test } from 'claude-code/testing'

import { isCheckCommand } from '../hooks/checks'

describe('isCheckCommand', () => {
  test('known test, build and lint commands count', () => {
    for (const c of [
      'npm test',
      'npm run test',
      'pnpm run typecheck',
      'yarn lint',
      'bun run build',
      'claude plugin test mods/context',
      'claude plugin validate mods/context',
      'npx tsc -p .',
      'pytest -q',
      'npx vitest run',
      'cargo test --all',
      'go vet ./...',
      'mvn -q clean verify',
      './gradlew.bat build',
      'dotnet test',
      'make check',
      'cd app && NPM RUN TEST',
    ]) {
      expect(isCheckCommand(c, [])).toBe(true)
    }
  })

  test('other commands do not', () => {
    for (const c of ['ls -la', 'git status', 'npm install', 'echo test', 'cat tsconfig.json', 'make install', 'cargo run', '']) {
      expect(isCheckCommand(c, [])).toBe(false)
    }
  })

  test('extra words count as whole words, any case', () => {
    expect(isCheckCommand('./verify-all.sh', ['verify-all'])).toBe(true)
    expect(isCheckCommand('Run-Smoke --fast', ['run-smoke'])).toBe(true)
    expect(isCheckCommand('smoketest', ['smoke'])).toBe(false)
    expect(isCheckCommand('npm install', ['smoke'])).toBe(false)
    expect(isCheckCommand('echo hi', [' ', ''])).toBe(false)
  })
})

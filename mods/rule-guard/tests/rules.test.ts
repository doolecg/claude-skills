import { expect, test } from 'claude-code/testing'

import { isCheckCommand } from '../hooks/checks'
import { clip, evaluate, narrowPasses, segments } from '../hooks/rules'
import type { Call, Context, Passes } from '../hooks/rules'

const NONE: Context = { enabled: {}, prompt: '', passes: null }

function run(command: string, ctx: Partial<Context> = {}) {
  return evaluate({ tool: 'Bash', command } satisfies Call, { ...NONE, ...ctx })
}

const rule = (command: string, ctx: Partial<Context> = {}) => run(command, ctx)?.rule ?? null

test('a commit with a Co-Authored-By line is stopped, a plain one passes', () => {
  expect(rule('git commit -m "Fix the bug\n\nCo-Authored-By: Claude <noreply@anthropic.com>"')).toBe('noAttribution')
  expect(rule('git commit -m "Fix the bug"')).toBeNull()
  expect(run('git commit -m "x" -m "Generated with Claude Code"')?.reason).toContain('Generated with')
  expect(rule('git commit -m "$(cat <<\'END\'\nFix it\n\nhttps://claude.ai/code/abc\nEND\n)"')).toBe('noAttribution')
  expect(rule('git commit -m "Written by Claude"')).toBe('noAttribution')
})

test('credit in a pull request or release body is stopped, but not in other commands', () => {
  expect(rule('gh pr create --title t --body "Generated with Claude Code"')).toBe('noAttribution')
  expect(rule('gh release create 1.0.0 --notes "Co-Authored-By: x"')).toBe('noAttribution')
  expect(rule('echo "Generated with love"')).toBeNull()
})

test('the git commit MCP tool message is checked', () => {
  expect(evaluate({ tool: 'mcp__git__git_commit', message: 'Fix\n\nCo-Authored-By: Claude' }, NONE)?.rule).toBe('noAttribution')
  expect(evaluate({ tool: 'mcp__git__git_commit', message: 'Fix' }, NONE)).toBeNull()
})

test('v tags are stopped and plain tags pass', () => {
  const asked = { prompt: 'tag it' }
  expect(rule('git tag v1.2.3', asked)).toBe('plainTags')
  expect(rule('git tag -a v1.2.3 -m "Release"', asked)).toBe('plainTags')
  expect(rule('git tag -a -m "Release" "v1.2.3"', asked)).toBe('plainTags')
  expect(rule('gh release create v1.2.3 --notes x', asked)).toBe('plainTags')
  expect(rule('git push origin v1.2.3', asked)).toBe('plainTags')
  expect(run('git tag v1.2.3', asked)?.reason).toContain('Use 1.2.3')
  expect(rule('git tag 1.2.3', asked)).toBeNull()
  expect(rule('git tag -a 1.2.3 -m "v1 is old"', asked)).toBeNull()
  expect(rule('git push origin 1.2.3', asked)).toBeNull()
  expect(rule('git push origin v2-fix', asked)).toBeNull()
})

test('push, new tags, releases, publish and merge need the person to have asked', () => {
  for (const command of ['git push', 'git push origin main', 'git tag 1.0.0', 'gh release create 1.0.0', 'gh release upload 1.0.0 a.zip', 'gh release edit 1.0.0', 'npm publish', 'gh pr merge 4', 'git -C repo push'])
    expect(rule(command), command).toBe('askBeforePublish')
  expect(run('git push')?.reason).toContain('Ask the person first')
})

test('listing or deleting tags, and other git commands, are not publishing', () => {
  for (const command of ['git tag', 'git tag -l', 'git tag --list "1.*"', 'git tag -d 1.0.0', 'git status', 'git pull', 'gh pr view 3', 'npm run build'])
    expect(rule(command), command).toBeNull()
})

test('publishing passes when the latest prompt names it as a whole word', () => {
  expect(rule('git push', { prompt: 'ok push it' })).toBeNull()
  expect(rule('git push', { prompt: 'Please PUBLISH the thing' })).toBeNull()
  expect(rule('npm publish', { prompt: 'ship' })).toBeNull()
  expect(rule('git push', { prompt: 'fix the pushy button' })).toBe('askBeforePublish')
  expect(rule('git push', { prompt: 'tidy the code' })).toBe('askBeforePublish')
})

test('words inside a quoted commit message are not commands', () => {
  expect(rule('git commit -m "stop running git push by hand and no npm publish"')).toBeNull()
  expect(rule('git commit -m "use pkill and --no-verify less"')).toBeNull()
  expect(rule("echo 'git push'")).toBeNull()
})

test('chained commands are checked part by part', () => {
  expect(rule('git add . && git commit -m "x" && git push')).toBe('askBeforePublish')
  expect(rule('git status; npm test | tee out.txt; pkill node')).toBe('noKillByName')
  expect(rule('git add .; git commit -m "ok"; git status')).toBeNull()
  expect(rule('git commit -m "a;b && git push"')).toBeNull()
  expect(rule('git add .\ngit commit -m "ok"\ngit push')).toBe('askBeforePublish')
})

test('a shell given a quoted script is read into', () => {
  expect(rule('bash -c "git push origin main"')).toBe('askBeforePublish')
  expect(rule('powershell -Command "Stop-Process -Name node"')).toBe('noKillByName')
})

test('killing by name is stopped, killing by id passes', () => {
  for (const command of ['Stop-Process -Name node', 'stop-process -name node -Force', 'taskkill /IM node.exe /F', 'taskkill /im node.exe', 'taskkill //IM node.exe', 'pkill -f vite', 'killall node'])
    expect(rule(command), command).toBe('noKillByName')
  for (const command of ['Stop-Process -Id 123', 'taskkill /PID 123 /F', 'kill 123', 'Get-Process -Name node'])
    expect(rule(command), command).toBeNull()
})

test('skipping hooks or signing on git is stopped', () => {
  expect(rule('git commit --no-verify -m x')).toBe('noSkipHooks')
  expect(rule('git commit --no-gpg-sign -m x')).toBe('noSkipHooks')
  expect(rule('git -c commit.gpgsign=false commit -m x')).toBe('noSkipHooks')
  expect(rule('git -c "commit.gpgsign=false" commit -m x')).toBe('noSkipHooks')
  expect(rule('git push --no-verify', { prompt: 'push' })).toBe('noSkipHooks')
  expect(rule('git commit -m x')).toBeNull()
  expect(rule('npm install --no-verify')).toBeNull()
})

const FULL: Passes = { count: 3, limit: 3, editedSince: true, extra: [] }

test('the pass cap stops a check command once the limit is reached and files changed', () => {
  expect(run('npm test', { passes: FULL })?.reason).toBe('Rule Guard: that would be test pass 4, past the limit of 3. Stop and ask the person how to go on.')
  expect(rule('cd app && pnpm run build', { passes: FULL })).toBe('passCap')
  expect(rule('make verify-all', { passes: { ...FULL, extra: ['verify-all'] } })).toBe('passCap')
  expect(rule('npm test', { passes: { ...FULL, count: 2 } })).toBeNull()
  expect(rule('npm test', { passes: { ...FULL, editedSince: false } })).toBeNull()
  expect(rule('ls', { passes: FULL })).toBeNull()
  expect(rule('git commit -m "run npm test"', { passes: FULL })).toBeNull()
  expect(rule('npm test', { passes: null })).toBeNull()
})

test('a rule turned off lets its calls through', () => {
  expect(rule('pkill node', { enabled: { noKillByName: false } })).toBeNull()
  expect(rule('git push', { enabled: { askBeforePublish: false } })).toBeNull()
  expect(rule('npm test', { enabled: { passCap: false }, passes: FULL })).toBeNull()
  expect(rule('git tag v1.0.0', { enabled: { plainTags: false, askBeforePublish: false } })).toBeNull()
})

test('narrowPasses reads the Context footer and ignores anything else', () => {
  expect(narrowPasses({ passes: { count: 2, limit: 3, editedSince: true, extra: ['x', 4] } })).toEqual({ count: 2, limit: 3, editedSince: true, extra: ['x'] })
  expect(narrowPasses({ passes: { count: 2, limit: 3 } })).toEqual({ count: 2, limit: 3, editedSince: false, extra: [] })
  expect(narrowPasses(undefined)).toBeNull()
  expect(narrowPasses({})).toBeNull()
  expect(narrowPasses({ passes: { count: '2', limit: 3 } })).toBeNull()
})

test('isCheckCommand matches checks and extra whole words', () => {
  expect(isCheckCommand('npm run typecheck')).toBe(true)
  expect(isCheckCommand('claude plugin test mods/x')).toBe(true)
  expect(isCheckCommand('ls -la')).toBe(false)
  expect(isCheckCommand('./go.sh', ['go.sh'])).toBe(true)
  expect(isCheckCommand('./cargo-go.sh', ['go'])).toBe(true)
  expect(isCheckCommand('gofish', ['go'])).toBe(false)
})

test('segments and clip behave', () => {
  expect(segments('FOO=1 git push && echo "a b"').map(seg => seg.prog)).toEqual(['git', 'echo'])
  expect(clip('a   b\nc')).toBe('a b c')
  expect(clip('x'.repeat(200)).length).toBe(80)
})

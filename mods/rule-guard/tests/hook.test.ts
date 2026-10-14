import { expect, mock, test } from 'claude-code/testing'

const PASSED = (extra: Record<string, unknown> = {}) => ({ passes: { count: 3, limit: 3, editedSince: true, extra: [], ...extra } })

// A stand-in for the Context mod: `/footer <json>` publishes that as its footer state.
const CONTEXT_MOD = {
  name: 'context',
  register: ((on: any) => {
    on('command.run', { command: 'footer' }, async ($: any, e: any) => {
      await $.state.set({ plugin: 'context', key: 'footer' }, JSON.parse(e.args))

      return { text: 'ok' }
    })
  }) as any,
}

const publish = ($: any, footer: unknown) => $.command.run({ command: 'footer', args: JSON.stringify(footer) })

// The engine side of the mod: records its toasts and state writes, and stands in for the Context mod's footer.
function world(on: any) {
  const w = { toasts: [] as string[], state: {} as Record<string, any> }
  mock.clock(on, { now: 5000 })
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    w.toasts.push(e.text)

    return { value: undefined }
  })
  on('prompt.submit', (_$: unknown, e: any) => ({ text: e.text, origin: e.origin }))
  on('state.set', { plugin: 'rule-guard' }, async (_$: unknown, e: any, next: any) => {
    w.state[e.key] = e.value

    return next(e)
  })

  return w
}

async function bash($: any, command: string, agentId?: string) {
  return $.tool.call({ tool: 'Bash', command, ...(agentId === undefined ? {} : { agentId }) })
}

const allow = (on: any) => on('tool.call', () => ({ result: 'ran', text: 'ran' }) as never)

test('a denied call returns the reason, toasts, and records the stop', async ($, on) => {
  const w = world(on)
  allow(on)

  const result = await bash($, 'git commit -m "Fix\n\nCo-Authored-By: Claude"')

  expect(result.deny).toContain('Rule Guard: commits, pull requests and releases carry no Claude or AI credit')
  expect(w.toasts).toEqual(['Rule Guard stopped: No AI credit in commits'])
  expect(w.state.blocks.length).toBe(1)
  expect(w.state.blocks[0].rule).toBe('noAttribution')
  expect(w.state.blocks[0].label).toBe('No AI credit in commits')
  expect(w.state.blocks[0].at).toBe(5000)
  expect(w.state.blocks[0].what.length).toBeLessThanOrEqual(80)
  expect(w.state.sidebarBadge).toBe(1)
})

test('blocks keep the newest ten first and the badge counts every stop', async ($, on) => {
  const w = world(on)
  for (let i = 0; i < 12; i++) await bash($, `pkill node${i}`)

  expect(w.state.blocks.length).toBe(10)
  expect(w.state.blocks[0].what).toBe('pkill node11')
  expect(w.state.sidebarBadge).toBe(12)
})

test('a harmless call passes through untouched with no toast', async ($, on) => {
  const w = world(on)
  allow(on)

  const result = await bash($, 'git status')

  expect(result.deny).toBeUndefined()
  expect(result.text).toBe('ran')
  expect(w.toasts).toEqual([])
  expect(w.state.sidebarBadge).toBeUndefined()
})

test('a subagent call is judged too', async ($, on) => {
  world(on)

  expect((await bash($, 'killall node', 'agent-1')).deny).toContain('process ID')
})

test('the PowerShell tool and the git commit MCP tool are inspected', async ($, on) => {
  world(on)

  expect((await $.tool.call({ tool: 'PowerShell', command: 'Stop-Process -Name node' })).deny).toContain('by name')
  expect((await $.tool.call({ tool: 'mcp__git__git_commit', repo_path: '.', message: 'x\n\nCo-Authored-By: Claude' })).deny).toContain('Co-Authored-By')
})

test('a push is stopped until the person asks for it', async ($, on) => {
  const w = world(on)
  allow(on)

  await $.prompt.submit({ text: 'tidy the readme', wait: false, origin: { kind: 'composer' } })
  expect((await bash($, 'git push')).deny).toContain('Ask the person first')
  expect(w.state.lastPrompt).toBe('tidy the readme')

  await $.prompt.submit({ text: 'ok push it', wait: false, origin: { kind: 'composer' } })
  expect((await bash($, 'git push')).deny).toBeUndefined()
})

test('a prompt that is not from the person does not unlock a push', async ($, on) => {
  world(on)

  await $.prompt.submit({ text: 'please push now', wait: false, origin: { kind: 'peer' } })

  expect((await bash($, 'git push')).deny).toContain('Ask the person first')
})

test('a rule turned off lets the call through', { options: { noKillByName: false } }, async ($, on) => {
  world(on)
  allow(on)

  expect((await bash($, 'pkill node')).deny).toBeUndefined()
  expect((await bash($, 'git commit --no-verify -m x')).deny).toContain('hooks')
})

test('the pass cap reads the Context mod state', { plugins: [CONTEXT_MOD] }, async ($, on) => {
  world(on)
  allow(on)

  expect((await bash($, 'npm test')).deny).toBeUndefined()

  await publish($, PASSED())
  expect((await bash($, 'npm test')).deny).toBe('Rule Guard: that would be test pass 4, past the limit of 3. Stop and ask the person how to go on.')
  expect((await bash($, 'ls')).deny).toBeUndefined()

  await publish($, PASSED({ editedSince: false }))
  expect((await bash($, 'npm test')).deny).toBeUndefined()
})

test('the pass cap does nothing when it is turned off', { options: { passCap: false }, plugins: [CONTEXT_MOD] }, async ($, on) => {
  world(on)
  allow(on)
  await publish($, PASSED())

  expect((await bash($, 'npm test')).deny).toBeUndefined()
})

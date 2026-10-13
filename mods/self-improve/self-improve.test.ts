import { describe, expect, mock, test } from 'claude-code/testing'

import type { Proposal } from './types'
import { buildSection } from './hooks/lib/compose'
import { parseConfig } from './hooks/lib/config'
import {
  addLearnings,
  addPref,
  addUsage,
  countTurn,
  dropProposal,
  emptyData,
  isOverCap,
  queueProposal,
  searchLocal,
  weakSkills,
} from './hooks/lib/data'
import { curlArgv, isConfigured, parseCurl } from './hooks/lib/hindsight'
import { redact, containsSecret } from './hooks/lib/secrets'
import { buildSkillMd, parseNudge, parseProposal, planApproval, routeProposal, sanitizeName } from './hooks/lib/skills'
import { estimateTokens } from './hooks/lib/tokens'
import { isCorrection, shouldNudge, shouldProposeSkill } from './hooks/lib/triggers'

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: 'p1',
  action: 'create',
  name: 'run-tests',
  description: 'Use when you need to run the project test suite safely.',
  body: '1. Run the build.\n2. Run the tests.\n3. Read the failures before changing code.',
  reason: 'repeated work',
  at: 1,
  ...over,
})

describe('config', () => {
  test('defaults', () => {
    const c = parseConfig({})
    expect(c.enabled).toBe(true)
    expect(c.nudgeEveryTurns).toBe(6)
    expect(c.minToolCallsForSkill).toBe(8)
    expect(c.approvalMode).toBe('ask')
    expect(c.nudgeModel).toBe('haiku')
    expect(c.maxInjectTokens).toBe(600)
    expect(c.hindsight.bank).toBe('self-improve')
    expect(c.codegraph.enabled).toBe(true)
  })

  test('clamps and sanitises', () => {
    const c = parseConfig({
      nudgeEveryTurns: 0,
      minToolCallsForSkill: 99999,
      maxInjectTokens: 1,
      dailyTokenCap: -5,
      nudgeMaxOutputTokens: 'abc',
      approvalMode: 'bogus',
      hindsightApiKeyEnv: 'bad name; rm',
      hindsightBaseUrl: 'https://hs.example.com///',
    })
    expect(c.nudgeEveryTurns).toBe(1)
    expect(c.minToolCallsForSkill).toBe(200)
    expect(c.maxInjectTokens).toBe(50)
    expect(c.dailyTokenCap).toBe(0)
    expect(c.nudge.maxOut).toBe(500)
    expect(c.approvalMode).toBe('ask')
    expect(c.hindsight.apiKeyEnv).toBe('HINDSIGHT_API_KEY')
    expect(c.hindsight.baseUrl).toBe('https://hs.example.com')
  })
})

describe('secrets', () => {
  test('filters keys, tokens and passwords', () => {
    const samples = [
      'key sk-abcdefghijklmnopqrstuvwx1234',
      'token ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'password: hunter2hunter2',
      'Authorization: Bearer abcdefghijklmnop1234567890',
      'AKIAABCDEFGHIJKLMNOP',
      'postgres://user:secretpass@db.example.com/x',
    ]
    for (const s of samples) {
      expect(containsSecret(s)).toBe(true)
      expect(redact(s)).toContain('[redacted]')
    }
    expect(containsSecret('Use pnpm for installs in this repo')).toBe(false)
  })

  test('secret learnings are never kept', () => {
    const d = addLearnings(emptyData(), [
      { id: 'a', text: 'api_key = abcd1234efgh', kind: 'fact', project: 'x', at: 1, synced: false },
      { id: 'b', text: 'Prefers tabs over spaces', kind: 'preference', project: 'x', at: 1, synced: false },
    ])
    expect(d.learnings.map(l => l.id)).toEqual(['b'])
    expect(addPref(emptyData(), 'token: abcdefgh1234').prefs).toEqual([])
  })
})

describe('triggers', () => {
  test('turn counting and nudge trigger', () => {
    let d = emptyData()
    const fired: number[] = []
    for (let i = 1; i <= 12; i++) {
      d = countTurn(d)
      if (shouldNudge(d.turns, 6)) fired.push(d.turns)
    }
    expect(fired).toEqual([6, 12])
  })

  test('skill proposal trigger', () => {
    expect(shouldProposeSkill(7, false, 8)).toBe(false)
    expect(shouldProposeSkill(8, false, 8)).toBe(true)
    expect(shouldProposeSkill(2, true, 8)).toBe(true)
    expect(shouldProposeSkill(0, true, 8)).toBe(false)
    expect(isCorrection("no, that's wrong, use the other file")).toBe(true)
    expect(isCorrection('please add a button')).toBe(false)
  })
})

describe('approval flow', () => {
  test('ask mode queues and writes nothing until approved', () => {
    expect(routeProposal('ask')).toBe('queue')
    const d = queueProposal(emptyData(), proposal())
    expect(d.pending).toHaveLength(1)
    // queuing is state only: the plan (the only thing that writes) is produced on approval
    const plan = planApproval(d.pending[0], 'C:/Users/x', new Set())
    expect(plan.error).toBeUndefined()
    expect(plan.write?.path).toBe('C:/Users/x/.claude/skills/run-tests/SKILL.md')
    expect(plan.write?.content.startsWith('---\nname: run-tests\ndescription: "')).toBe(true)
    expect(dropProposal(d, 'p1').pending).toHaveLength(0)
  })

  test('auto mode approves at once', () => {
    expect(routeProposal('auto')).toBe('approve')
  })

  test('writes stay inside the skills folder', () => {
    expect(sanitizeName('../../etc/passwd')).toBe('etc-passwd')
    expect(planApproval(proposal({ name: '../x' }), 'C:/Users/x', new Set()).error).toBeDefined()
    expect(planApproval(proposal({ name: 'a/b' }), 'C:/Users/x', new Set()).error).toBeDefined()
    expect(planApproval(proposal(), '', new Set()).error).toBeDefined()
  })

  test('only learner-owned skills are rewritten, merged or pruned', () => {
    expect(planApproval(proposal({ action: 'rewrite' }), 'C:/u', new Set()).error).toBeDefined()
    expect(planApproval(proposal({ action: 'rewrite' }), 'C:/u', new Set(['run-tests'])).write).toBeDefined()
    expect(planApproval(proposal({ action: 'prune' }), 'C:/u', new Set(['run-tests'])).remove).toBe('run-tests')
    expect(planApproval(proposal(), 'C:/u', new Set(['run-tests'])).error).toBeDefined()
    const merge = planApproval(proposal({ action: 'merge', mergeInto: 'other' }), 'C:/u', new Set(['run-tests', 'other']))
    expect(merge.write?.path).toBe('C:/u/.claude/skills/other/SKILL.md')
    expect(merge.remove).toBe('run-tests')
  })

  test('skill markdown has valid frontmatter and no secrets', () => {
    const md = buildSkillMd(proposal({ body: 'Use token: abcdefgh1234 here and then do plenty of other things.' }))
    expect(md).toMatch(/^---\nname: run-tests\ndescription: ".+"\n---\n\n/)
    expect(md).not.toContain('abcdefgh1234')
  })

  test('model replies parse into proposals and facts', () => {
    const p = parseProposal('```json\n{"name":"Run Tests","description":"Use when running the test suite safely.","body":"1. Build it.\\n2. Run the tests.\\n3. Read the failures first.","reason":"x"}\n```', 'create', 'p9', 5)
    expect(p?.name).toBe('run-tests')
    expect(parseProposal('{"skip":true}', 'create', 'p', 1)).toBeNull()
    const n = parseNudge('{"facts":[{"text":"Uses pnpm","kind":"fact"},"Ships on Fridays"],"preferences":["short answers"]}')
    expect(n.facts).toHaveLength(2)
    expect(n.prefs).toEqual(['short answers'])
  })

  test('weak skills are found from use', () => {
    const now = 100 * 86_400_000
    const d = {
      ...emptyData(),
      skills: {
        good: { uses: 5, corrections: 0, lastUsed: now, created: 0 },
        bad: { uses: 5, corrections: 3, lastUsed: now, created: 0 },
        idle: { uses: 0, corrections: 0, lastUsed: 0, created: 0 },
      },
    }
    expect(weakSkills(d, now)).toEqual([
      { name: 'bad', why: 'corrected' },
      { name: 'idle', why: 'unused' },
    ])
  })
})

describe('token cap', () => {
  test('stops the learner when exceeded and resets on a new day', () => {
    const day1 = Date.UTC(2026, 0, 1, 12)
    let d = addUsage(emptyData(), 900, day1)
    expect(isOverCap(d, 1000, day1)).toBe(false)
    expect(isOverCap(d, 1000, day1, 200)).toBe(true)
    d = addUsage(d, 200, day1)
    expect(isOverCap(d, 1000, day1)).toBe(true)
    expect(isOverCap(d, 1000, day1 + 86_400_000)).toBe(false)
    expect(isOverCap(d, 0, day1)).toBe(false)
  })
})

describe('hindsight', () => {
  test('curl never carries the key value, only the variable name', () => {
    const cfg = parseConfig({ hindsightBaseUrl: 'https://hs.example.com', hindsightApiKeyEnv: 'MY_KEY' })
    expect(isConfigured(cfg)).toBe(true)
    const argv = curlArgv(cfg, { method: 'POST', path: '/v1/default/banks/b/reflect', body: { query: 'q' } }, true)
    expect(argv).toContain('%MY_KEY')
    expect(argv.join(' ')).toContain('Authorization: Bearer {{MY_KEY}}')
    expect(curlArgv(cfg, { method: 'GET', path: '/x' }, false).join(' ')).not.toContain('Authorization')
  })

  test('unconfigured or failed responses fall back to the local index', () => {
    expect(isConfigured(parseConfig({}))).toBe(false)
    expect(parseCurl('<html>bad gateway</html>\n502').status).toBe(502)
    expect(parseCurl('{"results":[]}\n200').status).toBe(200)
    const d = addLearnings(emptyData(), [
      { id: 'a', text: 'Deploys go through Coolify on the VPS', kind: 'fact', project: 'x', at: 1, synced: false },
    ])
    expect(searchLocal(d, 'how do deploys work with coolify')).toEqual(['Deploys go through Coolify on the VPS'])
  })

  test('recall tool answers from the local store when Hindsight is down', { options: { hindsightBaseUrl: 'https://hs.example.com' } }, async ($, on) => {
    mock.store(on, {})
    mock.env(on, {})
    const calls: string[][] = []
    on('process.run', (_$, e) => {
      calls.push([...(e as { argv: string[] }).argv])
      return { value: { exitCode: 7, stdout: '', stderr: 'unreachable' } } as never
    })
    const r = await $.tool.call({ tool: 'mcp__self-improve__recall', query: 'anything' } as never)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(a => a[0] === 'curl')).toBe(true)
    expect(String((r as { text?: string; result?: unknown }).result ?? (r as { text?: string }).text)).toContain('Nothing found')
  })
})

describe('codegraph', () => {
  test('no hint and no excerpt without a .codegraph folder', () => {
    const without = buildSection({ prefs: ['Likes short answers'], recalled: [], isCodegraph: false, maxTokens: 600 })
    expect(without).not.toContain('codegraph_explore')
    const withCg = buildSection({ prefs: [], recalled: [], isCodegraph: true, maxTokens: 600 })
    expect(withCg).toContain('codegraph_explore')
  })
})

describe('prompt.compose budget', () => {
  test('stays within maxInjectTokens', () => {
    const prefs = Array.from({ length: 40 }, (_, i) => `Preference number ${i} with some extra words to take up room`)
    const recalled = Array.from({ length: 40 }, (_, i) => `Memory ${i}: ${'long text '.repeat(40)}`)
    for (const max of [50, 120, 600, 4000]) {
      const text = buildSection({ prefs, recalled, isCodegraph: true, maxTokens: max })
      expect(estimateTokens(text)).toBeLessThanOrEqual(max)
    }
    expect(buildSection({ prefs: [], recalled: [], isCodegraph: false, maxTokens: 600 })).toBe('')
  })
})

describe('pane', () => {
  test('renders on terminal and desktop and never writes while drawing', async $ => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'self-improve',
        surface,
        component: 'Pane',
        requestId: 'self-improve',
        props: { title: 'Self improve', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
      })
      expect(await ui.find({ type: 'Text', text: /SELF IMPROVE/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Nothing waiting/ })).toBeDefined()
      await ui.unmount()
    }
  })
})

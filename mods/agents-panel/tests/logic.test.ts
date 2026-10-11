import { describe, expect, test } from 'claude-code/testing'

import type { AgentsPanelAgent } from '../types'
import { HATS, TINTS, critterOf, critterPixels, fnv1a, rasterOf, svgOf } from '../hooks/critter'
import {
  addSkill,
  agentBar,
  agentMetrics,
  bandLine,
  costOf,
  diffOf,
  emptyTurn,
  fileRows,
  groupAgents,
  headline,
  hookMessagesFrom,
  isMemoryPath,
  isServerFailure,
  mcpFromTools,
  mcpSummary,
  mcpTiles,
  memoryLine,
  mergeMcp,
  parseGitStatus,
  parseLearner,
  permissionText,
  questionText,
  shortModel,
  skillTiles,
  summaryOf,
  touchFile,
  windowOf,
} from '../hooks/logic'

const agent = (over: Partial<AgentsPanelAgent> = {}): AgentsPanelAgent => ({
  id: 'a1',
  description: 'Find the bug',
  type: 'Explore',
  status: 'running',
  startedAt: 0,
  ...over,
})

describe('headline', () => {
  const idle = emptyTurn()
  test('a pending question or permission wins', () => {
    const h = headline([{ id: 't', tool: 'Read', at: 1, path: 'F:/p/a.ts' }], { kind: 'question', text: 'Which colour?', tool: 'AskUserQuestion' }, idle, null)
    expect(h.title).toBe('Waiting for you')
    expect(h.detail).toBe('Which colour?')
    expect(h.isWaiting).toBe(true)
  })
  test('reading, editing, commands and other tools', () => {
    expect(headline([{ id: 't', tool: 'Read', at: 1, path: 'F:/p/src/a.ts' }], null, idle, null).title).toBe('Claude is reading a.ts in src')
    expect(headline([{ id: 't', tool: 'Grep', at: 1 }], null, idle, null).title).toBe('Claude is reading')
    expect(headline([{ id: 't', tool: 'Write', at: 1, path: 'F:/p/src/b.ts' }], null, idle, null).title).toBe('Claude is editing b.ts in src')
    const bash = headline([{ id: 't', tool: 'PowerShell', at: 1, command: 'npm   test' }], null, idle, null)
    expect(bash.title).toBe('Claude is running a command')
    expect(bash.detail).toBe('npm test')
    expect(headline([{ id: 't', tool: 'WebFetch', at: 1 }], null, idle, null).title).toBe('Claude is working')
  })
  test('the newest call in flight is the one shown', () => {
    const h = headline(
      [
        { id: '1', tool: 'Read', at: 1, path: 'F:/p/a.ts' },
        { id: '2', tool: 'Bash', at: 5, command: 'ls' },
      ],
      null,
      idle,
      null,
    )
    expect(h.title).toBe('Claude is running a command')
  })
  test('thinking, edited and idle, with the subline', () => {
    expect(headline([], null, { isRunning: true, edited: [] }, null).title).toBe('Claude is thinking')
    const edited = headline([], null, { isRunning: false, edited: ['F:/p/a.ts', 'F:/p/b.ts'], added: 3, removed: 1 }, 'F:/p/b.ts')
    expect(edited.title).toBe('Claude edited 2 files')
    expect(edited.detail).toBe('b.ts')
    expect([edited.added, edited.removed]).toEqual([3, 1])
    expect(edited.sub).toBe('last: b.ts')
    const one = headline([], null, { isRunning: false, edited: ['F:/p/a.ts'] }, null)
    expect(one.title).toBe('Claude edited 1 file')
    expect(one.added).toBeUndefined()
    const none = headline([], null, idle, null)
    expect(none.title).toBe('Claude is idle')
    expect(none.sub).toBe('no files touched yet')
  })
  test('question and permission texts', () => {
    expect(questionText({ questions: [{ question: 'Pick one?' }, { question: 'And?' }] })).toBe('Pick one? (+1 more)')
    expect(questionText({})).toBe('Claude has a question')
    expect(permissionText('Bash', { command: 'rm -rf build' })).toBe('Allow Bash: rm -rf build?')
    expect(permissionText('Edit', { file_path: 'C:\\p\\x.ts' })).toBe('Allow Edit on x.ts?')
    expect(permissionText('mcp__gh__issue', {})).toBe('Allow gh issue?')
    expect(permissionText('ExitPlanMode', {})).toBe('Approve the plan?')
  })
})

describe('files', () => {
  test('edited wins over read and the newest comes first', () => {
    let files = touchFile([], 'F:/p/a.ts', 'edit', 1, { added: 2, removed: 0 })
    files = touchFile(files, 'f:\\p\\A.ts', 'read', 2)
    files = touchFile(files, 'F:/p/b.ts', 'read', 3)
    expect(files.map(f => [f.path, f.kind])).toEqual([
      ['F:/p/b.ts', 'read'],
      ['f:\\p\\A.ts', 'edit'],
    ])
    expect(files[1]!.added).toBe(2)
  })
  test('five shown, then a count, with uncommitted files marked', () => {
    let files: ReturnType<typeof touchFile> = []
    for (let i = 0; i < 7; i++) files = touchFile(files, `F:/p/f${i}.ts`, 'read', i)
    const git = { root: 'F:/p', branch: 'main', changed: ['F:/p/f6.ts'] }
    const { rows, more } = fileRows(files, git)
    expect(rows.map(r => r.name)).toEqual(['f6.ts', 'f5.ts', 'f4.ts', 'f3.ts', 'f2.ts'])
    expect(rows[0]!.isUncommitted).toBe(true)
    expect(rows[1]!.isUncommitted).toBe(false)
    expect(more).toBe(2)
  })
  test('the diff an edit reports', () => {
    expect(diffOf('Edit', { structuredPatch: [{ lines: [' a', '-b', '+c', '+d'] }] })).toEqual({ added: 2, removed: 1 })
    expect(diffOf('Write', { type: 'create', content: 'x\ny\n', structuredPatch: [] })).toEqual({ added: 2, removed: 0 })
    expect(diffOf('NotebookEdit', { cell: 1 })).toBeUndefined()
    expect(diffOf('Edit', null)).toBeUndefined()
  })
  test('git status', () => {
    const g = parseGitStatus('## main...origin/main [ahead 1]\n M hooks/a.ts\nR  old.ts -> new.ts\n?? "with space.ts"\n', 'F:/p')
    expect(g.branch).toBe('main')
    expect(g.changed).toEqual(['F:/p/hooks/a.ts', 'F:/p/new.ts', 'F:/p/with space.ts'])
    expect(parseGitStatus('## No commits yet on dev\n', 'F:/p').branch).toBe('dev')
    expect(parseGitStatus('## HEAD (no branch)\n', 'F:/p').branch).toBe('detached HEAD')
  })
})

describe('critter', () => {
  test('FNV-1a matches the reference values', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
  })
  test('one id always gives the same critter, and ids cover every hat and tint', () => {
    expect(critterOf('agent-7')).toEqual(critterOf('agent-7'))
    const hats = new Set<string>()
    const tints = new Set<string>()
    const names = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const c = critterOf(`a${i}`)
      hats.add(c.hat)
      tints.add(c.tint)
      names.add(c.name)
    }
    expect([...hats].sort()).toEqual([...HATS].sort())
    expect([...tints].sort()).toEqual([...TINTS].sort())
    expect(names.size).toBeGreaterThan(50)
  })
  test('12x12 pixels; bobbing moves it down one pixel', () => {
    const up = critterPixels('x')
    expect(up.length).toBe(12)
    expect(up.every(r => r.length === 12)).toBe(true)
    const down = critterPixels('x', true)
    expect(down[0]!.every(p => p === -1)).toBe(true)
    expect(down.slice(1)).toEqual(up.slice(0, 11))
  })
  test('a 12 by 6 Raster on the terminal and an SVG that bobs only while running', () => {
    const r = rasterOf(critterPixels('x'))
    expect([r.columns, r.rows]).toEqual([12, 6])
    expect(r.cells.length).toBe((12 * 6 * 12 * 4) / 3)
    expect(svgOf('x', true)).toContain('animateTransform')
    expect(svgOf('x', false)).not.toContain('animateTransform')
  })
})

describe('metrics', () => {
  test('models, prices and windows', () => {
    expect(shortModel('claude-haiku-5-5')).toBe('Haiku 5.5')
    expect(shortModel('claude-sonnet-4-20250514')).toBe('Sonnet 4')
    expect(shortModel('claude-opus-4-8[1m]')).toBe('Opus 4.8')
    expect(shortModel('haiku')).toBe('Haiku')
    expect(shortModel(undefined)).toBeUndefined()
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    expect(Math.abs(costOf(usage, 'claude-haiku-5-5')! - 0.6)).toBeLessThan(1e-9)
    expect(Math.abs(costOf(usage, 'claude-opus-4-1-20250805')! - 90)).toBeLessThan(1e-9)
    expect(costOf(usage, 'some-other-model')).toBeUndefined()
    expect(windowOf('claude-haiku-4-5', null, null)).toBe(200_000)
    expect(windowOf('claude-haiku-5-5', null, null)).toBe(1_000_000)
    expect(windowOf('claude-opus-5-5', 'claude-opus-5-5', 200_000)).toBe(200_000)
    expect(windowOf('mystery', null, null)).toBeUndefined()
  })
  test('the metrics line leaves unknown parts out', () => {
    const full = agent({ ctxTokens: 36_800, window: 200_000, costUsd: 0.0012, isCostKnown: true, status: 'done', endedAt: 2_000 })
    expect(agentMetrics(full, 99_000)).toBe('ctx 18% · 36.8k ≈$0.001 0:02')
    expect(agentMetrics(agent(), 65_000)).toBe('1:05')
    expect(agentMetrics(agent({ ctxTokens: 500, costUsd: 0.5, isCostKnown: false }), 1000)).toBe('500 0:01')
  })
  test('the bar shows todos first, else context, else nothing', () => {
    expect(agentBar(agent({ todosDone: 1, todosTotal: 4, ctxTokens: 10, window: 100 }))).toMatchObject({ ratio: 0.25, kind: 'todos' })
    expect(agentBar(agent({ ctxTokens: 50, window: 100 }))).toMatchObject({ ratio: 0.5, kind: 'context' })
    expect(agentBar(agent())).toBeNull()
  })
})

describe('summaries', () => {
  test('cards sum known values over the visible agents', () => {
    const list = [
      agent({ id: 'a', ctxTokens: 50_000, costUsd: 0.004, isCostKnown: true, startedAt: 1000, status: 'done', endedAt: 3000 }),
      agent({ id: 'b', ctxTokens: 23_600, costUsd: 0.006, isCostKnown: true, startedAt: 2000, status: 'done', endedAt: 5000 }),
    ]
    expect(summaryOf(list, 60_000)).toEqual({ cost: '≈$0.01', tokens: '73.6k', time: '0:04' })
    const running = [...list, agent({ id: 'c', startedAt: 4000 })]
    expect(summaryOf(running, 61_000).time).toBe('1:00')
    expect(summaryOf([], 0)).toEqual({ cost: '—', tokens: '—', time: '—' })
  })
  test('groups hide cleared agents', () => {
    const list = [agent({ id: 'r' }), agent({ id: 'd', status: 'done', endedAt: 5 }), agent({ id: 'f', status: 'failed', endedAt: 9 })]
    const g = groupAgents(list, ['d'])
    expect(g.running.map(a => a.id)).toEqual(['r'])
    expect(g.finished.map(a => a.id)).toEqual(['f'])
    expect(g.visible).toHaveLength(2)
  })
  test('memory lines', () => {
    const base = { isLearnerInstalled: true, writes: [] }
    expect(memoryLine({ ...base, learner: { state: 'running', found: 0, saved: 0, review: 0 } })).toMatchObject({ text: 'Learning from this session…', isRunning: true })
    expect(memoryLine({ ...base, learner: { state: 'done', found: 3, saved: 2, review: 1 } }).text).toBe('Learned 3 lessons: 2 saved, 1 to review')
    expect(memoryLine({ ...base, learner: { state: 'error', found: 0, saved: 0, review: 0, error: 'Hindsight did not answer' } }).text).toBe('Memory: Hindsight did not answer')
    expect(memoryLine({ ...base, learner: null }).text).toBe('Memory: nothing learned yet')
    expect(memoryLine({ isLearnerInstalled: false, learner: null, writes: ['MEMORY.md', 'CLAUDE.md'] }).text).toBe('Memory: saved to MEMORY.md, CLAUDE.md')
    expect(parseLearner('{"state":"done","found":2,"saved":1,"review":1,"at":1,"cwd":"F:\\\\Proj"}', 'f:/proj')).toEqual({ state: 'done', found: 2, saved: 1, review: 1 })
    expect(parseLearner('{"state":"done","found":2,"cwd":"F:/other"}', 'F:/proj')).toBeNull()
    expect(parseLearner('not json', 'F:/proj')).toBeNull()
    expect(isMemoryPath('C:\\Users\\me\\.claude\\projects\\F--p\\memory\\notes.md')).toBe(true)
    expect(isMemoryPath('F:/p/CLAUDE.md')).toBe(true)
    expect(isMemoryPath('F:/p/README.md')).toBe(false)
  })
  test('band line', () => {
    const h = headline([], null, emptyTurn(), null)
    expect(bandLine(h, { root: 'F:/p', branch: 'main', changed: [] }, memoryLine({ isLearnerInstalled: false, learner: null, writes: [] }))).toBe(
      'Claude is idle · main · Memory: nothing learned yet',
    )
  })
})

describe('MCP and skill tiles', () => {
  test('servers from the context report, failures and the summary', () => {
    const connected = mcpFromTools([
      { name: 'mcp__git__status', serverName: 'git' },
      { name: 'mcp__claude_ai_Gmail__authenticate', serverName: 'claude.ai Gmail' },
      { name: 'mcp__claude_ai_Drive__search', serverName: 'claude.ai Drive' },
    ])
    expect(connected).toEqual([
      { server: 'git', state: 'connected' },
      { server: 'claude.ai Gmail', state: 'needs-auth' },
      { server: 'claude.ai Drive', state: 'connected' },
    ])
    const all = mergeMcp(connected, [{ server: 'web', state: 'failed', reason: 'MCP server "web" is not connected' }])
    expect(all.map(s => s.server)).toEqual(['web', 'claude.ai Gmail', 'claude.ai Drive', 'git'])
    expect(mcpSummary(all)).toBe('MCP · 2 connected · 1 needs sign-in · 1 failed')
    const tiles = mcpTiles(all)
    expect(tiles[1]).toMatchObject({ prefix: 'claude.ai', name: 'Gmail', word: 'needs sign-in' })
    expect(tiles[0]).toMatchObject({ name: 'web', word: 'failed', reason: 'MCP server "web" is not connected' })
    expect(isServerFailure('Error: MCP server is not connected')).toBe(true)
    expect(isServerFailure('Issue not found')).toBe(false)
  })
  test('skills: newest first, once each, plugin names split', () => {
    let list = addSkill([], 'pdf')
    list = addSkill(list, 'superpowers:brainstorming')
    list = addSkill(list, 'pdf')
    expect(list).toEqual(['pdf', 'superpowers:brainstorming'])
    expect(skillTiles(list)).toEqual([
      { key: 'pdf', name: 'pdf' },
      { key: 'superpowers:brainstorming', prefix: 'superpowers', name: 'brainstorming' },
    ])
  })
  test('SessionStart messages from a transcript, with their origin', () => {
    const lines = [
      { attachment: { type: 'hook_success', hookName: 'SessionStart:startup', hookEvent: 'SessionStart', command: 'node "C:\\h\\dist\\start-hook.js"', stdout: JSON.stringify({ systemMessage: '\u001b[38;2;0;1;2mH\u001b[0mindsight is tracking this repo' }) } },
      { attachment: { type: 'hook_system_message', hookName: 'SessionStart:startup', hookEvent: 'SessionStart', content: '\u001b[38;2;0;1;2mH\u001b[0mindsight is tracking this repo' } },
      { attachment: { type: 'hook_success', hookName: 'SessionStart:startup', hookEvent: 'SessionStart', command: '"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" session-start', stdout: JSON.stringify({ hookSpecificOutput: { additionalContext: 'x'.repeat(1500) } }) } },
      { attachment: { type: 'hook_additional_context', hookName: 'UserPromptSubmit', hookEvent: 'UserPromptSubmit', content: ['later'] } },
      { type: 'user', message: { content: 'hello' } },
    ]
    const out = hookMessagesFrom(lines.map(l => JSON.stringify(l)).join('\n'))
    expect(out).toEqual([
      { origin: 'start-hook.js', text: 'Hindsight is tracking this repo' },
      { origin: 'plugin hook: hooks/run-hook.cmd session-start', text: 'Added context for Claude (1.5k characters)' },
    ])
  })
})

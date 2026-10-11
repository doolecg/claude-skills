import { describe, expect, test } from 'claude-code/testing'

import {
  agentRows, bandText, baseName, categoryRows, classifySquares, compactLeft, emptySquares, footerText, formatPercent,
  formatTokens, isEmpty, isNarrow, lastResponseText, layoutGrid, legendColor, levelFor, mcpGroups, memoryRows,
  meterBar, meterOf, orderCategories, rasterOf, resolveColor, schemeFor, shortModel, shouldToast, skillOrigin,
  skillRows, svgOf, themeOf, toBase64,
} from '../hooks/logic'
import { PARTS_37, makeUsage, usageAt } from './builder'
import { REAL_USAGE } from './fixture-real'

const real = REAL_USAGE.context.breakdown
const b37 = makeUsage({ window: 200_000, parts: PARTS_37, buffer: 33_000 }).context.breakdown

describe('numbers', () => {
  test('tokens are short', () => {
    expect(formatTokens(73_600)).toBe('73.6k')
    expect(formatTokens(200_000)).toBe('200k')
    expect(formatTokens(1_000_000)).toBe('1M')
    expect(formatTokens(967_000)).toBe('967k')
    expect(formatTokens(812)).toBe('812')
    expect(formatTokens(3246)).toBe('3.2k')
    expect(formatPercent(0.04)).toBe('<0.1%')
    expect(formatPercent(3.3)).toBe('3.3%')
    expect(formatPercent(91.2)).toBe('91%')
    expect(shortModel('claude-haiku-5-5')).toBe('Haiku 5.5')
  })
})

describe('thresholds', () => {
  test('amber at 70 and red at 85 of the auto-compact point', () => {
    expect(levelFor(0.69)).toBe('ok')
    expect(levelFor(0.7)).toBe('amber')
    expect(levelFor(0.85)).toBe('red')
    // threshold is 167k: 70% = 116,900 and 85% = 141,950
    expect(meterOf(usageAt(116_000).context.breakdown).level).toBe('ok')
    expect(meterOf(usageAt(117_000).context.breakdown).level).toBe('amber')
    expect(meterOf(usageAt(142_000).context.breakdown).level).toBe('red')
  })
  test('with auto-compact off the window is the basis', () => {
    const off = (n: number) => usageAt(n, { autoCompact: false, buffer: 0 }).context.breakdown
    expect(meterOf(off(141_000)).level).toBe('amber')
    expect(meterOf(off(171_000)).level).toBe('red')
    expect(meterOf(off(100_000)).isAutoCompact).toBe(false)
    expect(footerText(off(100_000))).toBe('Auto-compact off')
    expect(compactLeft(off(1))).toBeNull()
  })
  test('band text and footer', () => {
    expect(bandText(b37)).toBe('ctx 37% · 73.6k / 200k')
    expect(footerText(b37)).toBe('Auto-compact at 167k (56% left)')
    expect(meterBar(0.5, 4)).toBe('██░░')
  })
  test('toast fires only in red, once, never when empty', () => {
    expect(shouldToast('red', false, false)).toBe(true)
    expect(shouldToast('red', true, false)).toBe(false)
    expect(shouldToast('amber', false, false)).toBe(false)
    expect(shouldToast('red', false, true)).toBe(false)
  })
})

describe('empty state', () => {
  test('no api usage means nothing reported yet', () => {
    expect(isEmpty(null)).toBe(true)
    expect(isEmpty(makeUsage({ window: 200_000, parts: PARTS_37, apiUsage: null }).context.breakdown)).toBe(true)
    expect(isEmpty(b37)).toBe(false)
    expect(emptySquares(false).flat()).toHaveLength(100)
    expect(emptySquares(true)[0]).toHaveLength(5)
    expect(lastResponseText(null)).toBe('Last response: none yet')
  })
})

describe('paths', () => {
  test('file names from windows and posix paths', () => {
    expect(baseName('C:\\Users\\dev\\.claude\\CLAUDE.md')).toBe('CLAUDE.md')
    expect(baseName('/home/dev/.claude/rules.md')).toBe('rules.md')
  })
})

describe('rows', () => {
  test('ordered by kind, not by name or engine order', () => {
    const rows = categoryRows(real)
    expect(rows.map(r => r.kind)).toEqual(['used', 'used', 'used', 'used', 'used', 'used', 'used', 'free', 'buffer', 'deferred', 'deferred'])
    expect(rows.map(r => r.name).slice(0, 3)).toEqual(['System prompt', 'System tools', 'MCP server instructions'])
    expect(rows[7]!.name).toBe('Free space')
    expect(rows[8]!.name).toBe('Autocompact buffer')
    expect(orderCategories([{ kind: 'buffer', n: 1 }, { kind: 'used', n: 2 }, { kind: 'free', n: 3 }]).map(c => c.n)).toEqual([2, 3, 1])
  })
  test('percent of the window, from the engine tokens', () => {
    const sys = categoryRows(b37)[0]!
    expect(Math.abs(sys.percent - 1.5)).toBeLessThan(1e-9)
    expect(sys.tokens).toBe(3000)
  })
  test('used rows add up to the engine total', () => {
    const used = categoryRows(real).filter(r => r.kind === 'used').reduce((a, r) => a + r.tokens, 0)
    expect(used).toBe(real.totalTokens)
  })
})

describe('grid', () => {
  test('recorded 1M window is 20 by 10; free squares are drawn as free, not as the colour they carry', () => {
    const grid = classifySquares(real.gridRows, real.categories)
    expect(grid).toHaveLength(10)
    expect(grid[0]).toHaveLength(20)
    expect(grid.flat().filter(s => s.shape === 'free')).toHaveLength(179)
    expect(grid.flat().filter(s => s.shape === 'buffer')).toHaveLength(7)
    expect(grid[0]![0]!.shape).toBe('partial')
    expect(grid[0]![1]!.shape).toBe('full')
  })
  test('narrow regroups to 5 wide, wide keeps 10 or 20', () => {
    const grid = classifySquares(b37.gridRows, b37.categories)
    expect(layoutGrid(grid, true)[0]).toHaveLength(5)
    expect(layoutGrid(grid, true)).toHaveLength(20)
    expect(layoutGrid(grid, false)[0]).toHaveLength(10)
    const big = classifySquares(real.gridRows, real.categories)
    expect(layoutGrid(big, false)[0]).toHaveLength(20)
    expect(layoutGrid(layoutGrid(big, true), false)[0]).toHaveLength(20)
    expect(isNarrow(79)).toBe(true)
    expect(isNarrow(80)).toBe(false)
    expect(isNarrow(undefined)).toBe(false)
  })
  test('squares keep their category so a highlight can find them', () => {
    const grid = classifySquares(b37.gridRows, b37.categories).flat()
    const count = (name: string) => grid.filter(s => s.category === name).length
    expect(count('System prompt')).toBeGreaterThan(0)
    expect(count('Messages')).toBeGreaterThan(count('System prompt'))
  })
})

describe('colours', () => {
  test('theme keys follow the scheme; subagent keys and hex resolve', () => {
    expect(resolveColor('success', 'dark')).toBe('#4eba65')
    expect(resolveColor('success', 'light')).toBe('#2c7a39')
    expect(resolveColor('purple_FOR_SUBAGENTS_ONLY', 'dark')).toBe('#af87ff')
    expect(resolveColor('#abcdef', 'dark')).toBe('#abcdef')
    expect(resolveColor('nonsense', 'dark')).toBe(resolveColor('inactive', 'dark'))
    expect(legendColor('claude', 'dark')).toBe('claude')
    expect(legendColor('green_FOR_SUBAGENTS_ONLY', 'dark')).toBe('#4eba65')
    expect(schemeFor('dark-daltonized')).toBe('dark')
    expect(schemeFor('light')).toBe('light')
    expect(schemeFor('auto')).toBe('neutral')
    expect(themeOf([{ key: 'verbose', value: true }, { key: 'theme', value: 'light' }])).toBe('light')
  })
  test('raster cells: base64 of little-endian u32 triplets, two columns a square', () => {
    expect(toBase64(Uint8Array.of(1, 2, 3, 4))).toBe('AQIDBA==')
    const grid = classifySquares(b37.gridRows, b37.categories)
    const r = rasterOf(layoutGrid(grid, false), 'dark', null)
    expect(r.columns).toBe(20)
    expect(r.rows).toBe(10)
    expect(r.cells.length).toBe(Math.ceil((20 * 10 * 12) / 3) * 4)
    expect(r.glyphs[0]!.startsWith('■ ')).toBe(true)
    expect(r.glyphs[9]!.includes('▒')).toBe(true)
    const dimmed = rasterOf(layoutGrid(grid, false), 'dark', 'Messages')
    expect(dimmed.cells).not.toBe(r.cells)
  })
  test('svg has one shape per square and dims what is not selected', () => {
    const grid = layoutGrid(classifySquares(b37.gridRows, b37.categories), false)
    const s = svgOf(grid, 'dark', null)
    expect(s.width).toBe(10 * 15 - 3)
    expect((s.source.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(100)
    expect(s.source).toContain('#af87ff')
    expect(svgOf(grid, 'dark', 'System prompt').source).not.toBe(s.source)
    expect(s.source).not.toContain('script')
  })
})

describe('lists', () => {
  test('biggest first', () => {
    const mem = memoryRows(real.memoryFiles)
    expect(mem[0]!.tokens).toBeGreaterThanOrEqual(mem[1]!.tokens)
    const groups = mcpGroups(real.mcpTools)
    expect(groups[0]!.total).toBeGreaterThanOrEqual(groups[1]!.total)
    expect(groups.every(g => g.tools.every((t, i) => i === 0 || g.tools[i - 1]!.tokens >= t.tokens))).toBe(true)
    expect(agentRows(b37.agents).map(a => a.agentType)).toEqual(['big', 'small'])
    expect(skillRows(b37.skills.skillFrontmatter).map(s => s.name)).toEqual(['plugin:large', 'tiny'])
  })
  test('mcp tools group by server with totals and strip the prefix', () => {
    const g = mcpGroups(b37.mcpTools)
    expect(g.map(x => x.server)).toEqual(['web', 'git'])
    expect(g[1]).toMatchObject({ total: 800, count: 2, onDemand: 0 })
    expect(g[0]).toMatchObject({ onDemand: 1 })
    expect(g[1]!.tools[0]!.name).toBe('git_diff')
  })
  test('skill origin', () => {
    expect(skillOrigin({ name: 'a', source: 'plugin', pluginName: 'p', tokens: 1 })).toBe('plugin: p')
    expect(skillOrigin({ name: 'a', source: 'userSettings', tokens: 1 })).toBe('your skills')
  })
  test('last response counts', () => {
    expect(lastResponseText(real.apiUsage)).toBe('Last response: input 2 · cache write 28.4k · cache read 27.8k · output 4')
  })
})

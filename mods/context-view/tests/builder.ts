// Builds a breakdown the way the engine's types describe it, for states the recorded one does not have.
export type Part = { name: string; tokens: number; color: string; kind?: 'used' | 'deferred' }

export function makeUsage(opts: {
  window: number
  parts: Part[]
  buffer?: number
  autoCompact?: boolean
  apiUsage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number } | null
  model?: string
  width?: number
}): any {
  const width = opts.width ?? 10
  const squares = width === 5 ? 100 : 100
  const used = opts.parts.filter(p => p.kind !== 'deferred')
  const total = used.reduce((a, p) => a + p.tokens, 0)
  const bufferTokens = opts.buffer ?? 0
  const free = Math.max(0, opts.window - total - bufferTokens)
  const categories: any[] = [
    ...opts.parts.map(p => ({
      name: p.name,
      tokens: p.tokens,
      color: p.color,
      isDeferred: p.kind === 'deferred',
      kind: p.kind ?? 'used',
    })),
    { name: 'Free space', tokens: free, color: 'promptBorder', isDeferred: false, kind: 'free' },
    ...(bufferTokens ? [{ name: 'Autocompact buffer', tokens: bufferTokens, color: 'inactive', isDeferred: false, kind: 'buffer' }] : []),
  ]
  const flat: any[] = []
  for (const c of categories.filter(c => c.kind !== 'deferred')) {
    const exact = (c.tokens / opts.window) * squares
    const whole = Math.floor(exact)
    const rest = exact - whole
    for (let i = 0; i < whole; i++) flat.push(sq(c, 1))
    if (rest > 0.05 && flat.length < squares) flat.push(sq(c, rest))
  }
  while (flat.length < squares) flat.push(sq(categories.find(c => c.kind === 'free'), 1))
  flat.length = squares
  const gridRows: any[][] = []
  for (let i = 0; i < flat.length; i += width) gridRows.push(flat.slice(i, i + width))
  const threshold = opts.autoCompact === false ? undefined : opts.window - bufferTokens
  return {
    startedAt: 0,
    rateLimits: [],
    context: {
      window: opts.window,
      breakdown: {
        categories,
        totalTokens: total,
        maxTokens: opts.window,
        rawMaxTokens: opts.window,
        autocompactSource: 'auto',
        percentage: Math.round((total / opts.window) * 100),
        gridRows,
        model: opts.model ?? 'claude-sonnet-5-5',
        memoryFiles: [
          { path: 'C:\\proj\\CLAUDE.md', type: 'Project', tokens: 900 },
          { path: 'C:\\Users\\dev\\.claude\\CLAUDE.md', type: 'User', tokens: 2400 },
        ],
        mcpTools: [
          { name: 'mcp__git__git_log', serverName: 'git', tokens: 300, isLoaded: true },
          { name: 'mcp__git__git_diff', serverName: 'git', tokens: 500, isLoaded: true },
          { name: 'mcp__web__fetch', serverName: 'web', tokens: 4000, isLoaded: false },
        ],
        agents: [
          { agentType: 'small', source: 'plugin', tokens: 50 },
          { agentType: 'big', source: 'userSettings', tokens: 400 },
        ],
        slashCommands: { totalCommands: 40, includedCommands: 38, tokens: 800 },
        skills: {
          totalSkills: 2,
          includedSkills: 2,
          tokens: 300,
          skillFrontmatter: [
            { name: 'tiny', source: 'userSettings', tokens: 20 },
            { name: 'plugin:large', source: 'plugin', pluginName: 'plugin', tokens: 280 },
          ],
        },
        autoCompactThreshold: threshold,
        isAutoCompactEnabled: opts.autoCompact !== false,
        apiUsage: opts.apiUsage === undefined ? { input_tokens: 5, output_tokens: 700, cache_read_input_tokens: total - 5, cache_creation_input_tokens: 0 } : opts.apiUsage,
      },
    },
  }
}

function sq(c: any, fullness: number) {
  return { color: c.color, isFilled: true, categoryName: c.name, tokens: c.tokens, percentage: 0, squareFullness: fullness }
}

export const PARTS_37: Part[] = [
  { name: 'System prompt', tokens: 3000, color: 'promptBorder' },
  { name: 'System tools', tokens: 14000, color: 'inactive' },
  { name: 'Memory files', tokens: 3300, color: 'claude' },
  { name: 'Skills', tokens: 300, color: 'warning' },
  { name: 'Messages', tokens: 53000, color: 'purple_FOR_SUBAGENTS_ONLY' },
  { name: 'MCP tools (deferred)', tokens: 4800, color: 'inactive', kind: 'deferred' },
]

// 73,600 of a 200,000 window, 33,000 buffer: auto-compact at 167,000.
export const usageAt = (total: number, extra: Partial<Parameters<typeof makeUsage>[0]> = {}) =>
  makeUsage({
    window: 200_000,
    buffer: 33_000,
    parts: [
      { name: 'System prompt', tokens: 3000, color: 'promptBorder' },
      { name: 'Messages', tokens: total - 3000, color: 'purple_FOR_SUBAGENTS_ONLY' },
      { name: 'MCP tools (deferred)', tokens: 4800, color: 'inactive', kind: 'deferred' },
    ],
    ...extra,
  })

import type {
  ContextAgent,
  ContextCategory,
  ContextGridSquare,
  ContextMcpTool,
  ContextMemoryFile,
  ContextSkill,
  ModelUsage,
  SessionContextBreakdown,
} from 'claude-code'

export type Level = 'ok' | 'amber' | 'red'
export type Scheme = 'dark' | 'light' | 'neutral'
export type Shape = 'full' | 'partial' | 'free' | 'buffer' | 'empty'

export const AMBER_AT = 0.7
export const RED_AT = 0.85
export const LIST_CAP = 15
export const MCP_TOOL_CAP = 8

const KIND_RANK: Record<string, number> = { used: 0, free: 1, buffer: 2, deferred: 3 }

export function formatTokens(n: number): string {
  const v = Math.max(0, Number(n) || 0)
  const trim = (x: number) => x.toFixed(1).replace(/\.0$/, '')
  if (v < 1000) return String(Math.round(v))
  if (v < 100_000) return trim(v / 1000) + 'k'
  if (v < 1_000_000) return Math.round(v / 1000) + 'k'
  return trim(v / 1_000_000) + 'M'
}

export function formatPercent(p: number): string {
  const v = Math.max(0, Number(p) || 0)
  if (v === 0) return '0%'
  if (v < 0.1) return '<0.1%'
  if (v < 10) return v.toFixed(1).replace(/\.0$/, '') + '%'
  return Math.round(v) + '%'
}

export function shortModel(model: string): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(model)
  if (!m) return model || '—'
  return `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}`
}

export function baseName(path: string): string {
  const parts = String(path).split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? String(path)
}

export function orderCategories<T extends { kind: string }>(categories: readonly T[]): T[] {
  return categories
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (KIND_RANK[a.c.kind] ?? 0) - (KIND_RANK[b.c.kind] ?? 0) || a.i - b.i)
    .map(x => x.c)
}

export type CategoryRow = {
  name: string
  tokens: number
  percent: number
  color: string
  kind: ContextCategory['kind']
}

export function categoryRows(b: SessionContextBreakdown): CategoryRow[] {
  const window = b.rawMaxTokens || b.maxTokens || 0
  return orderCategories(b.categories).map(c => ({
    name: c.name,
    tokens: c.tokens,
    percent: window > 0 ? (c.tokens / window) * 100 : 0,
    color: c.color,
    kind: c.kind,
  }))
}

export type Meter = {
  tokens: number
  window: number
  percent: number
  basis: number
  ratio: number
  level: Level
  isAutoCompact: boolean
}

export function levelFor(ratio: number): Level {
  if (ratio >= RED_AT) return 'red'
  if (ratio >= AMBER_AT) return 'amber'
  return 'ok'
}

export function meterOf(b: SessionContextBreakdown): Meter {
  const window = b.rawMaxTokens || b.maxTokens || 0
  const threshold = b.autoCompactThreshold
  const isAutoCompact = b.isAutoCompactEnabled && typeof threshold === 'number' && threshold > 0
  const basis = isAutoCompact ? (threshold as number) : window
  const ratio = basis > 0 ? b.totalTokens / basis : 0
  return {
    tokens: b.totalTokens,
    window,
    percent: Math.round(b.percentage),
    basis,
    ratio,
    level: levelFor(ratio),
    isAutoCompact,
  }
}

export function isEmpty(b: SessionContextBreakdown | null | undefined): boolean {
  return !b || b.apiUsage === null || b.apiUsage === undefined
}

export function bandText(b: SessionContextBreakdown): string {
  const m = meterOf(b)
  return `ctx ${m.percent}% · ${formatTokens(m.tokens)} / ${formatTokens(m.window)}`
}

export function meterBar(ratio: number, width = 12): string {
  const f = Math.max(0, Math.min(1, ratio))
  const n = Math.round(f * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

export function shouldToast(level: Level, hasToasted: boolean, empty: boolean): boolean {
  return !empty && level === 'red' && !hasToasted
}

export function compactLeft(b: SessionContextBreakdown): { threshold: number; leftPercent: number } | null {
  const m = meterOf(b)
  if (!m.isAutoCompact) return null
  const left = Math.max(0, Math.round(((m.basis - b.totalTokens) / m.basis) * 100))
  return { threshold: m.basis, leftPercent: left }
}

export function footerText(b: SessionContextBreakdown): string {
  const c = compactLeft(b)
  return c ? `Auto-compact at ${formatTokens(c.threshold)} (${c.leftPercent}% left)` : 'Auto-compact off'
}

export function lastResponseText(u: ModelUsage | null | undefined): string {
  if (!u) return 'Last response: none yet'
  return (
    `Last response: input ${formatTokens(u.input_tokens)} · cache write ${formatTokens(u.cache_creation_input_tokens)}` +
    ` · cache read ${formatTokens(u.cache_read_input_tokens)} · output ${formatTokens(u.output_tokens)}`
  )
}

// ---- grid ----

export type Square = {
  color: string
  shape: Shape
  category: string
  fullness: number
}

export function classifySquares(
  rows: readonly (readonly ContextGridSquare[])[],
  categories: readonly ContextCategory[],
): Square[][] {
  const kinds = new Map(categories.map(c => [c.name, c.kind]))
  return rows.map(row =>
    row.map(s => {
      const kind = kinds.get(s.categoryName)
      let shape: Shape
      if (kind === 'free') shape = 'free'
      else if (kind === 'buffer') shape = 'buffer'
      else if (!s.isFilled) shape = 'empty'
      else shape = s.squareFullness >= 0.7 ? 'full' : 'partial'
      return { color: s.color, shape, category: s.categoryName, fullness: s.squareFullness }
    }),
  )
}

export function emptySquares(narrow: boolean): Square[][] {
  const width = narrow ? 5 : 10
  const rows = narrow ? 20 : 10
  return Array.from({ length: rows }, () =>
    Array.from({ length: width }, () => ({ color: 'inactive', shape: 'empty' as Shape, category: '', fullness: 0 })),
  )
}

export function targetWidth(count: number, narrow: boolean): number {
  if (narrow) return 5
  return count >= 200 ? 20 : 10
}

export function layoutGrid<T>(rows: readonly (readonly T[])[], narrow: boolean): T[][] {
  const flat = rows.flat()
  const width = targetWidth(flat.length, narrow)
  if (rows.length > 0 && rows.every(r => r.length === width)) return rows.map(r => [...r])
  const out: T[][] = []
  for (let i = 0; i < flat.length; i += width) out.push(flat.slice(i, i + width))
  return out
}

export function isNarrow(bodyColumns: number | undefined): boolean {
  return typeof bodyColumns === 'number' && bodyColumns > 0 && bodyColumns < 80
}

// ---- colours ----

type Palette = Record<string, string>

const DARK: Palette = {
  text: '#ffffff', inverseText: '#000000', inactive: '#999999', subtle: '#505050', suggestion: '#b1b9f9',
  remember: '#b1b9f9', success: '#4eba65', error: '#ff6b80', warning: '#ffc107', merged: '#af87ff',
  claude: '#d77757', permission: '#b1b9f9', planMode: '#48968c', autoAccept: '#af87ff', promptBorder: '#888888',
  bashBorder: '#fd5db1', ide: '#4782c8', diffAdded: '#225c2b', diffRemoved: '#7a2936',
  diffAddedDimmed: '#47584a', diffRemovedDimmed: '#69484d', diffAddedWord: '#38a660', diffRemovedWord: '#b3596b',
}

const LIGHT: Palette = {
  text: '#000000', inverseText: '#ffffff', inactive: '#666666', subtle: '#afafaf', suggestion: '#5769f7',
  remember: '#5769f7', success: '#2c7a39', error: '#ab2b3f', warning: '#966c1e', merged: '#8700ff',
  claude: '#d77757', permission: '#5769f7', planMode: '#006666', autoAccept: '#8700ff', promptBorder: '#999999',
  bashBorder: '#ff0087', ide: '#4782c8', diffAdded: '#69db7c', diffRemoved: '#ffa8b4',
  diffAddedDimmed: '#c7e1cb', diffRemovedDimmed: '#fdd2d8', diffAddedWord: '#2f9d44', diffRemovedWord: '#d1454b',
}

// Mid tones that read on a dark or a light page, for a theme that is not plainly one or the other.
const NEUTRAL: Palette = {
  ...DARK,
  text: '#808080', inactive: '#8a8a8a', subtle: '#9a9a9a', suggestion: '#6f7ff0', remember: '#6f7ff0',
  success: '#3da556', error: '#e0485f', warning: '#d99a00', merged: '#9a6cff', permission: '#6f7ff0',
  promptBorder: '#8c8c8c', autoAccept: '#9a6cff',
}

const NAMED: Record<string, string> = {
  green: '#4eba65', purple: '#af87ff', red: '#ff6b80', blue: '#4782c8', yellow: '#ffc107',
  orange: '#e8833a', pink: '#fd5db1', cyan: '#3fb8c9', gray: '#999999', grey: '#999999',
}

export function schemeFor(themeValue: unknown): Scheme {
  const v = String(themeValue ?? '').toLowerCase()
  if (v.includes('dark')) return 'dark'
  if (v.includes('light')) return 'light'
  return 'neutral'
}

export function paletteFor(scheme: Scheme): Palette {
  return scheme === 'dark' ? DARK : scheme === 'light' ? LIGHT : NEUTRAL
}

// A theme key, a "<name>_FOR_SUBAGENTS_ONLY" key, or a raw colour, as a #rrggbb string.
export function resolveColor(key: string, scheme: Scheme): string {
  const palette = paletteFor(scheme)
  if (palette[key]) return palette[key]!
  if (/^#[0-9a-f]{6}$/i.test(key)) return key.toLowerCase()
  const sub = /^([a-z]+)_FOR_SUBAGENTS_ONLY$/i.exec(key)
  if (sub && NAMED[sub[1]!.toLowerCase()]) return NAMED[sub[1]!.toLowerCase()]!
  if (NAMED[key.toLowerCase()]) return NAMED[key.toLowerCase()]!
  return palette.inactive!
}

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16) & 0xffffff
}

export function mixHex(hex: string, toward: string, amount: number): string {
  const a = hexToInt(hex)
  const b = hexToInt(toward)
  const ch = (shift: number) => {
    const x = (a >> shift) & 255
    const y = (b >> shift) & 255
    return Math.round(x + (y - x) * amount)
  }
  return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')
}

export function pageColor(scheme: Scheme): string {
  return scheme === 'light' ? '#fafafa' : scheme === 'dark' ? '#1e1e1e' : '#808080'
}

function squareColor(sq: Square, scheme: Scheme, selected: string | null): string {
  const base = resolveColor(sq.shape === 'free' || sq.shape === 'empty' || sq.shape === 'buffer' ? 'subtle' : sq.color, scheme)
  const hex = sq.shape === 'buffer' ? resolveColor('inactive', scheme) : base
  const isDimmed = selected !== null && sq.category !== selected
  return isDimmed ? mixHex(hex, pageColor(scheme), 0.75) : hex
}

const GLYPH: Record<Shape, string> = { full: '■', partial: '▪', free: '□', buffer: '▒', empty: '□' }

export function glyphFor(shape: Shape): string {
  return GLYPH[shape]
}

export function toBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    const n = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0)
    out += chars[(n >> 18) & 63]! + chars[(n >> 12) & 63]!
    out += b1 === undefined ? '=' : chars[(n >> 6) & 63]!
    out += b2 === undefined ? '=' : chars[n & 63]!
  }
  return out
}

export const DEFAULT_BG = 0x01000000

// A Raster's cells: two columns per square (glyph, then a blank), one row per grid row.
export function rasterOf(
  grid: readonly (readonly Square[])[],
  scheme: Scheme,
  selected: string | null,
): { columns: number; rows: number; cells: string; glyphs: string[] } {
  const rows = grid.length
  const columns = Math.max(0, ...grid.map(r => r.length)) * 2
  const words = new Uint32Array(columns * rows * 3)
  const glyphs: string[] = []
  let i = 0
  for (const row of grid) {
    let line = ''
    for (let x = 0; x < columns / 2; x++) {
      const sq = row[x]
      const glyph = sq ? GLYPH[sq.shape] : ' '
      const fg = sq ? hexToInt(squareColor(sq, scheme, selected)) : 0
      line += glyph + ' '
      words[i++] = glyph.codePointAt(0)!
      words[i++] = fg
      words[i++] = DEFAULT_BG
      words[i++] = 0x20
      words[i++] = 0
      words[i++] = DEFAULT_BG
    }
    glyphs.push(line.trimEnd())
  }
  return { columns, rows, cells: toBase64(new Uint8Array(words.buffer)), glyphs }
}

export const CELL = 12
export const GAP = 3

export function svgOf(grid: readonly (readonly Square[])[], scheme: Scheme, selected: string | null): { source: string; width: number; height: number } {
  const cols = Math.max(0, ...grid.map(r => r.length))
  const width = cols * (CELL + GAP) - GAP
  const height = grid.length * (CELL + GAP) - GAP
  const parts: string[] = []
  grid.forEach((row, y) =>
    row.forEach((sq, x) => {
      const px = x * (CELL + GAP)
      const py = y * (CELL + GAP)
      const color = squareColor(sq, scheme, selected)
      if (sq.shape === 'full') {
        parts.push(`<rect x="${px}" y="${py}" width="${CELL}" height="${CELL}" rx="2" fill="${color}"/>`)
      } else if (sq.shape === 'partial') {
        const h = Math.max(2, Math.round(CELL * Math.min(1, Math.max(0, sq.fullness))))
        parts.push(`<rect x="${px + 0.5}" y="${py + 0.5}" width="${CELL - 1}" height="${CELL - 1}" rx="2" fill="none" stroke="${color}"/>`)
        parts.push(`<rect x="${px}" y="${py + CELL - h}" width="${CELL}" height="${h}" rx="2" fill="${color}"/>`)
      } else if (sq.shape === 'buffer') {
        parts.push(`<rect x="${px + 0.5}" y="${py + 0.5}" width="${CELL - 1}" height="${CELL - 1}" rx="2" fill="none" stroke="${color}"/>`)
        parts.push(`<path d="M${px + 2} ${py + 2}L${px + CELL - 2} ${py + CELL - 2}M${px + CELL - 2} ${py + 2}L${px + 2} ${py + CELL - 2}" stroke="${color}" stroke-width="1.5"/>`)
      } else {
        parts.push(`<rect x="${px + 0.5}" y="${py + 0.5}" width="${CELL - 1}" height="${CELL - 1}" rx="2" fill="none" stroke="${color}"/>`)
      }
    }),
  )
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`
  return { source, width, height }
}

export function gridAlt(grid: readonly (readonly Square[])[], selected: string | null): string {
  const flat = grid.flat()
  const used = flat.filter(s => s.shape === 'full' || s.shape === 'partial').length
  const base = `Context window grid, ${grid[0]?.length ?? 0} squares wide: ${used} of ${flat.length} squares hold content`
  return selected ? `${base}. Highlighted: ${selected}` : base
}

// ---- lists ----

export type McpServerGroup = {
  server: string
  total: number
  count: number
  onDemand: number
  tools: { name: string; tokens: number; isLoaded: boolean }[]
}

export function memoryRows(files: readonly ContextMemoryFile[]): ContextMemoryFile[] {
  return [...files].sort((a, b) => b.tokens - a.tokens)
}

export function mcpGroups(tools: readonly ContextMcpTool[]): McpServerGroup[] {
  const by = new Map<string, McpServerGroup>()
  for (const t of tools) {
    let g = by.get(t.serverName)
    if (!g) {
      g = { server: t.serverName, total: 0, count: 0, onDemand: 0, tools: [] }
      by.set(t.serverName, g)
    }
    g.total += t.tokens
    g.count += 1
    if (!t.isLoaded) g.onDemand += 1
    g.tools.push({ name: shortToolName(t.name, t.serverName), tokens: t.tokens, isLoaded: t.isLoaded })
  }
  const groups = [...by.values()]
  for (const g of groups) g.tools.sort((a, b) => b.tokens - a.tokens)
  return groups.sort((a, b) => b.total - a.total)
}

export function shortToolName(name: string, server: string): string {
  const prefix = `mcp__${server}__`
  return name.startsWith(prefix) ? name.slice(prefix.length) : name
}

export function agentRows(agents: readonly ContextAgent[]): ContextAgent[] {
  return [...agents].sort((a, b) => b.tokens - a.tokens)
}

export function skillRows(skills: readonly ContextSkill[] | undefined): ContextSkill[] {
  return [...(skills ?? [])].sort((a, b) => b.tokens - a.tokens)
}

const SOURCE_LABEL: Record<string, string> = {
  userSettings: 'your skills',
  projectSettings: 'this project',
  plugin: 'plugin',
  'built-in': 'built in',
  mcp: 'MCP server',
  syncedSkills: 'synced skills',
}

export function skillOrigin(s: ContextSkill): string {
  const label = SOURCE_LABEL[s.source] ?? s.source
  return s.pluginName ? `${label}: ${s.pluginName}` : label
}

export function sectionTotal(items: readonly { tokens: number }[]): number {
  return items.reduce((a, b) => a + b.tokens, 0)
}

export function themeOf(rows: readonly { key: string; value: unknown }[]): Scheme {
  return schemeFor(rows.find(r => r.key === 'theme')?.value)
}

// A colour for a plain element prop: a theme key where the surface knows it (so it follows the theme), else a hex.
export function legendColor(key: string, scheme: Scheme): string {
  return DARK[key] ? key : resolveColor(key, scheme)
}

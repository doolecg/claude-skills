import type { BarFigures, BarMode, BarTool } from '../types'

export const EMPTY_FIGURES: BarFigures = {
  model: '',
  window: 0,
  effort: '',
  ctx: null,
  fiveHour: null,
  agents: 0,
}

export type Palette = {
  text: string
  dim: string
  sep: string
  border: string
  accent: string
  good: string
  warn: string
  bad: string
  info: string
  pillBg: string
  pillFg: string
  panel: string
}

// Claude's warm coral, cream and sage, softened for a dark terminal.
export const DARK: Palette = {
  text: '#E8E3D9',
  dim: '#8C877E',
  sep: '#55514A',
  border: '#4E4943',
  accent: '#D97757',
  good: '#9CC5A1',
  warn: '#E5C07B',
  bad: '#E08A8A',
  info: '#B9B4E8',
  pillBg: '#1F2C3D',
  pillFg: '#C9D3E0',
  panel: '#24201D',
}

export const LIGHT: Palette = {
  text: '#3D3929',
  dim: '#8A857C',
  sep: '#C9C3B8',
  border: '#D3CCC0',
  accent: '#C15F3C',
  good: '#4E7D57',
  warn: '#9A6B10',
  bad: '#B3474A',
  info: '#5A62B8',
  pillBg: '#E3E9F1',
  pillFg: '#2B3A4C',
  panel: '#FBF8F3',
}

export const paletteFor = (theme: unknown): Palette =>
  typeof theme === 'string' && theme.startsWith('light') ? LIGHT : DARK

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const

/** `claude-opus-5-5[1m]` or `Opus 5.5` → `Opus 5.5`; anything else as given. */
export function modelName(raw: string): string {
  const id = raw.trim().toLowerCase()
  for (const family of FAMILIES) {
    const at = id.indexOf(family)
    if (at < 0) continue
    const rest = id.slice(at + family.length).replace(/\[[^\]]*\]/g, '')
    const nums = (rest.match(/\d+/g) ?? []).filter(n => n.length < 3).slice(0, 2)
    const name = family[0]!.toUpperCase() + family.slice(1)
    return nums.length > 0 ? `${name} ${nums.join('.')}` : name
  }
  return raw.trim()
}

/** 1000000 → `1M`, 200000 → `200K`, 0 → ``. */
export function windowLabel(tokens: number): string {
  if (!(tokens > 0)) return ''
  if (tokens >= 1_000_000) return `${+(tokens / 1_000_000).toFixed(1)}M`
  return `${Math.round(tokens / 1000)}K`
}

export function effortLabel(effort: string | number | undefined | null): string {
  if (effort === undefined || effort === null) return ''
  return String(effort)
}

/** `isPress`: the one part a pickable segment's button holds, so its highlight is one colour. */
export type Part = { text: string; color: string; bold?: boolean; isPress?: boolean }
export type Segment = { key: string; parts: Part[] }

export const SEPARATOR = ' │ '

const level = (pct: number, pal: Palette): string =>
  pct >= 80 ? pal.bad : pct >= 60 ? pal.warn : pal.good

/** The bar's segments, left to right; a narrow bar drops them from the right. */
export function segments(f: BarFigures, pal: Palette): Segment[] {
  const out: Segment[] = []
  if (f.model) {
    const parts: Part[] = [
      { text: '◆ ', color: pal.accent },
      { text: f.model, color: pal.text, bold: true, isPress: true },
    ]
    const size = windowLabel(f.window)
    if (size) parts.push({ text: ' · ', color: pal.dim }, { text: size, color: pal.dim })
    out.push({ key: 'model', parts })
  }
  if (f.effort) {
    out.push({
      key: 'effort',
      parts: [
        { text: 'effort ', color: pal.dim },
        { text: f.effort, color: pal.info, bold: true, isPress: true },
      ],
    })
  }
  {
    const pct = f.ctx ?? 0
    const filled = Math.round(Math.min(Math.max(pct, 0), 100) / 10)
    const color = level(pct, pal)
    out.push({
      key: 'ctx',
      parts: [
        { text: 'ctx ', color: pal.dim },
        { text: '▰'.repeat(filled), color },
        { text: '▱'.repeat(10 - filled), color: pal.sep },
        { text: ` ${Math.round(pct)}%`, color },
      ],
    })
  }
  if (f.fiveHour !== null) {
    out.push({
      key: 'fiveHour',
      parts: [
        { text: '5h ', color: pal.dim },
        { text: `${Math.round(f.fiveHour)}%`, color: level(f.fiveHour, pal) },
      ],
    })
  }
  out.push({
    key: 'agents',
    parts: [
      { text: f.agents > 0 ? '◆ ' : '◇ ', color: f.agents > 0 ? pal.info : pal.dim },
      { text: `${f.agents} agent${f.agents === 1 ? '' : 's'}`, color: f.agents > 0 ? pal.text : pal.dim },
    ],
  })
  return out
}

/** Columns from the start of the bar's row to where segment `key`'s text starts. */
export function segmentOffset(list: Segment[], key: string): number {
  let x = 0
  for (const [i, seg] of list.entries()) {
    if (i > 0) x += SEPARATOR.length
    if (seg.key === key) return x
    x += seg.parts.reduce((n, p) => n + [...p.text].length, 0)
  }
  return 0
}

/** The spaces either side of `n` columns of text so a row of pills lines up at `width`. */
export function pillPad(n: number, width = 12): [string, string] {
  if (n + 2 >= width) return [' ', ' ']
  const left = Math.floor((width - n) / 2)
  return [' '.repeat(left), ' '.repeat(width - n - left)]
}

export type ToolState = 'on' | 'off'

/** Reads whether a command's reply says it turned something on or off (`Diff panel shown`, `Guard is on`). */
export function stateFromReply(text: string): ToolState | undefined {
  const m = /\b(?:is|now|turned|switched|set)\s+(on|off)\b|\b(shown|hidden|enabled|disabled|opened|closed)\b/i.exec(text)
  if (!m) return undefined
  const word = (m[1] ?? m[2] ?? '').toLowerCase()
  return ['on', 'shown', 'enabled', 'opened'].includes(word) ? 'on' : 'off'
}

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** The `/config` model row's plain family aliases, in its order; the families when it has none. */
export function modelChoices(options: readonly string[] | undefined): string[] {
  const plain = (options ?? []).filter(o => (FAMILIES as readonly string[]).includes(o))
  return plain.length > 0 ? plain : [...FAMILIES]
}

/** `opus` → `Opus`, or the full name (`Opus 5.5`) when it is the model in use. */
export const modelChoiceLabel = (alias: string, current: string): string =>
  current.toLowerCase().startsWith(alias) ? current : alias[0]!.toUpperCase() + alias.slice(1)

export const sameFigures = (a: BarFigures, b: BarFigures): boolean =>
  a.model === b.model &&
  a.window === b.window &&
  a.effort === b.effort &&
  a.ctx === b.ctx &&
  a.fiveHour === b.fiveHour &&
  a.agents === b.agents

/** `clean-view` → `Clean View`, `superpowers:brainstorming` → `Brainstorming`. */
export function toolLabel(command: string): string {
  const name = command.includes(':') ? command.slice(command.lastIndexOf(':') + 1) : command
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}

/** A mod's own slash command: a plugin's, registered without a `plugin:` prefix. */
export const isModCommand = (c: BarTool): boolean => c.source === 'plugin' && !c.name.includes(':')

export function clip(text: string, room: number): string {
  const chars = [...text]
  if (room <= 0) return ''
  return chars.length <= room ? text : `${chars.slice(0, Math.max(0, room - 1)).join('')}…`
}

/** The picker's sections: what is in the pill, the mods, then any other command the filter finds. */
export function pickerSections(all: BarTool[], chosen: string[], query: string) {
  const q = query.trim().toLowerCase()
  const hit = (c: BarTool) =>
    !q || c.name.toLowerCase().includes(q) || c.plugin.toLowerCase().includes(q)
  const byName = new Map(all.map(c => [c.name, c]))
  const inPill = chosen.map(
    name => byName.get(name) ?? { name, description: 'not installed now', plugin: '', source: 'plugin' },
  )
  const mods = all.filter(c => isModCommand(c) && !chosen.includes(c.name) && hit(c))
  const others = q ? all.filter(c => !isModCommand(c) && !chosen.includes(c.name) && hit(c)).slice(0, 30) : []
  return { inPill, mods, others }
}

/**
 * A mod's `modes` value read off its `state.set`: `{ [command]: { label, isOn } }`.
 * Its entries replace that mod's earlier ones; anything malformed is left out.
 */
export function mergeModes(
  all: Record<string, BarMode>,
  plugin: string,
  value: unknown,
): Record<string, BarMode> {
  const next: Record<string, BarMode> = {}
  for (const [command, mode] of Object.entries(all)) if (mode.plugin !== plugin) next[command] = mode
  if (value && typeof value === 'object') {
    for (const [command, raw] of Object.entries(value as Record<string, unknown>)) {
      const m = raw as { label?: unknown; isOn?: unknown } | null
      if (!m || typeof m.isOn !== 'boolean') continue
      const label = typeof m.label === 'string' && m.label.trim() ? m.label.trim() : toolLabel(command)
      next[command] = { label, isOn: m.isOn, plugin }
    }
  }
  return next
}

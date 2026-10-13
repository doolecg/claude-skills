export type Kind = 'emails' | 'documents' | 'media' | 'research' | 'other'
export type Tab = 'today' | 'week' | 'month' | 'year'
export type Counts = Partial<Record<Kind, number>>
export type DayRecord = { tasks: number; kinds: Counts; models: Record<string, number> }
export type Days = Record<string, DayRecord>
export type Settings = { rate: number } & Record<Kind, number>
export type ToolUse = { tool: string; path?: string }

export const KINDS: readonly Kind[] = ['emails', 'documents', 'media', 'research', 'other']
export const TABS: readonly Tab[] = ['today', 'week', 'month', 'year']
export const KIND_LABEL: Record<Kind, string> = {
  emails: 'Emails',
  documents: 'Documents',
  media: 'Images and video',
  research: 'Research',
  other: 'Other',
}
export const TAB_LABEL: Record<Tab, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  year: 'Year',
}
export const DEFAULT_SETTINGS: Settings = {
  rate: 50,
  emails: 10,
  documents: 30,
  media: 20,
  research: 25,
  other: 10,
}

const MAIL = /mail|outlook|inbox/i
const MEDIA_TOOL = /image|video|photo|imagen|dalle|veo_|sora|midjourney|diffusion/i
const DOC_TOOL =
  /(^|[_\W])(docs?|slides?|sheets?|spreadsheets?|presentations?|pptx|docx|xlsx)([_\W]|$)/i
const RESEARCH_TOOL =
  /websearch|web_search|webfetch|web_fetch|transcript|browser_navigate|browser_snapshot|browser_find|read_page|get_page|youtube|scrape|apify/i
const MEDIA_FILE = /\.(png|jpe?g|gif|webp|svg|bmp|mp4|mov|webm|mkv|avi|mp3|wav)$/i
const DOC_FILE = /\.(docx?|pptx?|xlsx?|pdf|odt|ods|odp|rtf|csv|md)$/i
const WRITERS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

export const classify = (uses: readonly ToolUse[]): Kind => {
  const has = (test: (u: ToolUse) => boolean) => uses.some(test)
  if (has(u => MAIL.test(u.tool))) return 'emails'
  if (has(u => MEDIA_TOOL.test(u.tool) || (WRITERS.has(u.tool) && MEDIA_FILE.test(u.path ?? ''))))
    return 'media'
  if (has(u => DOC_TOOL.test(u.tool) || (WRITERS.has(u.tool) && DOC_FILE.test(u.path ?? ''))))
    return 'documents'
  if (has(u => RESEARCH_TOOL.test(u.tool))) return 'research'
  return 'other'
}

export const isTypedOrigin = (kind: string, text: string): boolean =>
  (kind === 'composer' || kind === 'bridge') && !text.trim().startsWith('/')

const pad2 = (n: number) => String(n).padStart(2, '0')

export const dayKey = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const parts = (key: string): [number, number, number] => {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number)
  return [y, m, d]
}

/** Steps whole days from local noon, so a clock change never skips or repeats a day. */
export const addDays = (key: string, n: number): string => {
  const [y, m, d] = parts(key)
  const date = new Date(y, m - 1, d + n, 12, 0, 0)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export const dayOfYear = (key: string): number => {
  const [y, m, d] = parts(key)
  const start = Date.UTC(y, 0, 1)
  return Math.round((Date.UTC(y, m - 1, d) - start) / 86400000) + 1
}

export const rangeKeys = (tab: Tab, today: string): string[] => {
  if (tab === 'today') return [today]
  if (tab === 'week') return lastDays(today, 7)
  if (tab === 'month') return lastDays(today, 30)
  const count = dayOfYear(today)
  return lastDays(today, count)
}

export const lastDays = (today: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => addDays(today, i - (count - 1)))

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const weekday = (key: string): string => {
  const [y, m, d] = parts(key)
  return WEEKDAYS[new Date(y, m - 1, d, 12).getDay()] ?? ''
}
export const monthName = (index: number): string => MONTHS[index] ?? ''
export const shortDate = (key: string): string => {
  const [, m, d] = parts(key)
  return `${d} ${monthName(m - 1)}`
}
export const longDate = (key: string): string => {
  const [y] = parts(key)
  return `${weekday(key)} ${shortDate(key)} ${y}`
}

export const dateSpan = (tab: Tab, today: string): string => {
  const keys = rangeKeys(tab, today)
  const first = keys[0] ?? today
  if (tab === 'today') return longDate(today)
  return `${shortDate(first)} - ${shortDate(today)} ${parts(today)[0]}`
}

export const TITLE: Record<Tab, string> = {
  today: 'TODAY',
  week: 'LAST 7 DAYS',
  month: 'LAST 30 DAYS',
  year: 'THIS YEAR',
}

export type Totals = { tasks: number; kinds: Required<Counts>; models: Record<string, number>; activeDays: number }

export const emptyKinds = (): Required<Counts> => ({
  emails: 0,
  documents: 0,
  media: 0,
  research: 0,
  other: 0,
})

export const sumDays = (days: Days, keys: readonly string[]): Totals => {
  const total: Totals = { tasks: 0, kinds: emptyKinds(), models: {}, activeDays: 0 }
  for (const key of keys) {
    const day = days[key]
    if (!day || day.tasks <= 0) continue
    total.tasks += day.tasks
    total.activeDays += 1
    for (const kind of KINDS) total.kinds[kind] += day.kinds[kind] ?? 0
    for (const [model, n] of Object.entries(day.models)) total.models[model] = (total.models[model] ?? 0) + n
  }
  return total
}

export const addTask = (days: Days, key: string, kind: Kind, model: string): Days => {
  const day = days[key] ?? { tasks: 0, kinds: {}, models: {} }
  return {
    ...days,
    [key]: {
      tasks: day.tasks + 1,
      kinds: { ...day.kinds, [kind]: (day.kinds[kind] ?? 0) + 1 },
      models: { ...day.models, [model]: (day.models[model] ?? 0) + 1 },
    },
  }
}

export const minutesFor = (kinds: Counts, settings: Settings): number =>
  KINDS.reduce((sum, kind) => sum + (kinds[kind] ?? 0) * settings[kind], 0)

export const hoursFor = (kinds: Counts, settings: Settings): number => minutesFor(kinds, settings) / 60

export const dollarsFor = (kinds: Counts, settings: Settings): number =>
  Math.round(hoursFor(kinds, settings) * settings.rate)

/** Days in a row with a finished task, counting back from today (or from yesterday while today is still empty). */
export const streak = (days: Days, today: string): number => {
  let key = (days[today]?.tasks ?? 0) > 0 ? today : addDays(today, -1)
  let n = 0
  while ((days[key]?.tasks ?? 0) > 0) {
    n += 1
    key = addDays(key, -1)
  }
  return n
}

export const modelName = (id: string): string =>
  id.replace(/^claude-/, '').replace(/-\d{8}$/, '') || 'unknown'

export const formatHours = (h: number): string => (h >= 100 ? String(Math.round(h)) : h.toFixed(1))

export type Bar = { label: string; value: number; isNow: boolean }

export const chartBars = (tab: Tab, days: Days, today: string): Bar[] => {
  if (tab === 'year') {
    const [y, m] = parts(today)
    return MONTHS.map((name, i) => {
      let value = 0
      if (i + 1 <= m) {
        const first = `${y}-${pad2(i + 1)}-01`
        const last = i + 1 === m ? today : addDays(`${y}-${pad2(i + 2)}-01`, -1)
        const span = dayOfYear(last) - dayOfYear(first) + 1
        value = sumDays(days, lastDays(last, span)).tasks
      }
      return { label: name, value, isNow: i + 1 === m }
    })
  }
  const count = tab === 'month' ? 30 : 7
  return lastDays(today, count).map(key => ({
    label: tab === 'month' ? String(parts(key)[2]) : weekday(key),
    value: days[key]?.tasks ?? 0,
    isNow: key === today,
  }))
}

const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

/** Three rows (top first) of block characters for one bar of `eighths` out of 24. */
export const barCells = (eighths: number): [string, string, string] => {
  const cell = (row: number) => BLOCKS[Math.max(0, Math.min(8, eighths - (2 - row) * 8))] ?? ' '
  return [cell(0), cell(1), cell(2)]
}

export type ChartRows = {
  rows: [Seg[], Seg[], Seg[]]
  labels: string
}
export type Seg = { text: string; isNow: boolean }

export const buildChart = (bars: readonly Bar[], width: number): ChartRows => {
  const count = Math.max(1, bars.length)
  const slot = Math.max(1, Math.min(8, Math.floor(width / count)))
  const barWidth = slot >= 2 ? slot - 1 : 1
  const max = Math.max(1, ...bars.map(b => b.value))
  const rows: [Seg[], Seg[], Seg[]] = [[], [], []]
  let labels = ''
  bars.forEach((bar, i) => {
    const eighths = bar.value <= 0 ? 0 : Math.max(1, Math.round((bar.value / max) * 24))
    const cells = barCells(eighths)
    for (let r = 0; r < 3; r++) {
      const text = (cells[r] ?? ' ').repeat(barWidth) + ' '.repeat(slot - barWidth)
      rows[r]?.push({ text, isNow: bar.isNow })
    }
    const full = bar.label
    const label = full.length <= slot - (slot > 1 ? 1 : 0) ? full : full.slice(0, Math.max(0, slot - 1))
    const start = i * slot
    if (labels.length <= start && label !== '' && (slot >= 3 || i % 5 === 0 || bars.length <= 12)) {
      labels = labels.padEnd(start, ' ') + label
    }
  })
  return { rows, labels }
}

const FONT: Record<string, [string, string, string]> = {
  '0': ['┏━┓', '┃ ┃', '┗━┛'],
  '1': ['╺┓ ', ' ┃ ', '╺┻╸'],
  '2': ['╺━┓', '┏━┛', '┗━╸'],
  '3': ['╺━┓', ' ━┫', '╺━┛'],
  '4': ['╻ ╻', '┗━┫', '  ╹'],
  '5': ['┏━╸', '┗━┓', '╺━┛'],
  '6': ['┏━╸', '┣━┓', '┗━┛'],
  '7': ['╺━┓', '  ┃', '  ╹'],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '╺━┛'],
  '.': [' ', ' ', '╻'],
  $: [' ', '$', ' '],
}

/** Three rows of heavy box-drawing numerals, or undefined when the text needs a glyph the font lacks. */
export const bigNumber = (text: string): [string, string, string] | undefined => {
  const out: [string, string, string] = ['', '', '']
  for (const ch of text) {
    const glyph = FONT[ch]
    if (!glyph) return undefined
    const sep = out[0] === '' ? '' : ' '
    out[0] += sep + glyph[0]
    out[1] += sep + glyph[1]
    out[2] += sep + glyph[2]
  }
  return out
}

export const tileCount = (width: number): number => (width >= 66 ? 3 : width >= 44 ? 2 : 1)

export const parseSettingsArgs = (
  args: string,
  settings: Settings,
): { settings: Settings; text: string } => {
  const words = args.trim().split(/\s+/).filter(Boolean)
  if (words[0]?.toLowerCase() !== 'settings') return { settings, text: '' }
  const list = `Estimates: rate $${settings.rate}/hour, minutes per task: emails ${settings.emails}, documents ${settings.documents}, images ${settings.media}, research ${settings.research}, other ${settings.other}.`
  if (words.length === 1) return { settings, text: list }
  const name = (words[1] ?? '').toLowerCase()
  const key: keyof Settings | undefined =
    name === 'rate'
      ? 'rate'
      : name === 'emails' || name === 'documents' || name === 'research' || name === 'other'
        ? name
        : name === 'images' || name === 'media'
          ? 'media'
          : undefined
  const value = Number(words[2])
  if (key === undefined || words[2] === undefined || !Number.isFinite(value) || value < 0)
    return {
      settings,
      text: 'Use /report settings rate 75, or /report settings emails 15 (also documents, images, research, other).',
    }
  const next = { ...settings, [key]: value }
  return { settings: next, text: `Saved. ${parseSettingsArgs('settings', next).text}` }
}

import { expect, test } from 'claude-code/testing'

import {
  DEFAULT_SETTINGS,
  addDays,
  addTask,
  bigNumber,
  chartBars,
  classify,
  dayKey,
  dayOfYear,
  dollarsFor,
  isTypedOrigin,
  parseSettingsArgs,
  rangeKeys,
  streak,
  sumDays,
} from './hooks/logic'

test('sorts a task by the tools it used', async () => {
  expect(classify([{ tool: 'mcp__claude_ai_Gmail__create_draft' }])).toBe('emails')
  expect(classify([{ tool: 'mcp__x__generate_image' }])).toBe('media')
  expect(classify([{ tool: 'Write', path: 'a/report.docx' }])).toBe('documents')
  expect(classify([{ tool: 'mcp__claude_ai_Claude_Docs__create' }])).toBe('documents')
  expect(classify([{ tool: 'WebSearch' }, { tool: 'Read' }])).toBe('research')
  expect(classify([{ tool: 'Bash' }, { tool: 'Edit', path: 'a.ts' }])).toBe('other')
  expect(classify([])).toBe('other')
})

test('counts only typed prompts', async () => {
  expect(isTypedOrigin('composer', 'fix it')).toBe(true)
  expect(isTypedOrigin('bridge', 'fix it')).toBe(true)
  expect(isTypedOrigin('composer', '/report')).toBe(false)
  expect(isTypedOrigin('task-notification', 'done')).toBe(false)
  expect(isTypedOrigin('scheduled-trigger', 'go')).toBe(false)
})

test('streak counts days in a row, from yesterday while today is empty', async () => {
  let days = {}
  for (const k of ['2026-10-11', '2026-10-12', '2026-10-13']) days = addTask(days, k, 'other', 'm')
  expect(streak(days, '2026-10-13')).toBe(3)
  expect(streak(days, '2026-10-14')).toBe(3)
  expect(streak(days, '2026-10-16')).toBe(0)
})

test('adds days together and prices them', async () => {
  let days = {}
  days = addTask(days, '2026-10-12', 'emails', 'opus')
  days = addTask(days, '2026-10-13', 'emails', 'opus')
  days = addTask(days, '2026-10-13', 'documents', 'sonnet')
  const total = sumDays(days, rangeKeys('week', '2026-10-13'))
  expect(total.tasks).toBe(3)
  expect(total.kinds.emails).toBe(2)
  expect(total.models.opus).toBe(2)
  expect(total.activeDays).toBe(2)
  expect(dollarsFor(total.kinds, DEFAULT_SETTINGS)).toBe(Math.round((50 / 60) * 50))
})

test('day of year and day stepping are calendar-true', async () => {
  expect(dayOfYear('2026-01-01')).toBe(1)
  expect(dayOfYear('2026-12-31')).toBe(365)
  expect(dayOfYear('2028-12-31')).toBe(366)
  expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
  expect(addDays('2026-10-25', -1)).toBe('2026-10-24')
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  expect(rangeKeys('year', '2026-02-03')).toHaveLength(34)
  expect(rangeKeys('month', '2026-10-13')).toHaveLength(30)
  expect(dayKey(new Date(2026, 9, 13, 23, 59).getTime())).toBe('2026-10-13')
})

test('year chart leaves future months empty and marks the current one', async () => {
  const days = addTask({}, '2026-03-05', 'other', 'm')
  const bars = chartBars('year', days, '2026-05-10')
  expect(bars).toHaveLength(12)
  expect(bars[2]?.value).toBe(1)
  expect(bars[4]?.isNow).toBe(true)
  expect(bars[8]?.value).toBe(0)
})

test('big numerals are three rows, and refuse unknown glyphs', async () => {
  expect(bigNumber('12.5')?.length).toBe(3)
  expect(bigNumber('1e5')).toBeUndefined()
})

test('settings command lists and changes the estimate', async () => {
  expect(parseSettingsArgs('settings', DEFAULT_SETTINGS).text).toContain('$50/hour')
  const r = parseSettingsArgs('settings rate 75', DEFAULT_SETTINGS)
  expect(r.settings.rate).toBe(75)
  expect(parseSettingsArgs('settings emails 15', DEFAULT_SETTINGS).settings.emails).toBe(15)
  expect(parseSettingsArgs('settings bogus 1', DEFAULT_SETTINGS).settings).toEqual(DEFAULT_SETTINGS)
})

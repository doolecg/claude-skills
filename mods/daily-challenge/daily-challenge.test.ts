import { describe, expect, mock, test } from 'claude-code/testing'

import { CHALLENGES, THEMES, TOTAL } from './hooks/challenges'
import {
  EMPTY,
  bestStreak,
  bigNumber,
  canSwap,
  complete,
  currentStreak,
  dayKey,
  doneCount,
  isDone,
  isFinished,
  isTodayDone,
  nextInOrder,
  sanitize,
  shiftDay,
  swap,
  todayIdx,
  undo,
  wrap,
} from './hooks/logic'
import type { Progress } from './hooks/logic'

const NOON = Date.UTC(2026, 5, 10, 12, 0, 0)
const DAY_MS = 86_400_000
const SURFACES = ['terminal', 'desktop'] as const

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function finishAll(): Progress {
  const done: Record<string, string> = {}
  for (let i = 0; i < TOTAL; i++) done[String(i)] = shiftDay('2026-01-01', i)
  return { done, today: null }
}

describe('the 365 challenges', () => {
  test('there are exactly 365 with no repeated title or task', () => {
    expect(CHALLENGES.length).toBe(365)
    expect(new Set(CHALLENGES.map(c => c.title.toLowerCase())).size).toBe(365)
    expect(new Set(CHALLENGES.map(c => c.task.toLowerCase())).size).toBe(365)
  })

  test('titles are two to five words and tasks are one or two sentences', () => {
    for (const c of CHALLENGES) {
      const words = c.title.trim().split(/\s+/).length
      expect(words >= 2 && words <= 5).toBe(true)
      const sentences = c.task.split(/(?<=[.?!])\s+/).filter(Boolean).length
      expect(sentences >= 1 && sentences <= 2).toBe(true)
      expect(c.task.length > 20).toBe(true)
    }
  })

  test('seven themes of 52 plus one closer', () => {
    for (const t of THEMES) {
      expect(CHALLENGES.filter(c => c.theme === t.name).length).toBe(52)
    }
    expect(CHALLENGES.filter(c => c.theme === 'Finale').length).toBe(1)
    expect(CHALLENGES[364]!.theme).toBe('Finale')
  })

  test('any seven days in a row touch all seven themes', () => {
    for (let start = 0; start + 7 <= 364; start++) {
      const seen = new Set(CHALLENGES.slice(start, start + 7).map(c => c.theme))
      expect(seen.size).toBe(7)
    }
  })

  test('no talking down and no unconfirmed commands', () => {
    const known = new Set(['help', 'clear', 'compact', 'model', 'config', 'context', 'mcp', 'cost', 'skills', 'add-dir'])
    for (const c of CHALLENGES) {
      expect(/lazy|dumb|stupid/i.test(c.title + ' ' + c.task)).toBe(false)
      for (const m of (c.title + ' ' + c.task).matchAll(/(?:^|\s)\/([a-z][a-z-]*)/g)) {
        expect(known.has(m[1]!)).toBe(true)
      }
    }
  })
})

describe('picking', () => {
  test('the next pick is always the lowest never-completed one', () => {
    let p = EMPTY
    for (let d = 0; d < 20; d++) {
      const day = shiftDay('2026-03-01', d)
      expect(todayIdx(p, day)).toBe(d)
      p = complete(p, day)
      expect(isDone(p, d)).toBe(true)
    }
    expect(nextInOrder(p)).toBe(20)
  })

  test('a missed day keeps the same challenge waiting', () => {
    let p = complete(EMPTY, '2026-03-01')
    const waiting = todayIdx(p, '2026-03-02')
    expect(todayIdx(p, '2026-03-03')).toBe(waiting)
    expect(todayIdx(p, '2026-03-20')).toBe(waiting)
  })

  test('a swap picks a never-completed one and is remembered all day', () => {
    const rand = seeded(7)
    let p = EMPTY
    for (let d = 0; d < 30; d++) p = complete(p, shiftDay('2026-01-01', d))
    const day = '2026-02-15'
    for (let i = 0; i < 200; i++) {
      const before = todayIdx(p, day)
      const q = swap(p, day, rand)
      const after = todayIdx(q, day)!
      expect(isDone(q, after)).toBe(false)
      expect(after).not.toBe(before)
      expect(todayIdx(q, day)).toBe(after)
      p = q
    }
    expect(todayIdx(p, day)).toBe(p.today!.idx)
  })

  test('a swapped-away challenge is still offered later', () => {
    const p = swap(EMPTY, '2026-03-01', () => 0.99)
    expect(todayIdx(p, '2026-03-01')).toBe(361)
    expect(isDone(p, 0)).toBe(false)
    expect(todayIdx(p, '2026-03-02')).toBe(0)
  })

  test('a completed challenge is never offered by pick or swap', () => {
    const rand = seeded(3)
    let p = EMPTY
    for (let d = 0; d < 360; d++) {
      const day = shiftDay('2025-01-01', d)
      if (d % 3 === 0) p = swap(p, day, rand)
      const idx = todayIdx(p, day)!
      expect(isDone(p, idx)).toBe(false)
      p = complete(p, day)
    }
    expect(doneCount(p)).toBe(360)
  })

  test('swap is refused once today is complete or nothing else is left', () => {
    const p = complete(EMPTY, '2026-03-01')
    expect(canSwap(p, '2026-03-01')).toBe(false)
    expect(swap(p, '2026-03-01', () => 0.5)).toBe(p)
    const nearly = finishAll()
    delete nearly.done['100']
    expect(canSwap(nearly, '2026-05-01')).toBe(false)
  })

  test('finished state after all 365', () => {
    const p = finishAll()
    expect(isFinished(p)).toBe(true)
    expect(todayIdx(p, '2027-02-01')).toBe(null)
    expect(complete(p, '2027-02-01').today).toBe(null)
  })

  test('undo reopens today and the same challenge returns', () => {
    const day = '2026-03-01'
    const p = complete(EMPTY, day)
    expect(isTodayDone(p, day)).toBe(true)
    const q = undo(p, day)
    expect(isTodayDone(q, day)).toBe(false)
    expect(todayIdx(q, day)).toBe(0)
    expect(undo(complete(EMPTY, '2026-03-01'), '2026-03-02')).toEqual(complete(EMPTY, '2026-03-01'))
  })
})

describe('streaks', () => {
  function withDays(days: string[]): Progress {
    const done: Record<string, string> = {}
    days.forEach((d, i) => (done[String(i)] = d))
    return { done, today: null }
  }

  test('counts through yesterday until today is done', () => {
    const p = withDays(['2026-03-01', '2026-03-02', '2026-03-03'])
    expect(currentStreak(p, '2026-03-03')).toBe(3)
    expect(currentStreak(p, '2026-03-04')).toBe(3)
    expect(currentStreak(p, '2026-03-05')).toBe(0)
  })

  test('across several days with gaps, month ends and best run', () => {
    const p = withDays(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02', '2026-02-10', '2026-02-11'])
    expect(bestStreak(p)).toBe(4)
    expect(currentStreak(p, '2026-02-11')).toBe(2)
    expect(currentStreak(p, '2026-02-12')).toBe(2)
    expect(currentStreak(p, '2026-02-13')).toBe(0)
    expect(bestStreak(EMPTY)).toBe(0)
  })

  test('day helpers', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDay('2024-03-01', -1)).toBe('2024-02-29')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(dayKey(NOON)).toMatch(/^2026-06-(09|10|11)$/)
  })
})

describe('saved data and layout helpers', () => {
  test('a broken saved record loads cleanly', () => {
    expect(sanitize(null)).toEqual(EMPTY)
    expect(sanitize('x')).toEqual(EMPTY)
    const p = sanitize({ done: { '-1': '2026-01-01', '999': '2026-01-01', '5': 'bad', '6': '2026-01-02' }, today: { day: 'no', idx: 3 } })
    expect(p.done).toEqual({ '6': '2026-01-02' })
    expect(p.today).toBe(null)
  })

  test('wrapping and big numbers', () => {
    for (const line of wrap(CHALLENGES[0]!.task, 30)) expect(line.length <= 30).toBe(true)
    for (const n of [0, 7, 14, 365]) {
      const rows = bigNumber(n)
      expect(new Set(rows.map(r => r.length)).size).toBe(1)
    }
    expect(bigNumber(365)[0]!.length).toBe(11)
  })
})

describe('the pane', () => {
  const pane = (surface: 'terminal' | 'desktop', columns: number) => ({
    plugin: 'daily-challenge',
    surface,
    component: 'Pane' as const,
    requestId: 'daily-challenge',
    props: { title: 'Daily challenge', isFocused: false, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } } as never,
  })

  for (const surface of SURFACES) {
    for (const columns of [30, 46, 90]) {
      test(`draws the card and every button on ${surface} at ${columns} columns`, async ($, on) => {
        mock.store(on)
        mock.clock(on, { now: NOON })
        const ui = await $.ui.mount(pane(surface, columns))
        expect(await ui.find({ text: /TODAY'S CHALLENGE/ })).toBeDefined()
        expect(await ui.find({ text: CHALLENGES[0]!.title })).toBeDefined()
        expect(await ui.find({ key: 'complete' })).toBeDefined()
        expect(await ui.find({ key: 'coach' })).toBeDefined()
        expect(await ui.find({ key: 'another' })).toBeDefined()
        expect(await ui.find({ text: /If a command/ })).toBeDefined()
        await ui.unmount()
      })
    }

    test(`complete then undo on ${surface}`, async ($, on) => {
      mock.store(on)
      mock.clock(on, { now: NOON })
      const ui = await $.ui.mount(pane(surface, 60))
      await ui.press({ key: 'complete' })
      expect(await ui.find({ text: /Completed today/ })).toBeDefined()
      expect(await ui.find({ key: 'another' })).toBeUndefined()
      expect(await ui.find({ key: 'undo' })).toBeDefined()
      await ui.press({ key: 'undo' })
      expect(await ui.find({ key: 'complete' })).toBeDefined()
      await ui.unmount()
    })

    test(`give me another swaps and the swap stays on ${surface}`, async ($, on) => {
      mock.store(on)
      mock.clock(on, { now: NOON })
      const ui = await $.ui.mount(pane(surface, 60))
      expect(await ui.find({ text: CHALLENGES[0]!.title })).toBeDefined()
      await ui.press({ key: 'another' })
      expect(await ui.find({ text: CHALLENGES[0]!.title })).toBeUndefined()
      await ui.unmount()
      const again = await $.ui.mount(pane(surface, 60))
      expect(await again.find({ text: CHALLENGES[0]!.title })).toBeUndefined()
      await again.unmount()
    })

    test(`coach me fills the prompt and closes the pane on ${surface}`, async ($, on) => {
      mock.store(on)
      mock.clock(on, { now: NOON })
      let filled = ''
      let closed = false
      on('prompt.fill', (_$, e) => {
        filled = e.text
        return { isFilled: true }
      })
      on('ui.close', () => {
        closed = true
        return { value: undefined }
      })
      const ui = await $.ui.mount(pane(surface, 60))
      await ui.press({ key: 'coach' })
      expect(filled).toContain('one step at a time')
      expect(filled).toContain(CHALLENGES[0]!.title)
      expect(closed).toBe(true)
      await ui.unmount()
    })

    test(`finished screen on ${surface}`, async ($, on) => {
      mock.store(on, { progress: finishAll() })
      mock.clock(on, { now: NOON + 400 * DAY_MS })
      on('session.start', (_$, e) => ({ cwd: e.cwd }))
      await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
      const ui = await $.ui.mount(pane(surface, 60))
      expect(await ui.find({ text: /ALL 365 COMPLETE/ })).toBeDefined()
      expect(await ui.find({ key: 'complete' })).toBeUndefined()
      await ui.unmount()
    })
  }
})

describe('the command', () => {
  test('/challenge done, twice, then another', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: NOON })
    const first = await $.command.run({ command: 'challenge', args: 'done' })
    expect(first.text).toContain('Completed')
    expect(first.text).toContain('Streak 1 day')
    expect(first.text).toContain('1 of 365')
    const second = await $.command.run({ command: 'challenge', args: 'done' })
    expect(second.text).toContain('already complete')
    const swapped = await $.command.run({ command: 'challenge', args: 'another' })
    expect(swapped.text).toContain('already complete')
  })

  test('/challenge another swaps and /challenge replies at once', async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: NOON })
    const swapped = await $.command.run({ command: 'challenge', args: 'another' })
    expect(swapped.text).toContain('Swapped')
    const opened = await $.command.run({ command: 'challenge', args: '' })
    expect(opened.text).toContain('Opening')
    const bad = await $.command.run({ command: 'challenge', args: 'nonsense' })
    expect(bad.text).toContain('/challenge done')
  })
})

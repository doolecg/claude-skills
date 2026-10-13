import { expect, test } from 'claude-code/testing'

import { CARS, DEFAULT_PALETTE, QUESTIONS, RETRO_PALETTE, levelOf, levelXp } from './hooks/road-trip-art'
import {
  COUNTDOWN,
  FLAT_TICKS,
  act,
  addSteps,
  arrive,
  emptyProfile,
  encodeFrame,
  frameText,
  geo,
  newGame,
  renderFrame,
  resize,
  resume,
  sanitizeProfile,
  startQuizNow,
  step,
} from './hooks/road-trip-game'
import type { Game, Profile } from './hooks/road-trip-game'

const make = (patch: Partial<Profile> = {}, w = 90, h = 26): Game => {
  const g = newGame({ ...emptyProfile(), ...patch }, 7)
  resize(g, w, h)
  g.countdown = 0
  g.gap = 1e9
  g.quizIn = 1e9
  return g
}

const carRow = (g: Game): number => geo(g).carTop

test('a new game counts down, then drives and distance rises each tick', () => {
  const g = newGame(emptyProfile(), 3)
  resize(g, 90, 26)
  expect(g.countdown).toBe(COUNTDOWN)
  for (let i = 0; i < COUNTDOWN; i++) step(g)
  expect(g.countdown).toBe(0)
  expect(g.dist).toBe(0)
  let last = g.dist
  for (let i = 0; i < 10; i++) {
    step(g)
    expect(g.dist).toBeGreaterThan(last)
    last = g.dist
  }
})

test('an obstacle gives a flat tire and a fresh run; Agency Wagon ignores the first hit', () => {
  const g = make()
  g.dist = 500
  g.objs.push({ kind: 'barrier', lane: 1, y: carRow(g) - 0.1 })
  step(g)
  expect(g.flat).toBeGreaterThan(0)
  expect(g.msg).toBe('Flat tire!')
  for (let i = 0; i < FLAT_TICKS; i++) step(g)
  expect(g.flat).toBe(0)
  expect(g.dist).toBe(0)
  expect(g.countdown).toBeGreaterThan(0)
  expect(g.profile.best).toBeGreaterThan(0)

  const w = make({ owned: ['hatch', 'wagon'], car: 'wagon' })
  w.objs.push({ kind: 'cone', lane: 1, y: carRow(w) - 0.1 })
  step(w)
  expect(w.flat).toBe(0)
  expect(w.shieldUsed).toBe(true)
  w.objs.push({ kind: 'cone', lane: 1, y: carRow(w) - 0.1 })
  step(w)
  expect(w.flat).toBeGreaterThan(0)
})

test('a coin adds 1 to the bank and Founder GT adds 2', () => {
  const g = make()
  g.objs.push({ kind: 'coin', lane: 1, y: carRow(g) - 0.1 })
  step(g)
  expect(g.profile.bank).toBe(1)
  const gt = make({ owned: ['hatch', 'gt'], car: 'gt' })
  gt.objs.push({ kind: 'coin', lane: 1, y: carRow(gt) - 0.1 })
  step(gt)
  expect(gt.profile.bank).toBe(2)
})

test('finishing a Claude step drops a task coin worth 10, at most 3 queued', () => {
  const g = make()
  addSteps(g, 1)
  step(g)
  const task = g.objs.find(o => o.kind === 'task')
  expect(task).toBeDefined()
  g.lane = task!.lane
  g.laneX = task!.lane
  for (let i = 0; i < 200 && g.profile.bank === 0; i++) step(g)
  expect(g.profile.bank).toBe(10)
  addSteps(g, 10)
  expect(g.taskQueue).toBe(3)
})

test('the right quiz lane pays coins and nitro, the wrong lane pays nothing', () => {
  for (const wantRight of [true, false]) {
    const g = make()
    startQuizNow(g)
    const q = g.quiz
    q.count = 1
    step(g)
    expect(g.quiz.phase).toBe('gate')
    const lane = wantRight ? q.correct : (q.correct + 1) % 3
    g.lane = lane
    g.laneX = lane
    for (let i = 0; i < 300 && g.quiz.phase === 'gate'; i++) step(g)
    expect(g.quiz.phase).toBe('none')
    expect(g.profile.quizTotal).toBe(1)
    if (wantRight) {
      expect(g.profile.bank).toBe(15)
      expect(g.nitro).toBeGreaterThan(0)
      expect(g.profile.quizRight).toBe(1)
    } else {
      expect(g.profile.bank).toBe(0)
      expect(g.nitro).toBe(0)
      expect(g.msg).toMatch(/^Answer: [ABC] /)
    }
  }
})

test('buying a car takes coins, owns it and drives it; locked or unaffordable cannot be bought', () => {
  const g = make({ bank: 100, xp: 600 })
  act(g, 'garage')
  expect(g.mode).toBe('garage')
  g.garageIdx = 1
  act(g, 'buy')
  expect(g.profile.bank).toBe(40)
  expect(g.profile.owned).toContain('coupe')
  expect(g.profile.car).toBe('coupe')
  expect(g.mode).toBe('drive')
  expect(g.countdown).toBeGreaterThan(0)

  act(g, 'garage')
  g.garageIdx = 2
  act(g, 'buy')
  expect(g.profile.owned).not.toContain('wagon')
  expect(g.mode).toBe('garage')

  const poor = make({ bank: 10, xp: 600 })
  act(poor, 'garage')
  poor.garageIdx = 1
  act(poor, 'buy')
  expect(poor.profile.owned).not.toContain('coupe')
  expect(poor.profile.bank).toBe(10)
})

test('arrive pauses on the card and resume drives again', () => {
  const g = make()
  arrive(g)
  expect(g.mode).toBe('arrived')
  const text = frameText(renderFrame(g, DEFAULT_PALETTE)).join('\n')
  expect(text).toContain('ARRIVED!')
  expect(text).toContain('Your AI employee finished the job')
  resume(g)
  expect(g.mode).toBe('drive')
})

test('a broken saved profile loads cleanly', () => {
  const p = sanitizeProfile({ bank: -5, owned: ['zzz', 'gt', 'gt'], car: 'ghost', xp: 'lots', best: Infinity, quizRight: NaN })
  expect(p.bank).toBe(0)
  expect(p.owned).toEqual(['hatch', 'gt'])
  expect(p.car).toBe('hatch')
  expect(p.xp).toBe(0)
  expect(p.best).toBe(0)
  expect(p.quizRight).toBe(0)
  expect(sanitizeProfile(null).owned).toEqual(['hatch'])
  expect(sanitizeProfile('x').car).toBe('hatch')
})

test('content: at least 25 distinct short questions, garage table and level curve', () => {
  expect(QUESTIONS.length).toBeGreaterThanOrEqual(25)
  expect(new Set(QUESTIONS.map(q => q.q)).size).toBe(QUESTIONS.length)
  for (const q of QUESTIONS) {
    expect(q.q.length).toBeLessThanOrEqual(36)
    expect(Math.max(q.right.length, q.wrong[0].length, q.wrong[1].length)).toBeLessThanOrEqual(12)
  }
  expect(CARS.map(c => c.price)).toEqual([0, 60, 180, 450, 1000])
  expect(CARS.map(c => c.level)).toEqual([1, 2, 3, 5, 8])
  expect([2, 3, 4, 5].map(levelXp)).toEqual([500, 1500, 3000, 5000])
  expect(levelOf(1499)).toBe(2)
  expect(levelOf(1500)).toBe(3)
})

test('questions never repeat back to back', () => {
  const g = make()
  let last = ''
  for (let i = 0; i < 80; i++) {
    startQuizNow(g)
    expect(g.quiz.q!.q === last).toBe(false)
    last = g.quiz.q!.q
  }
})

test('every screen draws at narrow and wide sizes, in both looks', () => {
  for (const [w, h] of [[36, 8], [60, 14], [110, 30], [200, 40]] as const) {
    for (const pal of [DEFAULT_PALETTE, RETRO_PALETTE]) {
      const g = make({ bank: 5 }, w, h)
      g.objs.push({ kind: 'coin', lane: 0, y: 3 }, { kind: 'barrier', lane: 2, y: 5 }, { kind: 'pothole', lane: 1, y: 6 })
      startQuizNow(g)
      g.quiz.phase = 'gate'
      g.quiz.gateY = 2
      for (const mode of ['drive', 'paused', 'arrived', 'garage'] as const) {
        g.mode = mode
        const f = renderFrame(g, pal)
        const rows = frameText(f)
        expect(rows.length).toBe(h)
        expect(rows[0].length).toBe(w)
        expect(rows[0]).toContain('ROAD TRIP')
        expect(encodeFrame(f).length).toBe(Math.ceil((w * h * 12) / 3) * 4)
      }
    }
  }
  const tiny = make({}, 30, 6)
  expect(frameText(renderFrame(tiny, DEFAULT_PALETTE)).join(' ')).toContain('Make this')
})

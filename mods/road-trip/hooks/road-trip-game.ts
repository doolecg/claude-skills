import {
  CARS,
  DEFAULT_PALETTE,
  QUESTIONS,
  RETRO_PALETTE,
  at,
  carById,
  levelOf,
  levelXp,
} from './road-trip-art'
import type { Car, Palette, Question } from './road-trip-art'

export type Mode = 'drive' | 'paused' | 'garage' | 'arrived'
export type Profile = {
  bank: number
  owned: string[]
  car: string
  xp: number
  best: number
  quizRight: number
  quizTotal: number
}
export type Kind = 'barrier' | 'cone' | 'pothole' | 'coin' | 'task'
export type Obj = { kind: Kind; lane: number; y: number }
export type Quiz = {
  phase: 'none' | 'ask' | 'gate'
  q: Question | null
  lanes: string[]
  correct: number
  count: number
  gateY: number
}
export type Action = 'left' | 'right' | 'pause' | 'garage' | 'buy' | 'keep'

export const TICK_MS = 70
export const NITRO_TICKS = 71
export const COUNTDOWN = 42
export const SHORT_COUNTDOWN = 21
export const FLAT_TICKS = 29
export const QUIZ_COUNT = 43
export const MAX_QUEUE = 3

export type Game = {
  profile: Profile
  mode: Mode
  back: Mode
  countdown: number
  flat: number
  retro: boolean
  w: number
  h: number
  dist: number
  runCoins: number
  runRight: number
  speed: number
  scroll: number
  tick: number
  lane: number
  laneX: number
  shieldUsed: boolean
  nitro: number
  shake: number
  objs: Obj[]
  gap: number
  taskQueue: number
  quiz: Quiz
  quizIn: number
  lastQ: number
  msg: string
  msgTicks: number
  seed: number
  garageIdx: number
  dirty: boolean
  saveDirty: boolean
}

export const emptyProfile = (): Profile => ({
  bank: 0, owned: ['hatch'], car: 'hatch', xp: 0, best: 0, quizRight: 0, quizTotal: 0,
})

export const sanitizeProfile = (raw: unknown): Profile => {
  const o: Record<string, unknown> =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, 1e9) : 0
  const owned: string[] = []
  if (Array.isArray(o.owned)) {
    for (const id of o.owned) {
      if (typeof id === 'string' && carById(id) && !owned.includes(id)) owned.push(id)
    }
  }
  if (!owned.includes('hatch')) owned.unshift('hatch')
  const car = typeof o.car === 'string' && owned.includes(o.car) ? o.car : 'hatch'
  return {
    bank: Math.floor(num(o.bank)),
    owned,
    car,
    xp: num(o.xp),
    best: Math.floor(num(o.best)),
    quizRight: Math.floor(num(o.quizRight)),
    quizTotal: Math.floor(num(o.quizTotal)),
  }
}

const rnd = (g: Game): number => {
  g.seed = (g.seed + 0x6d2b79f5) | 0
  let t = Math.imul(g.seed ^ (g.seed >>> 15), 1 | g.seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rndInt = (g: Game, n: number): number => Math.min(n - 1, Math.floor(rnd(g) * n))

const noQuiz = (): Quiz => ({ phase: 'none', q: null, lanes: [], correct: 0, count: 0, gateY: -3 })

export const carOf = (g: Game): Car => carById(g.profile.car) ?? at(CARS, 0)
const mult = (g: Game): number => (carOf(g).double ? 2 : 1)
export const levelNow = (g: Game): number => levelOf(g.profile.xp)

export const newGame = (profile: Profile, seed = 12345, retro = false): Game => {
  const g: Game = {
    profile, mode: 'drive', back: 'drive', countdown: 0, flat: 0, retro, w: 0, h: 0,
    dist: 0, runCoins: 0, runRight: 0, speed: 0.3, scroll: 0, tick: 0, lane: 1, laneX: 1,
    shieldUsed: false, nitro: 0, shake: 0, objs: [], gap: 6, taskQueue: 0, quiz: noQuiz(),
    quizIn: 400, lastQ: -1, msg: '', msgTicks: 0, seed, garageIdx: 0, dirty: true, saveDirty: false,
  }
  g.garageIdx = Math.max(0, CARS.findIndex(c => c.id === profile.car))
  startRun(g, false)
  return g
}

export const resize = (g: Game, w: number, h: number): void => {
  if (g.w !== w || g.h !== h) g.dirty = true
  g.w = w
  g.h = h
}

export const tooSmall = (g: Game): boolean => g.w < 36 || g.h < 7

export const startRun = (g: Game, short: boolean): void => {
  const car = carOf(g)
  g.mode = 'drive'
  g.dist = 0
  g.runCoins = 0
  g.runRight = 0
  g.speed = 0.3
  g.objs = []
  g.gap = 6
  g.lane = 1
  g.laneX = 1
  g.shieldUsed = false
  g.nitro = car.nitroStart ? Math.floor(NITRO_TICKS * 0.7) : 0
  g.shake = 0
  g.flat = 0
  g.quiz = noQuiz()
  g.quizIn = 357 + rndInt(g, 72)
  g.countdown = short ? SHORT_COUNTDOWN : COUNTDOWN
  g.msg = ''
  g.msgTicks = 0
  g.dirty = true
}

export const addSteps = (g: Game, n: number): void => {
  g.taskQueue = Math.min(MAX_QUEUE, g.taskQueue + Math.max(0, n))
}

const setMsg = (g: Game, text: string, ticks: number): void => {
  g.msg = text
  g.msgTicks = ticks
}

const collect = (g: Game, value: number): void => {
  const v = value * mult(g)
  g.profile.bank += v
  g.runCoins += v
  g.saveDirty = true
}

const startQuiz = (g: Game): void => {
  let idx = rndInt(g, QUESTIONS.length)
  if (idx === g.lastQ) idx = (idx + 1) % QUESTIONS.length
  g.lastQ = idx
  const q = at(QUESTIONS, idx)
  const lanes = [q.right, q.wrong[0], q.wrong[1]]
  for (let i = 2; i > 0; i--) {
    const j = rndInt(g, i + 1)
    const t = at(lanes, i)
    lanes[i] = at(lanes, j)
    lanes[j] = t
  }
  g.quiz = { phase: 'ask', q, lanes, correct: lanes.indexOf(q.right), count: QUIZ_COUNT, gateY: -3 }
}

export const startQuizNow = startQuiz

const judgeQuiz = (g: Game): void => {
  const q = g.quiz
  const lane = Math.max(0, Math.min(2, Math.round(g.laneX)))
  g.profile.quizTotal++
  if (lane === q.correct) {
    g.profile.quizRight++
    g.runRight++
    g.profile.xp += 100
    collect(g, 15)
    g.nitro = NITRO_TICKS
    setMsg(g, 'Correct! NITRO', 28)
  } else {
    setMsg(g, `Answer: ${'ABC'[q.correct]} ${q.lanes[q.correct]}`, 42)
  }
  g.saveDirty = true
  g.quiz = noQuiz()
  g.quizIn = 357 + rndInt(g, 72)
}

const spawn = (g: Game): void => {
  const r = rnd(g)
  if (r < 0.55) {
    const count = rnd(g) < 0.3 ? 2 : 1
    const lanes = [0, 1, 2]
    for (let i = 0; i < count; i++) {
      const lane = at(lanes.splice(rndInt(g, lanes.length), 1), 0)
      const kinds: Kind[] = ['barrier', 'cone', 'pothole']
      g.objs.push({ kind: at(kinds, rndInt(g, 3)), lane, y: -1 })
    }
  } else {
    const lane = rndInt(g, 3)
    for (let i = 0; i < 3; i++) g.objs.push({ kind: 'coin', lane, y: -1 - i })
  }
}

export const geo = (g: Game) => {
  const lw = Math.max(5, Math.min(14, Math.floor((g.w - 16) / 3)))
  const roadW = 3 * lw + 4
  const x0 = Math.floor((g.w - roadW) / 2)
  const rr = Math.max(1, g.h - 2)
  return { lw, roadW, x0, rr, carTop: rr - 4, amp: Math.max(0, Math.min(4, Math.floor((g.w - roadW) / 2) - 3)) }
}

export const step = (g: Game): void => {
  g.tick++
  if (g.mode !== 'drive' || tooSmall(g)) return
  g.dirty = true
  const { rr, carTop } = geo(g)
  g.laneX += (g.lane - g.laneX) * 0.38
  if (Math.abs(g.lane - g.laneX) < 0.03) g.laneX = g.lane
  if (g.msgTicks > 0) g.msgTicks--
  if (g.shake > 0) g.shake--
  if (g.flat > 0) {
    g.flat--
    if (g.flat === 0) startRun(g, true)
    return
  }
  if (g.countdown > 0) {
    g.countdown--
    return
  }
  const car = carOf(g)
  const spd = (0.3 + Math.min(0.45, g.dist / 12000)) * (g.nitro > 0 ? 1.7 : 1)
  g.speed = spd
  if (g.nitro > 0) g.nitro--
  g.dist += spd * 3
  g.scroll += spd
  g.profile.xp += spd * 3
  if (Math.floor(g.dist) > g.profile.best) {
    g.profile.best = Math.floor(g.dist)
    g.saveDirty = true
  }

  if (g.taskQueue > 0) {
    g.taskQueue--
    g.objs.push({ kind: 'task', lane: rndInt(g, 3), y: -1 })
  }

  const kept: Obj[] = []
  const nearLane = Math.round(g.laneX)
  for (const o of g.objs) {
    o.y += spd
    const inWindow = o.y >= carTop && o.y < carTop + 3
    if (inWindow) {
      const coin = o.kind === 'coin' || o.kind === 'task'
      const hit = Math.abs(g.laneX - o.lane) < 0.6
      if (coin) {
        if (hit || (car.magnet && Math.abs(o.lane - nearLane) <= 1)) {
          collect(g, o.kind === 'task' ? 10 : 1)
          continue
        }
      } else if (hit) {
        if (g.nitro > 0) {
          collect(g, 2)
          continue
        }
        if (car.shield && !g.shieldUsed) {
          g.shieldUsed = true
          setMsg(g, 'Shield saved you!', 28)
          continue
        }
        g.flat = FLAT_TICKS
        g.shake = 8
        g.quiz = noQuiz()
        setMsg(g, 'Flat tire!', FLAT_TICKS)
        g.saveDirty = true
        kept.push(o)
        continue
      }
    }
    if (o.y <= rr + 1) kept.push(o)
  }
  g.objs = kept
  if (g.flat > 0) return

  const qz = g.quiz
  if (qz.phase === 'none') {
    g.quizIn--
    if (g.quizIn <= 0) startQuiz(g)
  } else if (qz.phase === 'ask') {
    qz.count--
    if (qz.count <= 0) {
      qz.phase = 'gate'
      qz.gateY = -3
    }
  } else {
    qz.gateY += spd
    if (qz.gateY + 2 >= carTop) judgeQuiz(g)
  }

  g.gap -= spd
  if (g.gap <= 0 && g.quiz.phase === 'none') {
    spawn(g)
    g.gap = Math.max(4, 8.5 - g.dist / 2500) + rnd(g) * 3
  }
}

export const arrive = (g: Game): void => {
  if (g.mode === 'garage') g.back = 'arrived'
  else g.mode = 'arrived'
  g.saveDirty = true
  g.dirty = true
}

export const resume = (g: Game): void => {
  if (g.mode === 'arrived') {
    g.mode = 'drive'
    g.countdown = Math.max(g.countdown, SHORT_COUNTDOWN)
  } else if (g.mode === 'garage' && g.back === 'arrived') {
    g.back = 'drive'
  }
  g.dirty = true
}

export type GarageStatus = { text: string; canAct: boolean; label: string }

export const garageStatus = (g: Game, idx: number): GarageStatus => {
  const car = at(CARS, idx)
  const owned = g.profile.owned.includes(car.id)
  if (owned) {
    return car.id === g.profile.car
      ? { text: 'Driving this one', canAct: true, label: 'Drive' }
      : { text: 'Owned, press B to drive it', canAct: true, label: 'Drive' }
  }
  if (levelNow(g) < car.level) {
    return { text: `Locked, reach level ${car.level}`, canAct: false, label: 'Buy' }
  }
  if (g.profile.bank >= car.price) {
    return { text: `Press B to buy for ${fmt(car.price)} coins`, canAct: true, label: 'Buy' }
  }
  return { text: `${fmt(car.price)} coins, you have ${fmt(g.profile.bank)}`, canAct: false, label: 'Buy' }
}

export const act = (g: Game, a: Action): void => {
  g.dirty = true
  if (g.mode === 'garage') {
    if (a === 'left') g.garageIdx = (g.garageIdx + CARS.length - 1) % CARS.length
    else if (a === 'right') g.garageIdx = (g.garageIdx + 1) % CARS.length
    else if (a === 'garage') {
      g.mode = g.back
      if (g.mode === 'drive') g.countdown = Math.max(g.countdown, SHORT_COUNTDOWN)
    } else if (a === 'buy') {
      const car = at(CARS, g.garageIdx)
      const st = garageStatus(g, g.garageIdx)
      if (!st.canAct) return
      if (!g.profile.owned.includes(car.id)) {
        g.profile.bank -= car.price
        g.profile.owned.push(car.id)
      }
      g.profile.car = car.id
      g.saveDirty = true
      startRun(g, true)
    }
    return
  }
  if (a === 'garage') {
    g.back = g.mode
    g.mode = 'garage'
    g.garageIdx = Math.max(0, CARS.findIndex(c => c.id === g.profile.car))
  } else if (a === 'keep') {
    if (g.mode === 'arrived') {
      g.mode = 'drive'
      g.countdown = Math.max(g.countdown, SHORT_COUNTDOWN)
    }
  } else if (a === 'pause') {
    if (g.mode === 'drive') g.mode = 'paused'
    else if (g.mode === 'paused') g.mode = 'drive'
  } else if (g.mode === 'drive') {
    if (a === 'left') g.lane = Math.max(0, g.lane - 1)
    else if (a === 'right') g.lane = Math.min(2, g.lane + 1)
  }
}

export const fmt = (n: number): string =>
  String(Math.floor(Math.max(0, n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const paletteOf = (g: Game, skin?: Palette): Palette =>
  g.retro ? RETRO_PALETTE : (skin ?? DEFAULT_PALETTE)

/* ------------------------------------------------------------------ drawing */

export type Frame = { w: number; h: number; ch: Uint32Array; fg: Uint32Array; bg: Uint32Array }

const makeFrame = (w: number, h: number, bg: number, fg: number): Frame => ({
  w, h,
  ch: new Uint32Array(w * h).fill(32),
  fg: new Uint32Array(w * h).fill(fg),
  bg: new Uint32Array(w * h).fill(bg),
})

const put = (f: Frame, x: number, y: number, s: string, fg: number, bg?: number): void => {
  if (y < 0 || y >= f.h) return
  for (let i = 0; i < s.length; i++) {
    const cx = x + i
    if (cx < 0 || cx >= f.w) continue
    const k = y * f.w + cx
    f.ch[k] = s.charCodeAt(i)
    f.fg[k] = fg
    if (bg !== undefined) f.bg[k] = bg
  }
}

const fillRect = (f: Frame, x: number, y: number, w: number, h: number, bg: number): void => {
  for (let j = y; j < y + h; j++) {
    if (j < 0 || j >= f.h) continue
    for (let i = x; i < x + w; i++) {
      if (i < 0 || i >= f.w) continue
      const k = j * f.w + i
      f.bg[k] = bg
      f.ch[k] = 32
    }
  }
}

const clip = (s: string, n: number): string => (s.length <= n ? s : s.slice(0, Math.max(0, n)))
const center = (s: string, n: number): string => {
  const c = clip(s, n)
  const left = Math.floor((n - c.length) / 2)
  return ' '.repeat(left) + c + ' '.repeat(n - c.length - left)
}

export const frameText = (f: Frame): string[] => {
  const rows: string[] = []
  for (let y = 0; y < f.h; y++) {
    let s = ''
    for (let x = 0; x < f.w; x++) s += String.fromCharCode(f.ch[y * f.w + x] ?? 32)
    rows.push(s)
  }
  return rows
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export const encodeFrame = (f: Frame): string => {
  const n = f.w * f.h
  const bytes = new Uint8Array(n * 12)
  let p = 0
  const word = (v: number): void => {
    bytes[p++] = v & 255
    bytes[p++] = (v >>> 8) & 255
    bytes[p++] = (v >>> 16) & 255
    bytes[p++] = (v >>> 24) & 255
  }
  for (let i = 0; i < n; i++) {
    word(f.ch[i] ?? 32)
    word(f.fg[i] ?? 0)
    word(f.bg[i] ?? 0)
  }
  const sx = (i: number): number => bytes[i] ?? 0
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = sx(i)
    const b = sx(i + 1)
    const c = sx(i + 2)
    out += B64.charAt(a >> 2) + B64.charAt(((a & 3) << 4) | (b >> 4))
    out += i + 1 < bytes.length ? B64.charAt(((b & 15) << 2) | (c >> 6)) : '='
    out += i + 2 < bytes.length ? B64.charAt(c & 63) : '='
  }
  return out
}

const hash = (a: number, b: number): number =>
  (Math.imul(a | 0, 2654435761) ^ Math.imul((b | 0) + 7, 40503) ^ 0x9e3779b9) >>> 0

type Line = [string, number?]

const box = (f: Frame, lines: Line[], top: number, pal: Palette): void => {
  const inner = Math.max(...lines.map(l => l[0].length))
  const w = Math.min(f.w, inner + 4)
  const x = Math.floor((f.w - w) / 2)
  fillRect(f, x, top, w, lines.length + 2, pal.boxBg)
  lines.forEach((l, i) => {
    const text = clip(l[0], w - 2)
    put(f, x + Math.floor((w - text.length) / 2), top + 1 + i, text, l[1] ?? pal.boxFg, pal.boxBg)
  })
}

const drawHud = (g: Game, f: Frame, pal: Palette): void => {
  fillRect(f, 0, 0, f.w, 2, pal.hudBg)
  put(f, 1, 0, 'ROAD TRIP', pal.title, pal.hudBg)
  const dist = Math.floor(g.dist)
  const best = Math.max(g.profile.best, dist)
  let right = `${fmt(dist)} m  ·  Best ${fmt(best)} m  ·  ◉ ${fmt(g.profile.bank)}`
  if (right.length + 12 > f.w) right = `${fmt(dist)} m  ·  ◉ ${fmt(g.profile.bank)}`
  put(f, Math.max(11, f.w - right.length - 1), 0, right, pal.text, pal.hudBg)

  const lv = levelNow(g)
  const lo = levelXp(lv)
  const span = levelXp(lv + 1) - lo
  const filled = Math.max(0, Math.min(10, Math.floor(((g.profile.xp - lo) / span) * 10)))
  put(f, 1, 1, `LV ${lv} `, pal.text, pal.hudBg)
  const barX = 1 + `LV ${lv} `.length
  put(f, barX, 1, '▰'.repeat(filled), pal.title, pal.hudBg)
  put(f, barX + filled, 1, '▱'.repeat(10 - filled), pal.dim, pal.hudBg)
  const car = carOf(g)
  const perks = car.perkNames
    .map(n => `${n === 'Shield' && g.shieldUsed ? '◇' : '◆'} ${n}`)
    .concat(g.nitro > 0 ? ['NITRO'] : [])
    .join('  ')
  let tail = `${perks}${perks ? '  ' : ''}${car.name}`
  if (barX + 10 + tail.length + 3 > f.w) tail = car.name
  put(f, Math.max(barX + 11, f.w - tail.length - 1), 1, tail, g.nitro > 0 ? pal.coin : pal.text, pal.hudBg)
}

const drawRoad = (g: Game, f: Frame, pal: Palette): void => {
  const { lw, roadW, x0, rr, carTop, amp } = geo(g)
  const shake = g.shake > 0 ? (g.tick % 2 === 0 ? 1 : -1) : 0
  const shift = (r: number): number => Math.round(amp * Math.sin((g.scroll - r) * 0.08)) + shake
  const sc = Math.floor(g.scroll)
  const rowLeft = (r: number): number => x0 + shift(r)

  for (let r = 0; r < rr; r++) {
    const y = r + 2
    const xa = rowLeft(r)
    fillRect(f, 0, y, f.w, 1, pal.grass)
    fillRect(f, xa, y, roadW, 1, pal.road)
    const wr = sc - r
    for (const side of [0, 1]) {
      const hv = hash(wr, side + 1)
      const lo = side === 0 ? 1 : xa + roadW + 1
      const hi = side === 0 ? xa - 2 : f.w - 2
      if (hi < lo) continue
      const span = hi - lo + 1
      if (hv % 6 === 0) put(f, lo + ((hv >>> 8) % span), y, '♣', pal.tree)
      else if (hv % 5 === 0) put(f, lo + ((hv >>> 8) % span), y, '·', pal.dim)
    }
    put(f, xa, y, '▌', pal.edge, pal.road)
    put(f, xa + roadW - 1, y, '▐', pal.edge, pal.road)
    const dash = ((wr % 4) + 4) % 4 < 2
    if (dash) {
      put(f, xa + 1 + lw, y, '┃', pal.line)
      put(f, xa + 2 + 2 * lw, y, '┃', pal.line)
    }
  }

  const laneX = (lane: number, r: number): number => rowLeft(r) + 1 + lane * (lw + 1)
  for (const o of g.objs) {
    const r = Math.floor(o.y)
    if (r < 0 || r >= rr) continue
    const y = r + 2
    const lx = laneX(o.lane, r)
    if (o.kind === 'barrier') {
      const bw = Math.max(3, lw - 2)
      put(f, lx + Math.floor((lw - bw) / 2), y, '▞'.repeat(bw), pal.barrier1, pal.barrier2)
    } else if (o.kind === 'cone') {
      put(f, lx + Math.floor((lw - 3) / 2), y, '◢▲◣', pal.cone, pal.road)
    } else if (o.kind === 'pothole') {
      const px = lx + Math.floor((lw - 5) / 2)
      put(f, px, y, '(', pal.dim, pal.road)
      put(f, px + 1, y, '▓▓▓', pal.pothole, pal.road)
      put(f, px + 4, y, ')', pal.dim, pal.road)
    } else if (o.kind === 'coin') {
      put(f, lx + Math.floor((lw - 3) / 2), y, '($)', pal.coin, pal.road)
    } else {
      put(f, lx + Math.floor((lw - 3) / 2), y, '(✓)', pal.hudBg, pal.task)
    }
  }

  const qz = g.quiz
  if (qz.phase === 'gate') {
    for (let k = 0; k < 3; k++) {
      const r = Math.floor(qz.gateY) + k
      if (r < 0 || r >= rr) continue
      const y = r + 2
      const xa = rowLeft(r)
      for (let l = 0; l < 3; l++) {
        const lx = xa + 1 + l * (lw + 1)
        const width = l < 2 ? lw + 1 : lw
        fillRect(f, lx, y, width, 1, at(pal.gates, l))
        if (k === 1) {
          const label = center(`${'ABC'[l]} ${qz.lanes[l]}`, lw)
          put(f, lx, y, label, pal.hudBg, at(pal.gates, l))
        }
      }
    }
  }

  if (rr >= 5) {
    const car = carOf(g)
    const xa = rowLeft(carTop + 1)
    const cx = xa + 1 + Math.round(g.laneX * (lw + 1)) + Math.floor((lw - 5) / 2)
    const base = g.retro ? car.retroColor : car.color
    const color = g.nitro > 0 && g.tick % 4 < 2 ? pal.coin : base
    car.art.forEach((line, i) => {
      for (let c = 0; c < line.length; c++) {
        if (line.charAt(c) === ' ') continue
        put(f, cx + c, carTop + i + 2, line.charAt(c), color, pal.road)
      }
    })
    if (g.nitro > 0 && carTop + 3 < rr) put(f, cx + 2, carTop + 5, '▼', pal.task, pal.road)
  }

  const midTop = Math.max(2, Math.floor(rr / 2) - 1)
  if (g.mode === 'arrived') {
    box(f, [
      ['ARRIVED!', pal.title],
      ['Your AI employee finished the job'],
      [`Distance ${fmt(g.dist)} m   Coins this run ${fmt(g.runCoins)}`],
      [`High score ${fmt(Math.max(g.profile.best, g.dist))} m   Quiz right ${g.profile.quizRight}`],
      [`Level ${levelNow(g)}   Bank ${fmt(g.profile.bank)}`],
    ], Math.max(2, midTop - 2), pal)
  } else if (g.mode === 'paused') {
    box(f, [['PAUSED', pal.title], ['Press P to resume']], midTop, pal)
  } else if (g.flat > 0) {
    box(f, [['Flat tire!', pal.title]], midTop, pal)
  } else if (g.countdown > 0) {
    box(f, [['GET READY', pal.title], [String(Math.ceil(g.countdown / 14))]], midTop, pal)
  } else if (g.msgTicks > 0 && g.msg) {
    box(f, [[g.msg, pal.title]], midTop, pal)
  }
  if (qz.phase === 'ask' && qz.q && g.mode === 'drive') {
    box(f, [
      [`QUIZ  ${qz.q.q}`, pal.title],
      [`A ${qz.lanes[0]}    B ${qz.lanes[1]}    C ${qz.lanes[2]}`],
      [`Gate in ${Math.ceil(qz.count / 14)}...`, pal.dim],
    ], 2, pal)
  }
}

const drawGarage = (g: Game, f: Frame, pal: Palette): void => {
  fillRect(f, 0, 2, f.w, f.h - 2, pal.road)
  const car = at(CARS, g.garageIdx)
  const st = garageStatus(g, g.garageIdx)
  const owned = g.profile.owned.includes(car.id)
  const avail = f.h - 2
  const roomy = avail >= 13
  const top = 2 + (roomy ? Math.floor((avail - 13) / 2) : 0)
  const cx = Math.floor(f.w / 2)
  if (roomy) put(f, cx - 3, top, 'GARAGE', pal.title, pal.road)
  const carY = top + (roomy ? 2 : 0)
  const color = owned || levelNow(g) >= car.level ? (g.retro ? car.retroColor : car.color) : pal.dim
  car.art.forEach((line, i) => {
    for (let c = 0; c < line.length; c++) {
      if (line.charAt(c) === ' ') continue
      for (const dy of [0, 1]) put(f, cx - 5 + c * 2, carY + i * 2 + dy, line.charAt(c) + line.charAt(c), color, pal.road)
    }
  })
  put(f, cx - 13, carY + 2, '◀', pal.text, pal.road)
  put(f, cx + 13, carY + 2, '▶', pal.text, pal.road)
  const nameY = carY + 7
  put(f, cx - Math.floor(car.name.length / 2), nameY, clip(car.name, f.w - 2), color, pal.road)
  const perk = clip(car.perk, f.w - 2)
  put(f, cx - Math.floor(perk.length / 2), nameY + 1, perk, pal.dim, pal.road)
  const status = clip(st.text, f.w - 2)
  put(f, cx - Math.floor(status.length / 2), nameY + 2, status, st.canAct ? pal.text : pal.task, pal.road)
}

export const renderFrame = (g: Game, pal: Palette): Frame => {
  const f = makeFrame(Math.max(1, g.w), Math.max(1, g.h), pal.road, pal.text)
  if (tooSmall(g)) {
    fillRect(f, 0, 0, f.w, f.h, pal.hudBg)
    const msg = 'Make this panel a little bigger to drive'
    const y = Math.floor(f.h / 2)
    if (f.w >= msg.length) put(f, Math.floor((f.w - msg.length) / 2), y, msg, pal.text, pal.hudBg)
    else {
      put(f, 0, y, clip('Make this panel', f.w), pal.text, pal.hudBg)
      put(f, 0, y + 1, clip('a little bigger', f.w), pal.text, pal.hudBg)
    }
    return f
  }
  if (g.mode === 'garage') drawGarage(g, f, pal)
  else drawRoad(g, f, pal)
  drawHud(g, f, pal)
  return f
}

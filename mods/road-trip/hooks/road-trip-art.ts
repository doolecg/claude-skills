export type CarId = 'hatch' | 'coupe' | 'wagon' | 'gt' | 'unicorn'

export type Car = {
  id: CarId
  name: string
  price: number
  level: number
  perk: string
  perkNames: string[]
  magnet: boolean
  shield: boolean
  double: boolean
  nitroStart: boolean
  art: [string, string, string]
  color: number
  retroColor: number
}

export const CARS: Car[] = [
  {
    id: 'hatch', name: 'Starter Hatch', price: 0, level: 1,
    perk: 'None. Every empire starts somewhere', perkNames: [],
    magnet: false, shield: false, double: false, nitroStart: false,
    art: ['▗▟█▙▖', '▐█▀█▌', '▝▀ ▀▘'], color: 0x6e7cf6, retroColor: 0x00ffff,
  },
  {
    id: 'coupe', name: 'Side Hustle Coupe', price: 60, level: 2,
    perk: 'Coin magnet: also grabs coins in the next lane', perkNames: ['Magnet'],
    magnet: true, shield: false, double: false, nitroStart: false,
    art: ['▗▟▀▙▖', '▐███▌', '▝▀ ▀▘'], color: 0xff3d97, retroColor: 0xff00ff,
  },
  {
    id: 'wagon', name: 'Agency Wagon', price: 180, level: 3,
    perk: 'Shield: survives one hit per run', perkNames: ['Shield'],
    magnet: false, shield: true, double: false, nitroStart: false,
    art: ['▗███▖', '▐█▀█▌', '▝█ █▘'], color: 0xfff6e8, retroColor: 0x33ff66,
  },
  {
    id: 'gt', name: 'Founder GT', price: 450, level: 5,
    perk: 'Double coins on everything', perkNames: ['2x Coins'],
    magnet: false, shield: false, double: true, nitroStart: false,
    art: ['▗▄█▄▖', '▐███▌', '▝▀▀▀▘'], color: 0xffa23a, retroColor: 0xffff33,
  },
  {
    id: 'unicorn', name: 'Unicorn Hyper', price: 1000, level: 8,
    perk: 'All of the above plus a nitro start', perkNames: ['Magnet', 'Shield', '2x Coins', 'Nitro start'],
    magnet: true, shield: true, double: true, nitroStart: true,
    art: ['◢▟█▙◣', '▐█▀█▌', '◥▀ ▀◤'], color: 0xb48cff, retroColor: 0xffffff,
  },
]

export const at = <T>(list: readonly T[], i: number): T => list[i] as T

export const carById = (id: string): Car | undefined => CARS.find(c => c.id === id)

export type Question = { q: string; right: string; wrong: [string, string] }

export const QUESTIONS: Question[] = [
  { q: 'Which key stops Claude mid-task?', right: 'Esc', wrong: ['F5', 'Tab'] },
  { q: 'What does /clear do?', right: 'New chat', wrong: ['Quit app', 'Del files'] },
  { q: 'Which file holds project notes?', right: 'CLAUDE.md', wrong: ['TODO.bin', 'HELLO.zip'] },
  { q: 'What does /compact do?', right: 'Shrinks chat', wrong: ['Zips files', 'Mutes sound'] },
  { q: 'Which command switches model?', right: '/model', wrong: ['/brain', '/gears'] },
  { q: 'Which command lists commands?', right: '/help', wrong: ['/lost', '/what'] },
  { q: 'Shift+Tab cycles what?', right: 'Modes', wrong: ['Fonts', 'Wallpapers'] },
  { q: 'What is a subagent?', right: 'A helper', wrong: ['A bug', 'A tax form'] },
  { q: 'What does /cost show?', right: 'Usage', wrong: ['Gas price', 'Your pay'] },
  { q: 'What does /init create?', right: 'CLAUDE.md', wrong: ['A virus', 'Coffee'] },
  { q: 'What does /resume do?', right: 'Reopen chat', wrong: ['Make a CV', 'Reboot PC'] },
  { q: 'Plan mode means Claude...', right: 'Plans first', wrong: ['Naps first', 'Sings first'] },
  { q: 'What are hooks?', right: 'Auto actions', wrong: ['Fishing gear', 'Coat racks'] },
  { q: 'MCP connects Claude to...', right: 'Tools', wrong: ['Neighbours', 'The moon'] },
  { q: 'Where do skills live?', right: '.claude', wrong: ['The bin', 'Desktop'] },
  { q: 'Which tool reads a file?', right: 'Read', wrong: ['Stare', 'Gaze'] },
  { q: 'That meeting should have been...', right: 'An email', wrong: ['A nap', 'A parade'] },
  { q: 'Invoice unpaid for 90 days?', right: 'Chase it', wrong: ['Frame it', 'Eat it'] },
  { q: 'Revenue minus costs is...', right: 'Profit', wrong: ['Luck', 'Vibes'] },
  { q: 'Cash is...', right: 'King', wrong: ['A myth', 'Lava'] },
  { q: 'Best way to scale?', right: 'Systems', wrong: ['Panic', 'Confetti'] },
  { q: 'An upset customer needs you to...', right: 'Listen', wrong: ['Hide', 'Moonwalk'] },
  { q: 'The I in ROI is...', right: 'Investment', wrong: ['Ice cream', 'Impulse'] },
  { q: 'Who sets your prices?', right: 'You do', wrong: ['A cat', 'The moon'] },
  { q: 'A busy founder needs a...', right: 'Checklist', wrong: ['Trampoline', 'Third phone'] },
  { q: 'Deadline is Friday. Start...', right: 'Today', wrong: ['Friday 5pm', 'Never'] },
  { q: 'A good email subject is...', right: 'Clear', wrong: ['Cryptic', 'ALL CAPS'] },
  { q: 'Free trial ends. Customers...', right: 'Need a nudge', wrong: ['Vanish', 'Sing'] },
]

export const levelXp = (n: number): number => 250 * n * (n - 1)

export const levelOf = (xp: number): number => {
  let n = 1
  while (n < 99 && xp >= levelXp(n + 1)) n++
  return n
}

export type Palette = {
  hudBg: number
  title: number
  text: number
  dim: number
  coin: number
  task: number
  road: number
  edge: number
  line: number
  grass: number
  tree: number
  barrier1: number
  barrier2: number
  cone: number
  pothole: number
  boxBg: number
  boxFg: number
  gates: [number, number, number]
  retro: boolean
}

export const DEFAULT_PALETTE: Palette = {
  hudBg: 0x1c1b24, title: 0xff3d97, text: 0xfff6e8, dim: 0x9a98b0,
  coin: 0xffd84a, task: 0xff9f2e, road: 0x2b2a36, edge: 0x6e7cf6, line: 0xfff6e8,
  grass: 0x16301f, tree: 0x2f8f5b, barrier1: 0xff3d97, barrier2: 0xfff6e8,
  cone: 0xff9f2e, pothole: 0x14131a, boxBg: 0x0d0c12, boxFg: 0xfff6e8,
  gates: [0x6e7cf6, 0xff3d97, 0xf2a33a], retro: false,
}

export const RETRO_PALETTE: Palette = {
  hudBg: 0x000000, title: 0x33ff66, text: 0x33ff66, dim: 0x1f9a40,
  coin: 0xffff33, task: 0xff9f2e, road: 0x000000, edge: 0xff00ff, line: 0x00ffff,
  grass: 0x000000, tree: 0x0f6b2a, barrier1: 0xff00ff, barrier2: 0x00ffff,
  cone: 0xffff33, pothole: 0x1a1a1a, boxBg: 0x000000, boxFg: 0x33ff66,
  gates: [0x00ffff, 0xff00ff, 0xffff33], retro: true,
}

const hex = (v: unknown): number | undefined => {
  if (typeof v !== 'string') return undefined
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim())
  return m?.[1] ? parseInt(m[1], 16) : undefined
}

export type SkinPalette = { primary?: string; secondary?: string; accent?: string; background?: string; text?: string }

export const skinPalette = (base: Palette, skin: SkinPalette | undefined): Palette => {
  if (!skin || base.retro) return base
  const primary = hex(skin.primary)
  const accent = hex(skin.accent ?? skin.secondary)
  const bg = hex(skin.background)
  const text = hex(skin.text)
  const out = { ...base }
  if (primary !== undefined) {
    out.edge = primary
    out.gates = [primary, out.gates[1], out.gates[2]]
  }
  if (accent !== undefined) {
    out.title = accent
    out.barrier1 = accent
    out.gates = [out.gates[0], accent, out.gates[2]]
  }
  if (bg !== undefined) {
    out.hudBg = bg
    out.boxBg = bg
  }
  if (text !== undefined) {
    out.text = text
    out.boxFg = text
    out.line = text
    out.barrier2 = text
  }
  return out
}

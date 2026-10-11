// The known styles: how an option label is recognised, and the tokens the
// gallery page paints its sample from.

export type StyleId =
  | 'minimal'
  | 'brutalist'
  | 'glassmorphism'
  | 'neumorphism'
  | 'material'
  | 'flat'
  | 'skeuomorphic'
  | 'dark'
  | 'light'
  | 'retro'
  | 'editorial'
  | 'bento'
  | 'corporate'

export type KnownStyle = {
  id: StyleId
  name: string
  pattern: RegExp
  // CSS custom properties for the sample (without the leading dashes).
  vars: Record<string, string>
  // Extra CSS that the tokens cannot say; written against `.s-<id>`.
  css?: string
}

export const KNOWN_STYLES: readonly KnownStyle[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    pattern: /\bminimal(?:ist|ism|istic)?\b/i,
    vars: { bg: '#ffffff', fg: '#111111', muted: '#8a8a8a', accent: '#111111', btnfg: '#ffffff', card: '#ffffff', radius: '2px', font: 'system-ui, "Segoe UI", sans-serif', border: '1px solid #ececec', shadow: 'none', btnshadow: 'none', weight: '300', pad: '22px' },
  },
  {
    id: 'brutalist',
    name: 'Brutalist',
    pattern: /\b(?:neo[- ]?)?brutal(?:ist|ism)?\b/i,
    vars: { bg: '#fff3b0', fg: '#000000', muted: '#222222', accent: '#ff4d4d', btnfg: '#000000', card: '#ffffff', radius: '0', font: '"Courier New", Courier, monospace', border: '3px solid #000000', shadow: '6px 6px 0 #000000', btnshadow: '3px 3px 0 #000000', weight: '700', pad: '16px' },
    css: '.s-brutalist .t,.s-brutalist .b{text-transform:uppercase}.s-brutalist .b{border:3px solid #000}',
  },
  {
    id: 'glassmorphism',
    name: 'Glassmorphism',
    pattern: /\bglass(?:morphism|morphic|y)?\b|\bfrosted\b/i,
    vars: { bg: 'linear-gradient(135deg, #5b6cf0, #b45bd8 55%, #f08a5b)', fg: '#ffffff', muted: 'rgba(255,255,255,0.8)', accent: '#ffffff', btnfg: '#ffffff', card: 'rgba(255,255,255,0.2)', radius: '18px', font: 'system-ui, "Segoe UI", sans-serif', border: '1px solid rgba(255,255,255,0.45)', shadow: '0 8px 32px rgba(0,0,0,0.22)', btnshadow: 'none', weight: '500', pad: '18px' },
    css: '.s-glassmorphism .card{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}.s-glassmorphism .b{background:rgba(255,255,255,0.28);border:1px solid rgba(255,255,255,0.5)}',
  },
  {
    id: 'neumorphism',
    name: 'Neumorphism',
    pattern: /\bneu(?:o)?morphi(?:sm|c)\b|\bsoft ui\b/i,
    vars: { bg: '#e0e5ec', fg: '#44476a', muted: '#6b6f8f', accent: '#e0e5ec', btnfg: '#44476a', card: '#e0e5ec', radius: '20px', font: 'system-ui, "Segoe UI", sans-serif', border: 'none', shadow: '9px 9px 18px #b8bec7, -9px -9px 18px #ffffff', btnshadow: '5px 5px 10px #b8bec7, -5px -5px 10px #ffffff', weight: '600', pad: '20px' },
  },
  {
    id: 'material',
    name: 'Material',
    pattern: /\bmaterial\b/i,
    vars: { bg: '#fef7ff', fg: '#1c1b1f', muted: '#49454f', accent: '#6750a4', btnfg: '#ffffff', card: '#ffffff', radius: '4px', font: 'Roboto, "Segoe UI", system-ui, sans-serif', border: 'none', shadow: '0 1px 3px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.15)', btnshadow: '0 1px 2px rgba(0,0,0,0.3)', weight: '500', pad: '18px' },
    css: '.s-material .b{text-transform:uppercase;letter-spacing:0.08em;font-size:11px}',
  },
  {
    id: 'flat',
    name: 'Flat',
    pattern: /\bflat\b/i,
    vars: { bg: '#f4f1de', fg: '#3d405b', muted: '#6d6f84', accent: '#e07a5f', btnfg: '#ffffff', card: '#81b29a', radius: '0', font: 'system-ui, "Segoe UI", sans-serif', border: 'none', shadow: 'none', btnshadow: 'none', weight: '600', pad: '18px' },
    css: '.s-flat .card{color:#ffffff}.s-flat .card .k,.s-flat .card .p{color:#f4f1de}',
  },
  {
    id: 'skeuomorphic',
    name: 'Skeuomorphic',
    pattern: /\bskeuomorph(?:ic|ism)?\b/i,
    vars: { bg: 'linear-gradient(#8b5a2b, #5e3a17)', fg: '#2d2216', muted: '#5b4a35', accent: '#3a7bd5', btnfg: '#ffffff', card: 'linear-gradient(#f6ecd2, #e3d3aa)', radius: '8px', font: 'Georgia, "Times New Roman", serif', border: '2px dashed #8a6a3b', shadow: 'inset 0 1px 0 #fffbe9, 0 4px 8px rgba(0,0,0,0.5)', btnshadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 3px rgba(0,0,0,0.5)', weight: '700', pad: '18px' },
    css: '.s-skeuomorphic .b{background:linear-gradient(#6aa5f0,#2a62b8);border:1px solid #1d4a8e;text-shadow:0 -1px 0 rgba(0,0,0,0.4)}',
  },
  {
    id: 'dark',
    name: 'Dark',
    pattern: /\bdark\b/i,
    vars: { bg: '#0d1117', fg: '#e6edf3', muted: '#8b949e', accent: '#58a6ff', btnfg: '#0d1117', card: '#161b22', radius: '8px', font: 'system-ui, "Segoe UI", sans-serif', border: '1px solid #30363d', shadow: 'none', btnshadow: 'none', weight: '500', pad: '18px' },
  },
  {
    id: 'light',
    name: 'Light',
    pattern: /\blight\b/i,
    vars: { bg: '#f6f8fa', fg: '#1f2328', muted: '#656d76', accent: '#0969da', btnfg: '#ffffff', card: '#ffffff', radius: '8px', font: 'system-ui, "Segoe UI", sans-serif', border: '1px solid #d0d7de', shadow: '0 1px 2px rgba(31,35,40,0.08)', btnshadow: 'none', weight: '500', pad: '18px' },
  },
  {
    id: 'retro',
    name: 'Retro',
    pattern: /\bretro\b|\bvintage\b/i,
    vars: { bg: '#fdf0d5', fg: '#3a2e5a', muted: '#6b5b8c', accent: '#ff6f59', btnfg: '#fdf0d5', card: '#fffaf0', radius: '0', font: '"Courier New", Courier, monospace', border: '3px solid #3a2e5a', shadow: '5px 5px 0 #43b0a4', btnshadow: '3px 3px 0 #3a2e5a', weight: '700', pad: '16px' },
    css: '.s-retro .t{text-shadow:2px 2px 0 #43b0a4}.s-retro .k{background:repeating-linear-gradient(90deg,#ff6f59 0 14px,#f9c74f 14px 28px,#43b0a4 28px 42px);height:6px;color:transparent;overflow:hidden}',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    pattern: /\beditorial\b|\bmagazine\b/i,
    vars: { bg: '#faf7f2', fg: '#1b1b1b', muted: '#6a6a6a', accent: '#b3001b', btnfg: '#faf7f2', card: '#faf7f2', radius: '0', font: 'Georgia, "Times New Roman", serif', border: 'none', shadow: 'none', btnshadow: 'none', weight: '400', pad: '20px' },
    css: '.s-editorial .card{border-top:3px double #1b1b1b;border-bottom:1px solid #1b1b1b}.s-editorial .k{text-transform:uppercase;letter-spacing:0.18em;font-size:10px;color:#b3001b}.s-editorial .t{font-size:24px;line-height:1.1;font-weight:700}.s-editorial .b{background:none;color:#1b1b1b;border-bottom:1px solid #1b1b1b;padding:0}',
  },
  {
    id: 'bento',
    name: 'Bento',
    pattern: /\bbento\b/i,
    vars: { bg: '#f2f2f7', fg: '#1c1c1e', muted: '#636366', accent: '#5e5ce6', btnfg: '#ffffff', card: '#ffffff', radius: '16px', font: 'system-ui, "Segoe UI", sans-serif', border: 'none', shadow: 'none', btnshadow: 'none', weight: '600', pad: '10px' },
    css: '.s-bento .card{display:grid;grid-template-columns:1.4fr 1fr;grid-template-rows:auto auto;gap:8px;background:none;padding:0;box-shadow:none;border:none}.s-bento .card>div{border-radius:16px;padding:12px}.s-bento .k{background:#ffd6e0;grid-column:1;grid-row:1}.s-bento .t{background:#d6e4ff;grid-column:2;grid-row:1 / span 2;margin:0}.s-bento .p{background:#d9f5e1;grid-column:1;grid-row:2;margin:0}.s-bento .b{display:none}',
  },
  {
    id: 'corporate',
    name: 'Corporate',
    pattern: /\bcorporate\b/i,
    vars: { bg: '#eef2f7', fg: '#1b2a41', muted: '#5a6b82', accent: '#1f4e8c', btnfg: '#ffffff', card: '#ffffff', radius: '4px', font: '"Segoe UI", Arial, sans-serif', border: '1px solid #cfd8e3', shadow: '0 1px 2px rgba(27,42,65,0.1)', btnshadow: 'none', weight: '600', pad: '18px' },
    css: '.s-corporate .k{background:#1f4e8c;color:#ffffff;margin:-18px -18px 12px;padding:8px 18px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase}',
  },
]

// The known style an option label names, if any. When a label names two
// ("Dark minimal"), the one that comes first wins.
export function matchStyle(label: unknown): StyleId | null {
  if (typeof label !== 'string') return null

  let best: { id: StyleId; at: number } | null = null
  for (const style of KNOWN_STYLES) {
    const at = label.search(style.pattern)
    if (at >= 0 && (best === null || at < best.at)) best = { id: style.id, at }
  }

  return best === null ? null : best.id
}

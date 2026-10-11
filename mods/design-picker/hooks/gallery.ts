// Builds the self-contained gallery page: inline CSS, no scripts, no
// external requests. One card per option; known styles get a CSS sample.

import type { LookQuestion } from './detect'
import { KNOWN_STYLES } from './styles'
import type { KnownStyle } from './styles'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function styleRules(style: KnownStyle): string {
  const vars = Object.entries(style.vars)
    .map(([name, value]) => `--${name}:${value}`)
    .join(';')

  return `.s-${style.id}{${vars}}${style.css ?? ''}`
}

const PAGE_CSS = `
:root{color-scheme:light dark;--page:#f5f5f7;--ink:#1d1d1f;--sub:#5f6368;--panel:#ffffff;--line:#d9d9de;--chip:#e8e8ed}
@media (prefers-color-scheme:dark){:root{--page:#16171a;--ink:#f2f2f4;--sub:#a1a1aa;--panel:#212226;--line:#34363b;--chip:#2c2d32}}
*{box-sizing:border-box}
body{margin:0;padding:28px 20px 48px;background:var(--page);color:var(--ink);font:15px/1.5 system-ui,"Segoe UI",Roboto,sans-serif}
main{max-width:1040px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}
.lead{margin:0 0 28px;color:var(--sub)}
section{margin:0 0 36px}
h2{font-size:17px;margin:0 0 2px}
.q{margin:0 0 14px;color:var(--sub)}
.tag{display:inline-block;margin-right:8px;padding:1px 8px;border-radius:99px;background:var(--chip);color:var(--sub);font-size:12px;vertical-align:1px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.opt{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px}
.opt .name{display:flex;align-items:baseline;gap:8px;font-weight:600}
.num{flex:none;width:22px;height:22px;border-radius:99px;background:var(--chip);color:var(--sub);font-size:12px;line-height:22px;text-align:center}
.opt .desc{margin:0;color:var(--sub);font-size:13px}
.neutral{min-height:132px;display:flex;align-items:center;justify-content:center;padding:14px;border:1px dashed var(--line);border-radius:10px;color:var(--sub);text-align:center;font-size:13px}
.demo{position:relative;min-height:150px;padding:14px;border-radius:10px;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--font);display:flex;align-items:center}
.demo .card{width:100%;padding:var(--pad);border-radius:var(--radius);background:var(--card);border:var(--border);box-shadow:var(--shadow);font-weight:var(--weight)}
.demo .k{font-size:10px;color:var(--muted);margin:0 0 6px}
.demo .t{font-size:16px;font-weight:700;margin:0 0 4px}
.demo .p{font-size:12px;color:var(--muted);margin:0 0 10px;font-weight:400}
.demo .b{display:inline-block;padding:5px 12px;border-radius:var(--radius);background:var(--accent);color:var(--btnfg);font-size:12px;box-shadow:var(--btnshadow)}
`

function sample(style: KnownStyle): string {
  const label = `Sample of the ${style.name} style`
  return (
    `<div class="demo s-${style.id}" role="img" aria-label="${escapeHtml(label)}">` +
    '<div class="card"><div class="k">New this week</div><div class="t">Sample heading</div>' +
    '<div class="p">A short line of text to show the feel.</div><div class="b">Button</div></div></div>'
  )
}

function card(index: number, option: LookQuestion['options'][number]): string {
  const style = KNOWN_STYLES.find(candidate => candidate.id === option.style)
  const visual = style
    ? sample(style)
    : `<div class="neutral">${escapeHtml(option.label)}</div>`
  const description = option.description === '' ? '' : `<p class="desc">${escapeHtml(option.description)}</p>`

  return (
    '<article class="opt">' +
    `<div class="name"><span class="num">${index + 1}</span><span>${escapeHtml(option.label)}</span></div>` +
    `${visual}${description}</article>`
  )
}

function section(question: LookQuestion): string {
  const header = question.header === '' ? '' : `<span class="tag">${escapeHtml(question.header)}</span>`
  const title = question.question === '' ? 'Options' : question.question
  const cards = question.options.map((option, index) => card(index, option)).join('')

  return `<section><h2>${header}${escapeHtml(title)}</h2><p class="q">Pick in Claude Code. This page is only a preview.</p><div class="grid">${cards}</div></section>`
}

export function buildGalleryHtml(questions: readonly LookQuestion[]): string {
  const used = new Set(questions.flatMap(question => question.options.map(option => option.style)))
  const rules = KNOWN_STYLES.filter(style => used.has(style.id)).map(styleRules).join('\n')

  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Design options</title>' +
    `<style>${PAGE_CSS}\n${rules}</style></head><body><main>` +
    '<h1>Design options</h1><p class="lead">Claude is asking you to choose a look. Here is what each choice looks like.</p>' +
    `${questions.map(section).join('')}</main></body></html>`
  )
}

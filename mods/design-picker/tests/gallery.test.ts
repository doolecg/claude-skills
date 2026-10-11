import { expect, test } from 'claude-code/testing'

import { detectLooks } from '../hooks/detect'
import { buildGalleryHtml } from '../hooks/gallery'
import { KNOWN_STYLES } from '../hooks/styles'

const call = (labels: string[]) =>
  detectLooks([{ question: 'Which style?', header: 'Style', multiSelect: false, options: labels.map(label => ({ label, description: `About ${label}` })) }])

test('every known style gets a CSS sample card', () => {
  const html = buildGalleryHtml(call(KNOWN_STYLES.map(style => style.name)))
  for (const style of KNOWN_STYLES) {
    expect(html).toContain(`s-${style.id}`)
    expect(html).toContain(`Sample of the ${style.name} style`)
  }
})

test('an unknown option gets a neutral card with its text', () => {
  const html = buildGalleryHtml(call(['Playful', 'Minimal']))
  expect(html).toContain('class="neutral">Playful<')
  expect(html).toContain('About Playful')
  expect(html).not.toContain('s-dark{')
})

test('options are numbered in the order they were asked', () => {
  const html = buildGalleryHtml(call(['Playful', 'Minimal']))
  expect(html.indexOf('<span class="num">1</span><span>Playful')).toBeGreaterThan(-1)
  expect(html.indexOf('<span class="num">2</span><span>Minimal')).toBeGreaterThan(html.indexOf('Playful'))
})

test('text from the question is escaped', () => {
  const html = buildGalleryHtml(
    detectLooks([
      {
        question: 'Style <script>alert(1)</script> & "more"?',
        header: '<b>H</b>',
        multiSelect: false,
        options: [{ label: '<img src=x onerror=1>', description: "it's" }, { label: 'Dark' }],
      },
    ]),
  )
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('<img src=x')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('&amp;')
  expect(html).toContain('it&#39;s')
})

test('the page is self-contained and follows light and dark', () => {
  const html = buildGalleryHtml(call(['Dark', 'Light']))
  expect(html.startsWith('<!doctype html>')).toBe(true)
  expect(html).toContain('prefers-color-scheme:dark')
  expect(html).not.toMatch(/<script|<link|@import|https?:\/\//i)
  expect(html).not.toMatch(/url\(/i)
})

test('one section per look question', () => {
  const two = detectLooks([
    { question: 'Which style?', header: 'Style', multiSelect: false, options: [{ label: 'Flat' }, { label: 'Retro' }] },
    { question: 'Which layout?', header: 'Layout', multiSelect: false, options: [{ label: 'Sidebar' }, { label: 'Top bar' }] },
  ])
  const html = buildGalleryHtml(two)
  expect(html.split('<section>').length - 1).toBe(2)
})

import { expect, test } from 'claude-code/testing'

import { detectLooks, isLookWords } from '../hooks/detect'
import { matchStyle } from '../hooks/styles'

const q = (question: string, header: string, labels: string[]) => ({
  question,
  header,
  multiSelect: false,
  options: labels.map(label => ({ label, description: `${label} option` })),
})

test('each look word in the question is picked up', () => {
  const sentences = [
    'Which design do you want?',
    'What style should it use?',
    'Pick a theme for the app',
    'Which aesthetic fits?',
    'Which visual style do you prefer?',
    'What look and feel are you after?',
    'What look & feel should it have?',
    'Which color scheme?',
    'Which colour scheme?',
    'How should the layout work?',
  ]
  for (const sentence of sentences) {
    expect(isLookWords('', sentence)).toBe(true)
  }
})

test('look words in the header alone are enough', () => {
  const found = detectLooks([q('Which one should I use?', 'Theme', ['Option A', 'Option B'])])
  expect(found.length).toBe(1)
  expect(found[0]?.why).toBe('words')
})

test('two options that name known styles are enough without any look word', () => {
  const found = detectLooks([q('Which one?', 'Pick', ['Dark', 'Light', 'Something else'])])
  expect(found.length).toBe(1)
  expect(found[0]?.why).toBe('styles')
  expect(found[0]?.options.map(option => option.style)).toEqual(['dark', 'light', null])
})

test('a single known style is not enough', () => {
  expect(detectLooks([q('Which one?', 'Pick', ['Dark', 'Postgres'])])).toEqual([])
})

test('unrelated questions are left alone', () => {
  expect(detectLooks([q('Run the tests now?', 'Tests', ['Yes', 'No'])])).toEqual([])
  expect(detectLooks([q('Which database should we use?', 'Database', ['Postgres', 'SQLite'])])).toEqual([])
})

test('look words inside other words do not count', () => {
  expect(isLookWords('', 'Should I add a stylesheet?')).toBe(false)
  expect(isLookWords('', 'Is this the designated folder?')).toBe(false)
  expect(isLookWords('', 'Delay the layoff notice?')).toBe(false)
})

test('only the look questions of a call are returned', () => {
  const found = detectLooks([q('Which database?', 'Database', ['A', 'B']), q('Which style?', 'Style', ['Minimal', 'Bento'])])
  expect(found.length).toBe(1)
  expect(found[0]?.header).toBe('Style')
})

test('a question with no options is skipped', () => {
  expect(detectLooks([{ question: 'What style do you want?', header: 'Style', kind: 'text', multiSelect: false }])).toEqual([])
})

test('malformed input is ignored', () => {
  expect(detectLooks(undefined)).toEqual([])
  expect(detectLooks('style')).toEqual([])
  expect(detectLooks([null, 5, { question: 7 }, { question: 'style?', options: 'x' }, { question: 'style?', options: [{ label: '' }, null] }])).toEqual([])
})

test('known styles are recognised by their names and common forms', () => {
  expect(matchStyle('Minimal')).toBe('minimal')
  expect(matchStyle('Minimalist')).toBe('minimal')
  expect(matchStyle('Brutalism')).toBe('brutalist')
  expect(matchStyle('Neo-brutalist')).toBe('brutalist')
  expect(matchStyle('Glassmorphism')).toBe('glassmorphism')
  expect(matchStyle('Frosted glass')).toBe('glassmorphism')
  expect(matchStyle('Neumorphism')).toBe('neumorphism')
  expect(matchStyle('Material Design')).toBe('material')
  expect(matchStyle('Flat')).toBe('flat')
  expect(matchStyle('Skeuomorphic')).toBe('skeuomorphic')
  expect(matchStyle('Dark mode')).toBe('dark')
  expect(matchStyle('Light')).toBe('light')
  expect(matchStyle('Retro')).toBe('retro')
  expect(matchStyle('Editorial')).toBe('editorial')
  expect(matchStyle('Bento grid')).toBe('bento')
  expect(matchStyle('Corporate')).toBe('corporate')
})

test('other labels get no style, and the earliest style in a label wins', () => {
  expect(matchStyle('Playful')).toBe(null)
  expect(matchStyle('Lightweight')).toBe(null)
  expect(matchStyle('Flattened')).toBe(null)
  expect(matchStyle(42)).toBe(null)
  expect(matchStyle('Dark minimal')).toBe('dark')
  expect(matchStyle('Minimal dark')).toBe('minimal')
})

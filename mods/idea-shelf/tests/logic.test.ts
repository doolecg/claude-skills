import { describe, expect, test } from 'claude-code/testing'

import {
  MAX_IDEA_CHARS,
  addIdea,
  checkIdeaText,
  editIdeaAt,
  editIdeaById,
  normalizeFolder,
  parseIdeaArgs,
  parseShelf,
  removeIdea,
  shelfKey,
} from '../hooks/logic'

const shelf = [
  { id: 'a', text: 'first', at: 1 },
  { id: 'b', text: 'second', at: 2 },
  { id: 'c', text: 'third', at: 3 },
]

describe('parseIdeaArgs', () => {
  test('empty arguments show usage', () => {
    expect(parseIdeaArgs('')).toEqual({ kind: 'usage' })
    expect(parseIdeaArgs('   ')).toEqual({ kind: 'usage' })
  })

  test('plain text is an idea, trimmed', () => {
    expect(parseIdeaArgs('  try a dark theme  ')).toEqual({ kind: 'add', text: 'try a dark theme' })
  })

  test('edit with a number and text', () => {
    expect(parseIdeaArgs('edit 2 a better idea')).toEqual({ kind: 'edit', n: 2, text: 'a better idea' })
    expect(parseIdeaArgs('EDIT 10   spaced   out')).toEqual({ kind: 'edit', n: 10, text: 'spaced   out' })
  })

  test('edit keeps line breaks in the new text', () => {
    expect(parseIdeaArgs('edit 1 line one\nline two')).toEqual({ kind: 'edit', n: 1, text: 'line one\nline two' })
  })

  test('edit without text or with a zero number is an error', () => {
    expect(parseIdeaArgs('edit 2').kind).toBe('error')
    expect(parseIdeaArgs('edit 0 something').kind).toBe('error')
    expect(parseIdeaArgs('edit').kind).toBe('error')
  })

  test('an idea that starts with the word edit is still an idea', () => {
    expect(parseIdeaArgs('edit the readme')).toEqual({ kind: 'add', text: 'edit the readme' })
    expect(parseIdeaArgs('editor plugin')).toEqual({ kind: 'add', text: 'editor plugin' })
  })
})

describe('shelf keying', () => {
  test('folders differing only by case, slashes or a trailing slash share a key', () => {
    expect(shelfKey('C:\\Work\\Proj')).toBe(shelfKey('c:/work/proj/'))
    expect(shelfKey('/Users/Me/App')).toBe(shelfKey('/users/me/app'))
    expect(normalizeFolder('C:\\\\Work\\Proj\\')).toBe('c:/work/proj')
  })

  test('a subfolder is its own shelf', () => {
    expect(shelfKey('/work/proj')).not.toBe(shelfKey('/work/proj/sub'))
  })

  test('the filesystem root stays a root', () => {
    expect(normalizeFolder('/')).toBe('/')
  })
})

describe('length limit', () => {
  test('2000 characters pass, 2001 are refused with a plain message', () => {
    expect(MAX_IDEA_CHARS).toBe(2000)
    expect(checkIdeaText('x'.repeat(2000))).toBeNull()
    const refused = checkIdeaText('x'.repeat(2001))
    expect(refused).toContain('2000')
    expect(refused).toContain('nothing was saved')
  })

  test('empty and blank text are refused', () => {
    expect(checkIdeaText('')).toBe('An idea cannot be empty.')
    expect(checkIdeaText('   \n ')).toBe('An idea cannot be empty.')
  })
})

describe('shelf edits', () => {
  test('addIdea appends and trims', () => {
    const next = addIdea(shelf, '  new  ', 'd', 9)
    expect(next).toHaveLength(4)
    expect(next[3]).toEqual({ id: 'd', text: 'new', at: 9 })
    expect(shelf).toHaveLength(3)
  })

  test('editIdeaAt replaces in place and keeps id, position and time', () => {
    const next = editIdeaAt(shelf, 2, 'changed')
    expect(next?.map(i => i.text)).toEqual(['first', 'changed', 'third'])
    expect(next?.[1]).toEqual({ id: 'b', text: 'changed', at: 2 })
  })

  test('editIdeaAt rejects numbers outside the shelf', () => {
    expect(editIdeaAt(shelf, 0, 'x')).toBeNull()
    expect(editIdeaAt(shelf, 4, 'x')).toBeNull()
    expect(editIdeaAt(shelf, 1.5, 'x')).toBeNull()
  })

  test('editIdeaById and removeIdea work by id', () => {
    expect(editIdeaById(shelf, 'c', 'z')?.[2]?.text).toBe('z')
    expect(editIdeaById(shelf, 'missing', 'z')).toBeNull()
    expect(removeIdea(shelf, 'b').map(i => i.id)).toEqual(['a', 'c'])
  })

  test('parseShelf drops malformed entries', () => {
    expect(parseShelf(null)).toEqual([])
    expect(parseShelf([{ id: 'a', text: 'ok', at: 1 }, { id: 3 }, 'x', null])).toEqual([
      { id: 'a', text: 'ok', at: 1 },
    ])
  })
})

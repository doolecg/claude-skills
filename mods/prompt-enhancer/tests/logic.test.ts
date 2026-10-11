import { describe, expect, test } from 'claude-code/testing'

import {
  MAX_REWRITES,
  MAX_SESSION_TOKENS,
  buildPrompt,
  capReason,
  detectHold,
  failureText,
  formatRewrite,
  parseRewrite,
  skillNameOf,
  skillsNoteFor,
  usageTotal,
} from '../hooks/logic'

const GOOD = [
  'TASK:',
  'Add a dark mode switch to the settings page.',
  'LOAD THESE SKILLS:',
  '- plan: breaks the work into steps',
  '- ghost-skill: not in the list',
  'ASK ME FIRST ABOUT:',
  '- Should the choice be remembered between runs?',
  'DONE WHEN:',
  '- The switch changes the theme',
  '- Tests pass',
].join('\n')

describe('++ detection', () => {
  test('holds a typed prompt that starts with "++ "', () => {
    expect(detectHold('++ fix the login bug', 'composer')).toEqual({ kind: 'rewrite', task: 'fix the login bug' })
    expect(detectHold('++ x', 'bridge')).toEqual({ kind: 'rewrite', task: 'x' })
    expect(detectHold('++ x', 'unclassified')).toEqual({ kind: 'rewrite', task: 'x' })
  })

  test('keeps the lines and trims the ends of the task', () => {
    expect(detectHold('++   one\ntwo  ', 'composer')).toEqual({ kind: 'rewrite', task: 'one\ntwo' })
  })

  test('does not hold anything else', () => {
    expect(detectHold('++fix', 'composer')).toBeNull()
    expect(detectHold(' ++ fix', 'composer')).toBeNull()
    expect(detectHold('+++ fix', 'composer')).toBeNull()
    expect(detectHold('fix ++ it', 'composer')).toBeNull()
    expect(detectHold('', 'composer')).toBeNull()
  })

  test('ignores prompts that did not come from the user', () => {
    expect(detectHold('++ fix', 'plugin')).toBeNull()
    expect(detectHold('++ fix', 'sdk')).toBeNull()
    expect(detectHold('++ fix', 'scheduled-trigger')).toBeNull()
  })

  test('a bare prefix is reported as empty', () => {
    expect(detectHold('++ ', 'composer')).toEqual({ kind: 'empty' })
    expect(detectHold('++    ', 'composer')).toEqual({ kind: 'empty' })
  })
})

describe('the prompt built for the model', () => {
  test('lists the skills with their descriptions and wraps the rough text', () => {
    const text = buildPrompt('make it faster', [
      { name: 'plan', description: 'Plan   the\nwork' },
      { name: 'plugin:review', description: 'Review code' },
      { name: 'plan', description: 'duplicate' },
    ])
    expect(text).toContain('- plan: Plan the work')
    expect(text).toContain('- plugin:review: Review code')
    expect(text.match(/- plan:/g)).toHaveLength(1)
    expect(text).toContain('<rough_request>\nmake it faster\n</rough_request>')
  })

  test('shortens long descriptions and a very long list', () => {
    const long = buildPrompt('x', [{ name: 'a', description: 'd'.repeat(500) }])
    expect(long).toContain(`- a: ${'d'.repeat(157)}...`)
    const many = Array.from({ length: 2000 }, (_, i) => ({ name: `skill-${i}`, description: 'x'.repeat(100) }))
    const out = buildPrompt('x', many)
    expect(out.length).toBeLessThan(30_000)
    expect(out).toMatch(/\(\d+ more skills are not shown\)/)
  })

  test('with no readable skills it tells the model to list none', () => {
    expect(buildPrompt('x', null)).toContain('no skills are available')
    expect(buildPrompt('x', [])).toContain('no skills are available')
  })
})

describe('parsing the rewrite', () => {
  test('reads the four parts and drops skills that are not on the list', () => {
    const parts = parseRewrite(GOOD, ['plan', 'plugin:review'])
    expect(parts).toEqual({
      task: 'Add a dark mode switch to the settings page.',
      skills: ['plan: breaks the work into steps'],
      ask: ['Should the choice be remembered between runs?'],
      done: ['The switch changes the theme', 'Tests pass'],
    })
  })

  test('accepts the bare skill name of a plugin skill, any case, and decorated headings', () => {
    const text = '## Task:\nDo it\n**Load these skills:**\n- `Review`: x\nAsk me first about:\n- nothing\nDone when:\n1. ok'
    const parts = parseRewrite(text, ['plugin:review'])
    expect(parts?.skills).toEqual(['`Review`: x'])
    expect(parts?.ask).toEqual([])
    expect(parts?.done).toEqual(['ok'])
  })

  test('"none" lines mean an empty list', () => {
    const parts = parseRewrite('TASK:\nDo it\nLOAD THESE SKILLS:\n- none\nASK ME FIRST ABOUT:\n- nothing\nDONE WHEN:\n- it works', ['plan'])
    expect(parts?.skills).toEqual([])
    expect(parts?.ask).toEqual([])
  })

  test('text before the first heading counts as the task; inline text after a heading is kept', () => {
    const parts = parseRewrite('Just do it\nLOAD THESE SKILLS:\nASK ME FIRST ABOUT:\nDONE WHEN: it ships', null)
    expect(parts?.task).toBe('Just do it')
    expect(parts?.done).toEqual(['it ships'])
  })

  test('without a known list every named skill is kept', () => {
    expect(parseRewrite(GOOD, null)?.skills).toHaveLength(2)
  })

  test('rejects a reply that is missing a part, has an empty task or has no finish line', () => {
    expect(parseRewrite('TASK:\nx\nLOAD THESE SKILLS:\n- none\nDONE WHEN:\n- y', null)).toBeNull()
    expect(parseRewrite('TASK:\n\nLOAD THESE SKILLS:\n- none\nASK ME FIRST ABOUT:\n- nothing\nDONE WHEN:\n- y', null)).toBeNull()
    expect(parseRewrite('TASK:\nx\nLOAD THESE SKILLS:\n- none\nASK ME FIRST ABOUT:\n- nothing\nDONE WHEN:\n', null)).toBeNull()
    expect(parseRewrite('Sure, here is a better prompt.', null)).toBeNull()
    expect(parseRewrite('', null)).toBeNull()
  })

  test('rejects a repeated heading', () => {
    expect(parseRewrite(`${GOOD}\nDONE WHEN:\n- again`, null)).toBeNull()
  })

  test('skillNameOf takes the name at the front of a line', () => {
    expect(skillNameOf('plan: why')).toBe('plan')
    expect(skillNameOf('`plugin:review` - why')).toBe('plugin:review')
    expect(skillNameOf('')).toBe('')
  })
})

describe('the rewrite as a prompt', () => {
  const parts = { task: 'Do the thing.', skills: ['plan: steps'], ask: ['Which database?'], done: ['Tests pass'] }

  test('has the four parts in order', () => {
    expect(formatRewrite(parts)).toBe(
      [
        'Do the thing.',
        '',
        'Load these skills:',
        '- plan: steps',
        '',
        'Ask me first about:',
        '- Which database?',
        '',
        'Done when:',
        '- Tests pass',
      ].join('\n'),
    )
  })

  test('fills empty lists and says so when skills could not be read', () => {
    const empty = formatRewrite({ ...parts, skills: [], ask: [] })
    expect(empty).toContain('Load these skills:\n- No skills needed.')
    expect(empty).toContain('Ask me first about:\n- Nothing big. Go ahead.')
    const note = skillsNoteFor(0, [{ reason: 'permission denied' }], null)
    expect(note).toBe('Skills could not be read (permission denied), so none are suggested.')
    expect(formatRewrite({ ...parts, skills: [note!] })).toContain(`Load these skills:\n- ${note}`)
  })

  test('skillsNoteFor: a thrown error, no skills, and fine', () => {
    expect(skillsNoteFor(3, [{ reason: 'one folder' }], null)).toBeNull()
    expect(skillsNoteFor(0, [], null)).toBe('No skills were found, so none are suggested.')
    expect(skillsNoteFor(0, [], 'boom')).toContain('Skills could not be read (boom)')
  })
})

describe('caps and usage', () => {
  test('stops at 20 rewrites or 120k tokens', () => {
    expect(capReason({ count: MAX_REWRITES - 1, tokens: 0 })).toBeNull()
    expect(capReason({ count: MAX_REWRITES, tokens: 0 })).toContain('20 rewrites')
    expect(capReason({ count: 0, tokens: MAX_SESSION_TOKENS - 1 })).toBeNull()
    expect(capReason({ count: 0, tokens: MAX_SESSION_TOKENS })).toContain('120k tokens')
  })

  test('usage counts all four token kinds', () => {
    expect(
      usageTotal({ input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 4, cache_creation_input_tokens: 8 }),
    ).toBe(15)
    expect(usageTotal(undefined)).toBe(0)
  })

  test('failure wording', () => {
    expect(failureText({ isAnswered: false, reason: 'api-error', status: 529 })).toBe('The rewrite failed (error 529).')
    expect(failureText({ isAnswered: false, reason: 'aborted' })).toContain('too long')
    expect(failureText({ isAnswered: false, reason: 'empty-reply' })).toContain('no text')
  })
})

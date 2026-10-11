import { describe, expect, test } from 'claude-code/testing'

import {
  EMPTY_STATE,
  MAX_CHECKS,
  MAX_CHECK_TOKENS,
  SECTION_TEXT,
  addTool,
  bandText,
  checkPrompt,
  firstWords,
  isCheckable,
  isUnderCaps,
  parseBandCommand,
  parseVerdict,
  removeTool,
  statusText,
  usageTotal,
} from '../hooks/logic.ts'

const turn = { answer: 'x'.repeat(400), isAborted: false, reason: 'answer' }

describe('parseVerdict', () => {
  test('PASS in any case, with trailing words', () => {
    expect(parseVerdict('PASS')).toEqual({ isOk: true })
    expect(parseVerdict('  pass.\n')).toEqual({ isOk: true })
    expect(parseVerdict('Pass - all rules hold')).toEqual({ isOk: true })
  })

  test('FAIL carries the rule missed', () => {
    expect(parseVerdict('FAIL: no Next steps section')).toEqual({
      isOk: false,
      rule: 'no Next steps section',
    })
    expect(parseVerdict('fail - "Too much narration".')).toEqual({
      isOk: false,
      rule: 'Too much narration',
    })
    expect(parseVerdict('FAIL:\nprose outside Summary\nmore')).toEqual({
      isOk: false,
      rule: 'prose outside Summary',
    })
  })

  test('FAIL with no rule gets a plain fallback, long rules are cut', () => {
    expect(parseVerdict('FAIL')).toEqual({ isOk: false, rule: 'a style rule' })
    const r = parseVerdict(`FAIL: ${'a'.repeat(200)}`)
    expect(r && !r.isOk && r.rule.length).toBe(80)
  })

  test('junk is not a verdict', () => {
    expect(parseVerdict('')).toBe(null)
    expect(parseVerdict('Looks fine to me')).toBe(null)
    expect(parseVerdict('The reply would PASS')).toBe(null)
  })
})

describe('eligibility', () => {
  test('needs a main-agent, finished answer of at least 400 characters', () => {
    expect(isCheckable(turn)).toBe(true)
    expect(isCheckable({ ...turn, answer: 'x'.repeat(399) })).toBe(false)
    expect(isCheckable({ ...turn, isAborted: true, reason: 'aborted' })).toBe(false)
    expect(isCheckable({ ...turn, reason: 'error' })).toBe(false)
    expect(isCheckable({ ...turn, reason: 'refusal' })).toBe(false)
    expect(isCheckable({ ...turn, agentId: 'agent-1' })).toBe(false)
  })
})

describe('caps', () => {
  test('stop at 25 checks or 150k tokens', () => {
    expect(isUnderCaps(EMPTY_STATE)).toBe(true)
    expect(isUnderCaps({ ...EMPTY_STATE, checks: MAX_CHECKS - 1 })).toBe(true)
    expect(isUnderCaps({ ...EMPTY_STATE, checks: MAX_CHECKS })).toBe(false)
    expect(isUnderCaps({ ...EMPTY_STATE, tokens: MAX_CHECK_TOKENS - 1 })).toBe(true)
    expect(isUnderCaps({ ...EMPTY_STATE, tokens: MAX_CHECK_TOKENS })).toBe(false)
  })

  test('usage is the sum of all four counts', () => {
    expect(
      usageTotal({
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 2,
      }),
    ).toBe(20)
  })
})

describe('status text', () => {
  test('first words of the prompt, cut to eight words', () => {
    expect(firstWords('  fix   the login bug  ')).toBe('fix the login bug')
    expect(firstWords('one two three four five six seven eight nine ten')).toBe(
      'one two three four five six seven eight',
    )
    expect(firstWords('   ')).toBe('')
  })

  test('long words are cut to 60 characters', () => {
    const w = firstWords('a'.repeat(100))
    expect(w.length).toBe(60)
    expect(w.endsWith('...')).toBe(true)
  })

  test('shows the newest running tool, and nothing with no goal', () => {
    const base = { ...EMPTY_STATE, goal: 'fix the bug' }
    expect(statusText(base)).toBe('Working on: fix the bug')
    const one = { ...base, tools: addTool([], { id: 'a', tool: 'Read' }) }
    expect(statusText(one)).toBe('Working on: fix the bug (running Read)')
    const two = { ...base, tools: addTool(one.tools, { id: 'b', tool: 'Bash' }) }
    expect(statusText(two)).toBe('Working on: fix the bug (running Bash)')
    expect(statusText({ ...two, tools: removeTool(two.tools, 'b') })).toBe(
      'Working on: fix the bug (running Read)',
    )
    expect(statusText(EMPTY_STATE)).toBe(undefined)
  })
})

describe('text', () => {
  test('band words', () => {
    expect(bandText({ isOk: true })).toBe('Plain-English: ok')
    expect(bandText({ isOk: false, rule: 'no Next steps' })).toBe(
      'Plain-English: missed: no Next steps',
    )
  })

  test('the style section is short and names Summary and Next steps', () => {
    expect(SECTION_TEXT.length).toBeLessThan(400)
    expect(SECTION_TEXT).toContain('Summary')
    expect(SECTION_TEXT).toContain('Next steps')
  })

  test('a very long reply is cut for the check, keeping head and tail', () => {
    const p = checkPrompt(`HEAD${'m'.repeat(20000)}TAIL`)
    expect(p.length).toBeLessThan(9000)
    expect(p).toContain('HEAD')
    expect(p).toContain('TAIL')
    expect(checkPrompt('short')).toContain('short')
  })
})

describe('parseBandCommand', () => {
  test('band on and off, any case and spacing', () => {
    expect(parseBandCommand('band on')).toBe(true)
    expect(parseBandCommand('  BAND   Off ')).toBe(false)
  })

  test('anything else is not a band command', () => {
    for (const bad of ['', 'band', 'band maybe', 'on', 'show on', 'band on now']) {
      expect(parseBandCommand(bad)).toBe(null)
    }
  })
})

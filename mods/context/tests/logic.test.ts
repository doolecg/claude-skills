import { describe, expect, test } from 'claude-code/testing'

import {
  afterTool,
  contextOf,
  emptyFooter,
  gitInfo,
  hindsightFrom,
  isDue,
  isPersonPrompt,
  parseCounts,
  parseExtra,
  parseHindsightConfig,
  parseLimit,
  passesText,
  resetPasses,
} from '../hooks/logic'

const fresh = () => emptyFooter(3, []).passes

describe('pass counting', () => {
  test('the first check is pass 1', () => {
    expect(afterTool(fresh(), 'Bash', 'npm test').count).toBe(1)
  })

  test('two checks with no edit between are still pass 1', () => {
    const p = afterTool(afterTool(fresh(), 'Bash', 'npm test'), 'PowerShell', 'npx tsc')
    expect(p.count).toBe(1)
  })

  test('an edit and then a check is pass 2', () => {
    let p = afterTool(fresh(), 'Bash', 'npm test')
    p = afterTool(p, 'Edit', undefined)
    expect(p.editedSince).toBe(true)
    p = afterTool(p, 'Bash', 'npm test')
    expect(p.count).toBe(2)
    expect(p.editedSince).toBe(false)
  })

  test('every edit tool marks an edit; other tools change nothing', () => {
    for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) expect(afterTool(fresh(), t, undefined).editedSince).toBe(true)
    expect(afterTool(fresh(), 'Read', undefined)).toEqual(fresh())
    expect(afterTool(fresh(), 'Bash', 'ls')).toEqual(fresh())
  })

  test('extra words come from the passes', () => {
    expect(afterTool({ ...fresh(), extra: ['smoke'] }, 'Bash', './smoke.sh').count).toBe(1)
  })

  test('a reset sets count and edit back', () => {
    expect(resetPasses({ count: 2, limit: 3, editedSince: true, extra: [] })).toEqual({ count: 0, limit: 3, editedSince: false, extra: [] })
  })

  test('only the person own prompts count as the person own', () => {
    expect(isPersonPrompt({ kind: 'composer' }, false, false)).toBe(true)
    expect(isPersonPrompt({ kind: 'bridge' }, false, false)).toBe(true)
    expect(isPersonPrompt({ kind: 'plugin' }, false, false)).toBe(false)
    expect(isPersonPrompt({ kind: 'task-notification' }, false, false)).toBe(false)
    expect(isPersonPrompt({ kind: 'composer' }, true, false)).toBe(false)
    expect(isPersonPrompt({ kind: 'composer' }, false, true)).toBe(false)
  })

  test('the /passes text', () => {
    expect(passesText({ count: 2, limit: 3, editedSince: true, extra: [] })).toBe('Pass 2 of 3. An edit is waiting for the next check.')
    expect(passesText({ count: 0, limit: 3, editedSince: false, extra: [] })).toBe('Pass 0 of 3. No edit is waiting.')
  })
})

describe('options', () => {
  test('limit and extra words', () => {
    expect(parseLimit(5)).toBe(5)
    expect(parseLimit('x')).toBe(3)
    expect(parseLimit(0)).toBe(3)
    expect(parseExtra('smoke, e2e;  ,lint-all')).toEqual(['smoke', 'e2e', 'lint-all'])
    expect(parseExtra(undefined)).toEqual([])
  })
})

describe('hindsight', () => {
  test('config parse', () => {
    expect(parseHindsightConfig('{"serverMode":"self-hosted","apiUrl":"http://hs:8888/"}')).toEqual({ url: 'http://hs:8888', token: '' })
    expect(parseHindsightConfig('{"serverMode":"self-hosted","apiUrl":"http://hs:8888","apiToken":" t "}')?.token).toBe('t')
    expect(parseHindsightConfig('{"serverMode":"cloud","apiUrl":"http://hs:8888"}')).toBeNull()
    expect(parseHindsightConfig('{"serverMode":"self-hosted","apiUrl":"nope"}')).toBeNull()
    expect(parseHindsightConfig('not json')).toBeNull()
  })

  test('status from the answer', () => {
    expect(hindsightFrom(200)).toBe('up')
    expect(hindsightFrom(404)).toBe('up')
    expect(hindsightFrom(503)).toBe('down')
    expect(hindsightFrom(null)).toBe('down')
  })
})

describe('git, context and throttle', () => {
  test('git info', () => {
    expect(gitInfo('main\n', ' M a.ts\n?? b.ts\n', '1\t2')).toEqual({ branch: 'main', changed: 2, behind: 1, ahead: 2 })
    expect(gitInfo('main', '', null)).toEqual({ branch: 'main', changed: 0, ahead: 0, behind: 0 })
    expect(gitInfo(null, '', null)).toBeNull()
    expect(parseCounts('garbage')).toEqual({ ahead: 0, behind: 0 })
  })

  test('context from usage', () => {
    expect(contextOf({ context: { percent: 42, tokens: 84000, window: 200000 } })).toEqual({ percent: 42, tokens: 84000, window: 200000 })
    expect(contextOf({})).toEqual({ percent: null, tokens: null, window: null })
  })

  test('throttle', () => {
    expect(isDue(0, 100, 2000)).toBe(true)
    expect(isDue(1000, 2000, 2000)).toBe(false)
    expect(isDue(1000, 3000, 2000)).toBe(true)
  })
})

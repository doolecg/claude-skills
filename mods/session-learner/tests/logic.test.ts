import { describe, expect, test } from 'claude-code/testing'

import type { Lesson, SkillCard, SkillSession } from '../types'
import { isCorrectionText, parseDiff, parseTranscript, parseUntracked, renderTail } from '../hooks/evidence'
import { appliesItself, checkAgainstEvidence, extractJson, filterLessons, findContradiction, findDuplicate, isStale, mergeInto, parseLessons, riskOf } from '../hooks/lessons'
import {
  addMemoryLine,
  bandLine,
  buildBrief,
  briefLines,
  changeBudgetStop,
  costOf,
  endCounts,
  ensurePointer,
  gateReason,
  isInstalledRoot,
  jobsToPickUp,
  modelBudgetStop,
  parseJob,
  projectSlug,
  readSettings,
  removeMemoryLine,
  spendFor,
  workerArgv,
  DEFAULTS,
} from '../hooks/run'
import { compareBeforeAfter, correctionRate, extractRules, fixDraftText, groupProcedures, needsRewrite, newSkillDraft, sessionOutcome, unifiedDiff, validateDraft } from '../hooks/skillopt'
import { contradicts, hasSecret, scrubSecrets, similarity } from '../hooks/text'
import { assistant, interrupt, jsonl, sampleSession, toolResult, toolUse, user } from './fixtures'

const lesson = (over: Partial<Lesson> = {}): Lesson => ({
  id: over.id ?? 'l1',
  kind: 'convention',
  text: 'Use the withRetry helper for network calls.',
  scope: 'project',
  files: [],
  symbols: [],
  sourceSession: 's1',
  sessions: ['s1'],
  project: 'c:/work/proj',
  cwd: 'C:/work/proj',
  status: 'active',
  stores: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

describe('transcript', () => {
  test('reads prompts, final replies, tools, failures, corrections and skill loads; skips meta, commands and subagents', () => {
    const t = parseTranscript(sampleSession())
    expect(t.userTurns).toBe(2)
    expect(t.turns[0]!.prompt).toBe('Add a retry to fetchUser in src/api.ts')
    expect(t.turns[0]!.reply).toContain('I added a retry loop')
    expect(t.turns[0]!.tools.map(x => x.name)).toEqual(['Skill', 'Edit', 'Bash'])
    expect(t.turns[0]!.failures[0]).toContain('FAIL api.test.ts')
    expect(t.turns[1]!.isCorrection).toBe(true)
    expect(t.corrections).toHaveLength(1)
    expect(t.corrections[0]!.after).toContain('retry loop')
    expect(t.edits).toBe(2)
    expect(t.files).toEqual(['C:\\work\\proj\\src\\api.ts'])
    expect(t.skillLoads).toEqual([{ skill: 'api-helpers', turn: 0 }])
    expect(t.approxTokens).toBeGreaterThan(2000)
  })

  test('an interrupt makes the next prompt a correction and counts once', () => {
    const t = parseTranscript(jsonl([user('build it'), toolUse('Bash', { command: 'make' }, 'x'), interrupt(), user('build the docs first')]))
    expect(t.interrupts).toBe(1)
    expect(t.turns[0]!.interrupts).toBe(1)
    expect(t.turns[1]!.isCorrection).toBe(true)
  })

  test('broken lines are skipped', () => {
    const t = parseTranscript(`not json\n${JSON.stringify(user('hello there'))}\n{"type":`)
    expect(t.userTurns).toBe(1)
  })

  test('correction wording', () => {
    expect(isCorrectionText("No, that's the wrong file")).toBe(true)
    expect(isCorrectionText('use pnpm instead of npm')).toBe(true)
    expect(isCorrectionText('I said tabs')).toBe(true)
    expect(isCorrectionText('Great, now add a test')).toBe(false)
    expect(isCorrectionText('Nothing else, thanks')).toBe(false)
  })

  test('the tail marks corrections and keeps to its size', () => {
    const t = parseTranscript(sampleSession())
    const tail = renderTail(t)
    expect(tail).toContain('[Turn 2] (correction)')
    expect(tail).toContain('Tool failed:')
    expect(renderTail(t, 300).length).toBeLessThan(400)
  })
})

describe('git diff', () => {
  const diff = [
    'diff --git a/src/api.ts b/src/api.ts',
    'index 1..2 100644',
    '--- a/src/api.ts',
    '+++ b/src/api.ts',
    '@@ -10,0 +11,3 @@ export async function fetchUser(id: string) {',
    '+export function withRetry(fn) {',
    '+  return fn()',
    '+}',
    '@@ -40 +43 @@ class Client {',
    '-  old()',
    '+  const go = async (x) => x',
    'diff --git a/README.md b/README.md',
    '@@ -1 +1 @@',
    '-a',
    '+b',
  ].join('\n')

  test('changed files, added declarations and hunk function names', () => {
    const d = parseDiff(diff, ['src/new.ts'])
    expect(d.files).toEqual(['src/api.ts', 'README.md', 'src/new.ts'])
    expect(d.declarations).toContain('withRetry')
    expect(d.declarations).toContain('go')
    expect(d.hunkFunctions).toEqual(['fetchUser', 'Client'])
    expect(d.added).toBe(5)
    expect(d.removed).toBe(2)
  })

  test('untracked files from porcelain status', () => {
    expect(parseUntracked(' M a.ts\n?? new file.ts\n?? "q.ts"\n')).toEqual(['new file.ts', 'q.ts'])
  })
})

describe('the gate', () => {
  test('fewer than 2 user turns, under 2000 tokens, or no diff and no corrections are skipped with a reason', () => {
    expect(gateReason({ userTurns: 1, approxTokens: 9000, corrections: 1, changedFiles: 2 })).toContain('1 user turn')
    expect(gateReason({ userTurns: 3, approxTokens: 1999, corrections: 1, changedFiles: 2 })).toContain('1999 tokens')
    expect(gateReason({ userTurns: 3, approxTokens: 5000, corrections: 0, changedFiles: 0 })).toBe('no file changes and no corrections')
    expect(gateReason({ userTurns: 2, approxTokens: 2000, corrections: 0, changedFiles: 1 })).toBeNull()
    expect(gateReason({ userTurns: 2, approxTokens: 2000, corrections: 1, changedFiles: 0 })).toBeNull()
  })
})

describe('secrets', () => {
  test('keys, tokens, passwords, bearer headers, private keys and .env lines are scrubbed', () => {
    const text = [
      'key sk-ant-api03-abcdefghijklmnop',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123',
      'password = "hunter22hunter"',
      'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123',
      'DB_PASSWORD=supersecret',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----',
      'https://user:pa55word@example.com/x',
    ].join('\n')
    const out = scrubSecrets(text)
    for (const s of ['sk-ant-api03', 'abcdefghijklmnopqrstuvwxyz123', 'hunter22', 'ghp_', 'supersecret', 'MIIabc', 'pa55word']) expect(out).not.toContain(s)
    expect(hasSecret(text)).toBe(true)
    expect(hasSecret('Use pnpm, not npm, in this repo.')).toBe(false)
  })
})

describe('lesson parsing', () => {
  test('a JSON array, a fenced block or an object with lessons is read; malformed items are dropped', () => {
    const reply = '```json\n[{"kind":"correction","text":"Use withRetry for network calls. It handles backoff.","scope":"project","files":["src/api.ts"],"symbols":["withRetry"]},{"kind":"opinion","text":"x is nice to have"},{"kind":"pitfall","text":"short"},{"kind":"pitfall","text":"The tests need the mock server running first.","files":"src"}]\n```'
    const r = parseLessons(reply)
    expect(r.lessons).toHaveLength(1)
    expect(r.lessons[0]!.text).toBe('Use withRetry for network calls.')
    expect(r.dropped).toHaveLength(3)
    expect(parseLessons('{"lessons":[{"kind":"convention","text":"Tabs, not spaces, in this repo."}]}').lessons[0]!.scope).toBe('project')
    expect(parseLessons('sorry, no').dropped).toEqual(['the reply was not JSON'])
    expect(parseLessons('[]').lessons).toEqual([])
    expect(extractJson('noise [1,2] tail')).toEqual([1, 2])
  })

  test('lessons naming files or symbols outside the evidence, or holding secrets, are dropped; at most 8 kept', () => {
    const ev = { files: ['C:\\work\\proj\\src\\api.ts', 'README.md'], symbols: ['withRetry'], text: 'fetchUser was changed', skills: ['plug:api-helpers'], cwd: 'C:\\work\\proj' }
    const base = { kind: 'convention' as const, scope: 'project' as const, text: 'Use withRetry for network calls.', symbols: [] as string[] }
    const r = checkAgainstEvidence(
      [
        { ...base, files: ['src/api.ts'], symbols: ['withRetry', 'fetchUser()'], skill: 'api-helpers' },
        { ...base, files: ['src/invented.ts'] },
        { ...base, files: [], symbols: ['madeUp'] },
        { ...base, files: [], text: 'The key is sk-ant-api03-abcdefghijklmnop here.' },
        { ...base, files: ['api.ts'], skill: 'not-loaded' },
      ],
      ev,
    )
    expect(r.kept).toHaveLength(2)
    expect(r.kept[0]!.files).toEqual(['src/api.ts'])
    expect(r.kept[0]!.symbols).toEqual(['withRetry', 'fetchUser'])
    expect(r.kept[0]!.skill).toBe('api-helpers')
    expect(r.kept[1]!.skill).toBeUndefined()
    expect(r.dropped.join(' ')).toContain('src/invented.ts')
    expect(r.dropped.join(' ')).toContain('madeUp')
    expect(r.dropped.join(' ')).toContain('secret')
    const many = Array.from({ length: 10 }, (_, i) => ({ ...base, files: [], text: `Lesson number ${i} about things.` }))
    expect(checkAgainstEvidence(many, ev).kept).toHaveLength(8)
  })
})

describe('dedupe and merge', () => {
  test('a repeat of a known lesson is found by similar text and shared files', () => {
    const known = [lesson({ id: 'a', files: ['src/api.ts'] }), lesson({ id: 'b', text: 'Run the linter before committing.' })]
    expect(findDuplicate({ text: 'Use the withRetry helper for all network calls.', files: ['src/api.ts'] }, known)?.id).toBe('a')
    expect(findDuplicate({ text: 'Use the withRetry helper for all network calls.', files: ['other.ts'] }, known)).toBeNull()
    expect(findDuplicate({ text: 'Deploy with the staging script.', files: [] }, known)).toBeNull()
    expect(findDuplicate({ text: 'Run the linter before committing.', files: [] }, [lesson({ id: 'c', text: 'Run the linter before committing.', status: 'rejected' })])).toBeNull()
  })

  test('merging adds sessions, files and symbols once', () => {
    const m = mergeInto(lesson({ files: ['src/api.ts'], symbols: ['withRetry'] }), { files: ['SRC/api.ts', 'src/retry.ts'], symbols: ['withRetry', 'fetchUser'], sourceSession: 's2' }, 9)
    expect(m.sessions).toEqual(['s1', 's2'])
    expect(m.files).toEqual(['src/api.ts', 'src/retry.ts'])
    expect(m.symbols).toEqual(['withRetry', 'fetchUser'])
    expect(m.updatedAt).toBe(9)
  })

  test('contradictions are spotted', () => {
    expect(contradicts('Use npm to install packages here.', 'Never use npm to install packages here.')).toBe(true)
    expect(contradicts('Use npm to install packages here.', 'Run the tests with vitest.')).toBe(false)
    expect(findContradiction('Do not use tabs in the YAML files.', [{ text: 'Use tabs in the YAML files.' }])).toBe('Use tabs in the YAML files.')
    expect(similarity('a b c', 'a b c')).toBe(1)
  })
})

describe('review modes', () => {
  test('controlled applies low-risk lessons; commands, URLs, always and never wait', () => {
    expect(riskOf('Run `pnpm test` before pushing.')).toBe('names a command')
    expect(riskOf('Run pnpm install after pulling.')).toBe('names a command')
    expect(riskOf('Docs live at https://example.com.')).toBe('names a URL')
    expect(riskOf('Always keep the changelog sorted.')).toBe('says "always"')
    expect(riskOf('Never edit the generated file.')).toBe('says "never"')
    expect(riskOf('The parser lives in the evidence module.')).toBeNull()
    expect(appliesItself('suggest', 'The parser lives in the evidence module.')).toBe(false)
    expect(appliesItself('controlled', 'The parser lives in the evidence module.')).toBe(true)
    expect(appliesItself('advanced', 'The parser lives in the evidence module.', 'contradicts: x')).toBe(false)
    expect(appliesItself('off', 'The parser lives in the evidence module.')).toBe(false)
  })

  test('the lessons filter', () => {
    const list = [lesson({ id: 'a' }), lesson({ id: 'b', status: 'pending', kind: 'pitfall' }), lesson({ id: 'c', scope: 'user', project: 'other' }), lesson({ id: 'd', status: 'stale' }), lesson({ id: 'e', project: 'other' })]
    const ids = (f: Partial<{ kind: string; store: string; search: string }>) => filterLessons(list, { kind: 'all', store: 'all', search: '', project: 'c:/work/proj', ...f }).map(l => l.id)
    expect(ids({})).toEqual(['a', 'b', 'c', 'd'])
    expect(ids({ kind: 'pitfall' })).toEqual(['b'])
    expect(ids({ store: 'pending' })).toEqual(['b'])
    expect(ids({ store: 'user' })).toEqual(['c'])
    expect(ids({ store: 'stale' })).toEqual(['d'])
    expect(ids({ search: 'WITHRETRY' })).toEqual(['a', 'b', 'c', 'd'])
    expect(ids({ search: 'nothing like it' })).toEqual([])
  })
})

describe('staleness', () => {
  test('stale when all files are gone or all symbols no longer exist', () => {
    expect(isStale({ files: ['a.ts', 'b.ts'], symbols: [] }, { 'a.ts': false, 'b.ts': false }, null)).toBe(true)
    expect(isStale({ files: ['a.ts', 'b.ts'], symbols: [] }, { 'a.ts': false, 'b.ts': true }, null)).toBe(false)
    expect(isStale({ files: [], symbols: ['go'] }, {}, { go: false })).toBe(true)
    expect(isStale({ files: [], symbols: ['go'] }, {}, null)).toBe(false)
    expect(isStale({ files: [], symbols: [] }, {}, {})).toBe(false)
  })
})

describe('scorecards', () => {
  const h = (corrected: boolean, at: number, interrupts = 0): SkillSession => ({ sessionId: `s${at}`, at, corrected, interrupts, failures: 0, turnsToDone: 3 })

  test('a session outcome: correction on the topic, interrupts, failures in the loading turn, turns to done', () => {
    const t = parseTranscript(sampleSession())
    const o = sessionOutcome(t, 'api-helpers', ['api', 'helpers', 'retry'], 'sx', 5)!
    expect(o.corrected).toBe(true)
    expect(o.failures).toBe(1)
    expect(o.turnsToDone).toBe(2)
    expect(sessionOutcome(t, 'other-skill', ['other'], 'sx', 5)).toBeNull()
    expect(sessionOutcome(t, 'api-helpers', ['database'], 'sx', 5)!.corrected).toBe(false)
  })

  test('correction rate over the last 5 loads and the 30% rewrite trigger', () => {
    const card: SkillCard = { name: 'x', loads: 7, history: [h(true, 1), h(true, 2), h(false, 3), h(false, 4), h(false, 5), h(true, 6), h(false, 7)] }
    expect(Math.round(correctionRate(card) * 1e5) / 1e5).toBe(0.2)
    expect(needsRewrite(card)).toBe(false)
    card.history.push(h(true, 8))
    expect(Math.round(correctionRate(card) * 1e5) / 1e5).toBe(0.4)
    expect(needsRewrite(card)).toBe(true)
    expect(needsRewrite({ name: 'y', loads: 2, history: [h(true, 1), h(true, 2)] })).toBe(false)
  })

  test('before/after: 5 sessions after a change against 5 before; worse when corrections or interrupts went up', () => {
    const before = [h(false, 1), h(false, 2), h(true, 3), h(false, 4), h(false, 5)]
    const worse: SkillCard = { name: 'x', loads: 10, changedAt: 10, history: [...before, h(true, 11), h(true, 12), h(false, 13), h(false, 14), h(false, 15)] }
    expect(compareBeforeAfter(worse)!.isWorse).toBe(true)
    const better: SkillCard = { ...worse, history: [...before, h(false, 11), h(false, 12), h(false, 13), h(false, 14), h(false, 15)] }
    expect(compareBeforeAfter(better)!.isWorse).toBe(false)
    const early: SkillCard = { ...worse, history: [...before, h(true, 11), h(true, 12)] }
    expect(compareBeforeAfter(early)!.isReady).toBe(false)
    expect(compareBeforeAfter(early)!.isWorse).toBe(false)
    const moreInterrupts: SkillCard = { ...worse, history: [...before, h(false, 11, 2), h(false, 12), h(false, 13), h(false, 14), h(false, 15)] }
    expect(compareBeforeAfter(moreInterrupts)!.isWorse).toBe(true)
    expect(compareBeforeAfter({ name: 'z', loads: 1, history: [] })).toBeNull()
  })
})

describe('drafts', () => {
  const skill = '---\nname: api-helpers\ndescription: Helpers for API calls.\n---\n\n# API helpers\n\n- Always use fetchJson for requests.\n- Never log tokens.\n'

  test('a fix draft adds a Learned correction bullet once', () => {
    const once = fixDraftText(skill, 'Use withRetry for network calls.')
    expect(once).toContain('## Learned correction\n\n- Use withRetry for network calls.')
    const twice = fixDraftText(once, 'Prefer the typed client.')
    expect(twice.match(/## Learned correction/g)).toHaveLength(1)
    expect(twice).toContain('- Prefer the typed client.')
    expect(fixDraftText(twice, 'Prefer the typed client.')).toBe(twice)
  })

  test('validation: frontmatter, unique name, secrets, description length, rules kept unless contradicted', () => {
    expect(validateDraft({ text: 'no frontmatter', before: null, takenNames: [], corrections: [] })).toEqual(['the frontmatter does not parse'])
    expect(validateDraft({ text: skill, before: null, takenNames: ['api-helpers'], corrections: [] })[0]).toContain('already taken')
    expect(validateDraft({ text: `${skill}\nkey sk-ant-api03-abcdefghijklmnop\n`, before: null, takenNames: [], corrections: [] }).join(' ')).toContain('secret')
    const long = `---\nname: big\ndescription: ${'x'.repeat(1100)}\n---\nbody\n`
    expect(validateDraft({ text: long, before: null, takenNames: [], corrections: [] }).join(' ')).toContain('description is 1100')
    const dropped = skill.replace('- Never log tokens.\n', '')
    expect(validateDraft({ text: dropped, before: skill, takenNames: [], corrections: [] }).join(' ')).toContain('drops a rule: Never log tokens.')
    const swapped = skill.replace('- Always use fetchJson for requests.\n', '- Use the typed client for requests.\n')
    expect(validateDraft({ text: swapped, before: skill, takenNames: [], corrections: ['Do not use fetchJson for requests anymore.'] })).toEqual([])
    expect(validateDraft({ text: fixDraftText(skill, 'Use withRetry.'), before: skill, takenNames: [], corrections: [] })).toEqual([])
    expect(validateDraft({ text: skill, before: null, takenNames: [], corrections: [], maxLength: 20 }).join(' ')).toContain('over the limit')
    expect(extractRules('# T\n\n- one rule here\nplain text\nYou must sign commits.\n')).toEqual(['one rule here', 'You must sign commits.'])
  })

  test('new skill drafts come from procedures seen in 2 or more sessions', () => {
    const a = lesson({ id: 'p1', kind: 'procedure', text: 'Release by bumping the version, tagging and pushing the tag.', sessions: ['s1'] })
    const b = lesson({ id: 'p2', kind: 'procedure', text: 'Release by bumping the version and pushing the tag.', sessions: ['s2'] })
    const c = lesson({ id: 'p3', kind: 'procedure', text: 'Format the tables with the column helper.', sessions: ['s3'] })
    const groups = groupProcedures([a, b, c])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.map(l => l.id)).toEqual(['p1', 'p2'])
    const draft = newSkillDraft(groups[0]!)
    expect(draft.name).toBe('release-bumping-version-tagging')
    expect(validateDraft({ text: draft.text, before: null, takenNames: [], corrections: [] })).toEqual([])
    expect(groupProcedures([a, { ...b, sessions: ['s1'] }])).toEqual([])
  })

  test('the diff is a single parseable hunk', () => {
    const d = unifiedDiff('a\nb\nc\n', 'a\nB\nc\nd\n')
    expect(d).toContain('@@ -1,3 +1,4 @@')
    expect(d).toContain('-b\n+B')
    expect(d).toContain('+d')
    expect(unifiedDiff(null, 'x\n')).toContain('--- /dev/null')
  })
})

describe('budgets', () => {
  const s = { ...DEFAULTS }
  test('model calls, tokens and the daily spend cap stop a run and say which', () => {
    expect(modelBudgetStop(s, { modelCalls: 0, tokens: 0, changes: 0, spendToday: 0 }, 1000)).toBeNull()
    expect(modelBudgetStop(s, { modelCalls: 4, tokens: 0, changes: 0, spendToday: 0 }, 1000)).toBe('max model calls per run (4)')
    expect(modelBudgetStop(s, { modelCalls: 1, tokens: 59500, changes: 0, spendToday: 0 }, 1000)).toBe('max tokens per run (60000)')
    expect(modelBudgetStop(s, { modelCalls: 1, tokens: 0, changes: 0, spendToday: 0.5 }, 1)).toBe('daily spend cap ($0.50)')
    expect(modelBudgetStop({ ...s, dailySpendUsd: 0 }, { modelCalls: 1, tokens: 0, changes: 0, spendToday: 99 }, 1)).toBeNull()
    expect(changeBudgetStop(s, { modelCalls: 0, tokens: 0, changes: 5, spendToday: 0 })).toBe('max changes per run (5)')
    expect(changeBudgetStop(s, { modelCalls: 0, tokens: 0, changes: 4, spendToday: 0 })).toBeNull()
  })

  test('spend from usage, and a new day resets it', () => {
    expect(Math.round(costOf('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 }) * 1e6) / 1e6).toBe(0.6)
    expect(Math.round(costOf('claude-sonnet-5-5', { input_tokens: 1_000_000 }) * 1e6) / 1e6).toBe(2)
    expect(spendFor({ day: '2026-10-10', usd: 0.4 }, '2026-10-11')).toEqual({ day: '2026-10-11', usd: 0 })
    expect(spendFor({ day: '2026-10-11', usd: 0.4 }, '2026-10-11').usd).toBe(0.4)
  })

  test('settings are read from options with defaults for bad values', () => {
    expect(readSettings({})).toEqual(DEFAULTS)
    expect(readSettings({ reviewMode: 'advanced', maxModelCalls: 2, maxTokens: -1, dailySpendUsd: 0 })).toEqual({ ...DEFAULTS, reviewMode: 'advanced', maxModelCalls: 2, dailySpendUsd: 0 })
    expect(readSettings({ reviewMode: 'wild' }).reviewMode).toBe('suggest')
  })
})

describe('band and brief', () => {
  const last = { state: 'done' as const, found: 3, saved: 2, review: 1, at: 1, cwd: '/p' }
  test('band lines', () => {
    expect(bandLine({ isRunning: true, lastRun: null, warning: null, pending: 0 })).toBe('Learning from this session...')
    expect(bandLine({ isRunning: false, lastRun: null, warning: null, pending: 0 })).toBe('Memory: nothing learned yet')
    expect(bandLine({ isRunning: false, lastRun: last, warning: null, pending: 1 })).toBe('Learned 3 lessons: 2 saved, 1 to review')
    expect(bandLine({ isRunning: false, lastRun: { ...last, found: 1, saved: 1 }, warning: null, pending: 0 })).toBe('Learned 1 lesson: 1 saved, 0 to review')
    expect(bandLine({ isRunning: false, lastRun: { ...last, state: 'error', error: 'the transcript was not found' }, warning: null, pending: 0 })).toBe('Memory: the transcript was not found')
    expect(bandLine({ isRunning: false, lastRun: last, warning: 'Hindsight: timeout; it will retry next run', pending: 0 })).toContain('Hindsight: timeout')
  })

  test('the brief: up to 6 lessons ranked by recently touched files, skills changed, under 1500 characters', () => {
    const local = Array.from({ length: 9 }, (_, i) => lesson({ id: `l${i}`, text: `Lesson ${i} keeps the code tidy and readable.`, files: i === 7 ? ['src/hot.ts'] : [], updatedAt: i }))
    local.push(lesson({ id: 'gone', text: 'Old stale advice about the parser module.', status: 'stale' }))
    const lines = briefLines(null, local, ['src/hot.ts'], 'c:/work/proj')
    expect(lines).toHaveLength(6)
    expect(lines[0]).toContain('Lesson 7')
    expect(lines.join(' ')).not.toContain('stale advice')
    const fromHs = briefLines(['Old stale advice about the parser module.', 'Fresh advice about src/hot.ts files.', 'Other'], local, ['src/hot.ts'], 'c:/work/proj')
    expect(fromHs[0]).toBe('Fresh advice about src/hot.ts files.')
    expect(fromHs).not.toContain('Old stale advice about the parser module.')
    const brief = buildBrief(lines, ['api-helpers'])
    expect(brief).toContain('Skills changed since last time: api-helpers.')
    expect(brief.length).toBeLessThan(1500)
    expect(buildBrief(Array.from({ length: 6 }, () => 'x'.repeat(600)), ['a']).length).toBeLessThan(1500)
    expect(buildBrief([], [])).toBe('')
  })
})

describe('memory, jobs and the worker', () => {
  test('memory lines are added once, removed by id, and MEMORY.md gets one pointer', () => {
    const one = addMemoryLine(null, 'a1', 'convention', 'Use tabs.')
    expect(one).toContain('name: session-learner')
    expect(one).toContain('- (convention) Use tabs. <!-- sl:a1 -->')
    expect(addMemoryLine(one, 'a1', 'convention', 'Use tabs.')).toBe(one)
    expect(addMemoryLine(one, 'b2', 'pitfall', 'use   tabs.')).toBe(one)
    const two = addMemoryLine(one, 'b2', 'pitfall', 'Tests need the server.')
    expect(removeMemoryLine(two, 'a1')).not.toContain('sl:a1')
    expect(removeMemoryLine(two, 'zz')).toBe(two)
    const index = ensurePointer('- [Other](other.md) — x\n')
    expect(index).toContain('(session-learner.md)')
    expect(ensurePointer(index)).toBe(index)
    expect(ensurePointer(null).startsWith('- [Session Learner lessons]')).toBe(true)
  })

  test('slugs match the projects folder naming', () => {
    expect(projectSlug('C:\\Users\\Dayle Frost')).toBe('C--Users-Dayle-Frost')
    expect(projectSlug('F:\\PROGRAMMING\\REPOS\\ClaudeMods')).toBe('F--PROGRAMMING-REPOS-ClaudeMods')
    expect(projectSlug('/home/me/my.app')).toBe('-home-me-my-app')
  })

  test('pickup: pending over 2 minutes, running over 15 minutes, never done', () => {
    const j = (id: string, state: 'pending' | 'running' | 'done', createdAt: number, startedAt?: number) => ({ id, sessionId: 's', cwd: '/p', transcriptPath: '', startHead: '', note: '', reason: 'x', createdAt, state, startedAt })
    const now = 100 * 60_000
    const picked = jobsToPickUp([j('new', 'pending', now - 60_000), j('old', 'pending', now - 3 * 60_000), j('live', 'running', 0, now - 60_000), j('dead', 'running', 0, now - 20 * 60_000), j('done', 'done', 0)], now)
    expect(picked.map(x => x.id)).toEqual(['old', 'dead'])
    expect(parseJob('{"id":"a","sessionId":"s","cwd":"/p","state":"pending"}')?.id).toBe('a')
    expect(parseJob('{"id":"a","state":"weird","sessionId":"s","cwd":"/"}')).toBeNull()
    expect(parseJob('nope')).toBeNull()
  })

  test('session.end reasons other than clear and resume count', () => {
    expect(endCounts('other')).toBe(true)
    expect(endCounts('prompt_input_exit')).toBe(true)
    expect(endCounts('clear')).toBe(false)
    expect(endCounts('resume')).toBe(false)
  })

  test('the worker command: hidden PowerShell Start-Process on Windows, nohup elsewhere; plugin dir only in development', () => {
    const win = workerArgv({ windows: true, pluginDir: "C:\\My Mods\\it's" })
    expect(win.slice(0, 6)).toEqual(['powershell', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command'])
    expect(win[6]).toContain("Start-Process -WindowStyle Hidden -FilePath 'claude'")
    expect(win[6]).toContain(`'"C:\\My Mods\\it''s"'`)
    expect(win[6]).toContain("'--no-session-persistence'")
    const nix = workerArgv({ windows: false, pluginDir: null })
    expect(nix).toEqual(['sh', '-c', 'nohup "$@" >/dev/null 2>&1 &', 'sh', 'claude', '-p', 'learn', '--no-session-persistence', '--strict-mcp-config'])
    expect(isInstalledRoot('C:\\Users\\me\\.claude\\plugins\\cache\\x', 'C:/Users/me')).toBe(true)
    expect(isInstalledRoot('F:\\repos\\mods\\session-learner', 'C:/Users/me')).toBe(false)
  })
})

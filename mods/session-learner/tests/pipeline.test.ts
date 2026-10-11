import { describe, expect, test } from 'claude-code/testing'

import { loadData, rollBack, runJob, saveData } from '../hooks/pipeline'
import { DEFAULTS } from '../hooks/run'
import { jsonl, sampleSession, user } from './fixtures'
import { API_DIFF, CWD, HOME, TRANSCRIPT, job, world } from './host'

const LESSON = {
  kind: 'convention',
  text: 'Use the withRetry helper for network calls in src/api.ts.',
  scope: 'project',
  files: ['src/api.ts'],
  symbols: ['withRetry'],
}
const reply = (...lessons: unknown[]) => JSON.stringify(lessons)
const FILES = () => ({ [TRANSCRIPT]: sampleSession(), [`${CWD}/src/api.ts`]: 'export {}' })
const MEMORY = `${HOME}/.claude/projects/-work-proj/memory/session-learner.md`

describe('a whole run', () => {
  test('suggest: lessons wait for review, the run is recorded and mod 6 can read last-run.json', async () => {
    const w = world({ diff: API_DIFF, files: FILES() })
    w.answer = reply(LESSON)
    const run = await runJob(w.host, job(), { settings: { ...DEFAULTS, reviewMode: 'suggest' } })
    expect(run.state).toBe('done')
    expect(run.found).toBe(1)
    expect(run.saved).toBe(0)
    expect(run.review).toBe(1)
    expect(w.prompts).toHaveLength(1)
    expect(w.prompts[0]!.model).toBe('claude-haiku-5-5')
    expect(w.prompts[0]!.effort).toBe('low')
    const d = await loadData(w.host)
    expect(d.lessons[0]!.status).toBe('pending')
    expect(w.files.has(MEMORY)).toBe(false)
    const last = [...w.files.entries()].find(([k]) => k.endsWith('mods-data/session-learner/last-run.json'))
    expect(JSON.parse(last![1])).toMatchObject({ state: 'done', found: 1, saved: 0, review: 1 })
  })

  test('the gate skips a short session and records why, with no model call', async () => {
    const w = world({ diff: API_DIFF, files: { [TRANSCRIPT]: jsonl([user('hello there')]) } })
    const run = await runJob(w.host, job(), { settings: DEFAULTS })
    expect(run.state).toBe('skipped')
    expect(run.skip).toBeTruthy()
    expect(w.prompts).toHaveLength(0)
  })

  test('a missing transcript is an error in the record, not a throw', async () => {
    const w = world({ diff: API_DIFF })
    const run = await runJob(w.host, job(), { settings: DEFAULTS })
    expect(run.state).toBe('error')
    expect(run.errors[0]).toContain('transcript')
  })

  test('off runs nothing', async () => {
    const w = world({ diff: API_DIFF, files: FILES() })
    const run = await runJob(w.host, job(), { settings: { ...DEFAULTS, reviewMode: 'off' } })
    expect(run.state).toBe('skipped')
    expect(w.prompts).toHaveLength(0)
  })

  test('a lesson naming a file that is not in the evidence is dropped', async () => {
    const w = world({ diff: API_DIFF, files: FILES() })
    w.answer = reply({ ...LESSON, files: ['src/ghost.ts'], symbols: [] })
    const run = await runJob(w.host, job(), { settings: DEFAULTS })
    expect(run.found).toBe(0)
    expect(run.notes.join(' ')).toContain('Dropped')
  })

  test('controlled: a low-risk lesson applies itself, is recorded with before/after, and rolls back', async () => {
    const w = world({ diff: API_DIFF, files: FILES() })
    w.answer = reply(LESSON, { ...LESSON, text: 'Always run npm test before saying a change is finished.', files: [], symbols: [] })
    const run = await runJob(w.host, job(), { settings: { ...DEFAULTS, reviewMode: 'controlled' } })
    expect(run.saved).toBe(1)
    expect(run.review).toBe(1)
    expect(w.files.get(MEMORY)).toContain('withRetry helper')
    expect(w.files.get(`${HOME}/.claude/projects/-work-proj/memory/MEMORY.md`)).toContain('session-learner.md')
    const d = await loadData(w.host)
    const change = d.changes.find(c => c.isAuto)!
    expect(change.after).toContain('withRetry')
    const r = await rollBack(w.host, d, change.id, w.clock)
    expect(r.ok).toBe(true)
    expect(d.lessons.find(l => l.id === change.lessonId)!.status).toBe('pending')
    expect(w.files.get(MEMORY) ?? '').not.toContain('withRetry helper')
    expect((await rollBack(w.host, d, change.id, w.clock)).ok).toBe(false)
  })

  test('a Hindsight outage skips that store and says so; the lesson still reaches memory', async () => {
    const w = world({ diff: API_DIFF, hindsight: 'down', files: FILES() })
    w.answer = reply(LESSON)
    const run = await runJob(w.host, job(), { settings: { ...DEFAULTS, reviewMode: 'controlled' } })
    expect(run.skippedStores.join(' ')).toContain('Hindsight')
    expect(run.saved).toBe(1)
    expect(w.files.get(MEMORY)).toContain('withRetry')
  })

  test('budgets: no model calls allowed stops the run and names the budget', async () => {
    const w = world({ diff: API_DIFF, files: FILES() })
    const run = await runJob(w.host, job(), { settings: { ...DEFAULTS, maxModelCalls: 0 } })
    expect(run.budgetStop).toBeTruthy()
    expect(w.prompts).toHaveLength(0)
  })

  test('the daily spend cap stops a second run', async () => {
    const w = world({ diff: API_DIFF, files: FILES() })
    w.answer = reply(LESSON)
    await runJob(w.host, job(), { settings: { ...DEFAULTS, dailySpendUsd: 0.0001 } })
    const second = await runJob(w.host, job({ sessionId: 'sess-2' }), { settings: { ...DEFAULTS, dailySpendUsd: 0.0001 } })
    expect(second.budgetStop).toBeTruthy()
  })

  test('a repeat of a known lesson merges instead of duplicating', async () => {
    const w = world({ diff: API_DIFF, files: FILES() })
    w.answer = reply(LESSON)
    await runJob(w.host, job(), { settings: DEFAULTS })
    const run = await runJob(w.host, job({ sessionId: 'sess-2' }), { settings: DEFAULTS })
    expect(run.merged).toBe(1)
    const d = await loadData(w.host)
    expect(d.lessons).toHaveLength(1)
    expect(d.lessons[0]!.sessions).toHaveLength(2)
    await saveData(w.host, d)
  })

  test('staleness: an active lesson whose files are gone leaves memory', async () => {
    const w = world({ diff: API_DIFF, files: FILES() })
    w.answer = reply(LESSON)
    await runJob(w.host, job(), { settings: { ...DEFAULTS, reviewMode: 'controlled' } })
    expect(w.files.get(MEMORY)).toContain('withRetry')
    w.answer = '[]'
    w.files.delete(`${CWD}/src/api.ts`)
    const run = await runJob(w.host, job({ sessionId: 'sess-3' }), { settings: { ...DEFAULTS, reviewMode: 'controlled' } })
    expect(run.stale).toBe(1)
    expect(w.files.get(MEMORY) ?? '').not.toContain('withRetry')
  })
})

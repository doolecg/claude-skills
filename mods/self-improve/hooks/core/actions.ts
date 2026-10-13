// What the /learn pane does: review, edit, merge, move and delete lessons; approve, edit and reject drafts;
// roll back a change; edit soul.md. Each loads the state, changes it and saves it. Rollback is ported from
// Operant (core/learn.ts rollback).

import type { HindsightState } from './hindsight'
import type { Io } from './io'
import { applyLesson, installDraft, retire, writeStores } from './learner'
import { TEST_PROMPT } from './lessons'
import { writeMemory } from './memory'
import { folderName } from './paths'
import type { Settings } from './settings'
import { addFacts, cleanFact, parseSoul, removeFact, replaceFact, sectionFor, soulFacts } from './soul'
import { readSoul, writeSoul } from './soulSync'
import { addChange, loadState, saveState, writeBackups, type Lesson, type Skip, type State } from './state'
import { clean, hashText, uniq } from './text'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

const ok = (message: string): ActionResult => ({ ok: true, message })
const fail = (message: string): ActionResult => ({ ok: false, message })

async function withState(io: Io, fn: (s: State, now: number) => Promise<ActionResult>): Promise<ActionResult> {
  const state = await loadState(io)
  const r = await fn(state, await io.now())
  if (r.ok) {
    await saveState(io, state)
    await writeBackups(io, state).catch(() => undefined)
  }
  return r
}

const lessonOf = (s: State, id: number): Lesson | undefined => s.lessons.find(l => l.id === id)

export function approveLesson(io: Io, hs: HindsightState, id: number): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    const l = lessonOf(s, id)
    if (!l || l.status !== 'pending') return fail(`Lesson ${id} is not waiting for review`)
    const skipped: Skip[] = []
    await applyLesson({ io, hs, state: s, now }, l, false, skipped)
    return ok(`Lesson ${id} saved${skipped.length ? ` (${skipped.map(k => `${k.store} skipped: ${k.reason}`).join('; ')})` : ''}`)
  })
}

export function rejectLesson(io: Io, id: number): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    const l = lessonOf(s, id)
    if (!l || l.status !== 'pending') return fail(`Lesson ${id} is not waiting for review`)
    l.status = 'rejected'
    l.updatedAt = now
    return ok(`Lesson ${id} rejected`)
  })
}

export function editLesson(io: Io, hs: HindsightState, id: number, text: string): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    const l = lessonOf(s, id)
    if (!l) return fail(`No lesson ${id}`)
    const next = cleanFact(text)
    if (!next) return fail('A lesson needs text, with no secrets, links or commands that download or delete')
    const before = l.text
    if (before === next) return ok('No change')
    l.text = next
    l.updatedAt = now
    if (l.status === 'active') {
      if (l.scope === 'user') {
        const soul = await readSoul(io)
        await writeSoul(io, replaceFact(parseSoul(soul), before, next))
      } else {
        if (l.stores.includes('memory')) await writeMemory(io, l).catch(() => undefined)
        // Hindsight has no edit call: the new wording is sent as a new memory.
        l.hindsightPending = true
        l.stores = l.stores.filter(x => x !== 'hindsight')
        await writeStores({ io, hs, state: s }, l, [])
      }
      addChange(s, { at: now, kind: 'lesson', targetId: l.id, title: `Edited #${l.id}`, before, after: next, auto: false })
    }
    return ok(`Lesson ${id} edited`)
  })
}

// Folds the others into the first: their files, symbols, sessions and hits move over, and they are deleted.
export function mergeLessons(io: Io, keepId: number, ids: readonly number[]): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    const keep = lessonOf(s, keepId)
    if (!keep) return fail(`No lesson ${keepId}`)
    let n = 0
    for (const id of uniq(ids).filter(x => x !== keepId)) {
      const l = lessonOf(s, id)
      if (!l) continue
      if (l.scope !== keep.scope || (l.folder || l.project).toLowerCase() !== (keep.folder || keep.project).toLowerCase()) return fail('Only lessons of the same project and scope can be merged')
      keep.files = uniq([...keep.files, ...l.files])
      keep.symbols = uniq([...keep.symbols, ...l.symbols])
      keep.sessions = uniq([...keep.sessions, ...l.sessions])
      keep.hits += l.hits
      await retire(io, l, 'deleted')
      l.updatedAt = now
      addChange(s, { at: now, kind: 'lesson', targetId: l.id, title: `Merged into #${keep.id}`, before: l.text, after: '', auto: false })
      n++
    }
    if (keep.status === 'active' && keep.stores.includes('memory')) await writeMemory(io, keep).catch(() => undefined)
    return ok(`Merged ${n} lesson${n === 1 ? '' : 's'} into #${keepId}`)
  })
}

// Moves a lesson between the project (memory folder and project bank) and the user (soul.md and the Soul Bank).
export function moveLesson(io: Io, hs: HindsightState, id: number, to: 'user' | 'project', folder: string): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    const l = lessonOf(s, id)
    if (!l) return fail(`No lesson ${id}`)
    if (l.scope === to) return fail(`Lesson ${id} is already ${to === 'user' ? 'in soul.md' : 'a project lesson'}`)
    const wasActive = l.status === 'active'
    if (wasActive) await retire(io, l, 'active')
    l.scope = to
    l.folder = to === 'user' ? '' : l.folder || folder
    l.project = to === 'user' ? '' : folderName(l.folder)
    l.section = to === 'user' ? sectionFor(l.text, l.kind) : ''
    l.stores = []
    l.hindsightPending = false
    l.updatedAt = now
    const skipped: Skip[] = []
    if (wasActive) await writeStores({ io, hs, state: s }, l, skipped)
    return ok(`Lesson ${id} moved to ${to === 'user' ? 'soul.md' : 'the project'}${skipped.length ? ` (${skipped.map(k => `${k.store} skipped`).join(', ')})` : ''}`)
  })
}

// Deletes lessons for good from memory; the confirm step in the pane shows the count first.
export function deleteLessons(io: Io, ids: readonly number[]): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    let n = 0
    for (const id of ids) {
      const l = lessonOf(s, id)
      if (!l || l.status === 'deleted') continue
      const before = l.text
      const wasActive = l.status === 'active'
      await retire(io, l, 'deleted')
      l.updatedAt = now
      if (wasActive) addChange(s, { at: now, kind: 'lesson', targetId: l.id, title: `Deleted #${l.id}`, before, after: '', auto: false })
      n++
    }
    return ok(`Deleted ${n} lesson${n === 1 ? '' : 's'}`)
  })
}

export function approveDraft(io: Io, id: number): Promise<ActionResult> {
  return withState(io, async s => {
    const d = s.drafts.find(x => x.id === id)
    if (!d || d.status !== 'pending') return fail(`Draft ${id} is not waiting for review`)
    try {
      await installDraft(io, s, d, false)
    } catch (e) {
      return fail(`Draft ${id} was not installed: ${clean(e instanceof Error ? e.message : String(e))}`)
    }
    return ok(`${d.name} installed at ${d.targetPath}`)
  })
}

export function rejectDraft(io: Io, id: number): Promise<ActionResult> {
  return withState(io, async s => {
    const d = s.drafts.find(x => x.id === id)
    if (!d || d.status !== 'pending') return fail(`Draft ${id} is not waiting for review`)
    d.status = 'rejected'
    return ok(`Draft ${id} rejected`)
  })
}

export function editDraft(io: Io, id: number, body: string, validate: (body: string) => string): Promise<ActionResult> {
  return withState(io, async s => {
    const d = s.drafts.find(x => x.id === id)
    if (!d || d.status !== 'pending') return fail(`Draft ${id} is not waiting for review`)
    d.body = body
    d.validation = validate(body)
    return ok(d.validation ? `Saved; it fails validation: ${d.validation}` : 'Saved; it passes validation')
  })
}

// Puts back what an applied change replaced. Only an applied change can be rolled back, and only once.
export function rollback(io: Io, hs: HindsightState, changeId: number): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    const c = s.changes.find(x => x.id === changeId)
    if (!c) return fail(`No change ${changeId}`)
    if (c.status !== 'applied') return fail(`Change ${changeId} was already rolled back`)
    if (c.kind === 'lesson') {
      const l = lessonOf(s, c.targetId)
      if (!l) return fail(`Lesson ${c.targetId} no longer exists`)
      if (c.before === '') await retire(io, l, 'deleted')
      else if (c.after === '') {
        l.status = 'active'
        l.text = c.before
        await writeStores({ io, hs, state: s }, l, [])
      } else {
        if (l.scope === 'user') await writeSoul(io, replaceFact(parseSoul(await readSoul(io)), l.text, c.before))
        l.text = c.before
        if (l.stores.includes('memory')) await writeMemory(io, l).catch(() => undefined)
      }
      l.updatedAt = now
    } else if (c.kind === 'skill') {
      const d = s.drafts.find(x => x.id === c.targetId)
      if (!d || !d.targetPath) return fail('The skill draft is gone')
      if (d.previousBody !== null) await io.write(d.targetPath, d.previousBody)
      else await io.remove(d.targetPath)
      d.status = 'rolledBack'
      const card = s.skills[d.name]
      if (card) {
        card.changedAt = null
        card.flagged = false
      }
    } else {
      const doc = parseSoul(await readSoul(io))
      if (c.before === '' && c.after) await writeSoul(io, removeFact(doc, c.after))
      else if (c.after === '' && c.before) await writeSoul(io, addFacts(doc, [{ section: sectionFor(c.before), text: c.before }]).doc)
      else await writeSoul(io, replaceFact(doc, c.after, c.before))
    }
    c.status = 'rolledBack'
    return ok(`Rolled back: ${c.title}`)
  })
}

// soul.md from the pane

export function soulAdd(io: Io, section: string, text: string): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    const r = addFacts(parseSoul(await readSoul(io)), [{ section, text }])
    if (!r.added.length) return fail('Not added: empty, already there, or it holds a secret, a link or a risky command')
    await writeSoul(io, r.doc)
    addChange(s, { at: now, kind: 'soul', targetId: 0, title: `Added to soul.md: ${r.added[0]!.text}`, before: '', after: r.added[0]!.text, auto: false })
    return ok('Added to soul.md')
  })
}

export function soulEdit(io: Io, before: string, after: string): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    const next = cleanFact(after)
    if (!next) return fail('A fact needs text, with no secrets, links or risky commands')
    const doc = parseSoul(await readSoul(io))
    if (!soulFacts(doc).some(f => f.text === before)) return fail('That line is no longer in soul.md')
    await writeSoul(io, replaceFact(doc, before, next))
    addChange(s, { at: now, kind: 'soul', targetId: 0, title: 'Edited a soul.md line', before, after: next, auto: false })
    return ok('soul.md updated')
  })
}

export function soulRemove(io: Io, text: string): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    const doc = parseSoul(await readSoul(io))
    if (!soulFacts(doc).some(f => f.text === text)) return fail('That line is no longer in soul.md')
    await writeSoul(io, removeFact(doc, text))
    addChange(s, { at: now, kind: 'soul', targetId: 0, title: 'Removed a soul.md line', before: text, after: '', auto: false })
    return ok('Removed from soul.md (the Soul Bank keeps its copy; Hindsight has no delete call)')
  })
}

// A fact the Soul Bank offered (suggest mode): add it to soul.md, or skip it for good.
export function soulPending(io: Io, id: string, take: boolean): Promise<ActionResult> {
  return withState(io, async (s, now) => {
    const p = s.soul.pending.find(x => x.id === id)
    if (!p) return fail('That fact is no longer waiting')
    s.soul.pending = s.soul.pending.filter(x => x.id !== id)
    if (!take) return ok('Skipped')
    const r = addFacts(parseSoul(await readSoul(io)), [{ section: p.section, text: p.text }])
    if (r.added.length) {
      await writeSoul(io, r.doc)
      s.soul.pushed.push(hashText(p.text))
      addChange(s, { at: now, kind: 'soul', targetId: 0, title: `From the Soul Bank: ${p.text}`, before: '', after: p.text, auto: false })
    }
    return ok(r.added.length ? 'Added to soul.md' : 'Already in soul.md')
  })
}

// "Test": one tiny call to the learn model; nothing is stored.
export async function testModel(io: Io, s: Settings): Promise<ActionResult> {
  const t = await io.now()
  const r = await io.model({ model: s.learnModel, prompt: TEST_PROMPT, maxTokens: 20, effort: 'low', timeoutMs: 30_000 })
  const ms = (await io.now()) - t
  return r.ok ? ok(`${s.learnModel} answered in ${(ms / 1000).toFixed(1)} s`) : fail(`${s.learnModel} did not answer: ${r.error}`)
}

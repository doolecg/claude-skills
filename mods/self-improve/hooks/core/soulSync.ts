// Keeping soul.md and the Soul Bank in step, the first seed of soul.md, and the import from the old
// self-improve plugin (1.0.0). soul.md is always written; Hindsight is optional and catches up on a later run.

import type { Hindsight, HindsightState } from './hindsight'
import type { Io } from './io'
import { errText } from './io'
import { folderName, joinPath, projectBank, soulPath } from './paths'
import type { Settings } from './settings'
import { addFacts, bankText, cleanFact, isKnownFact, parseSoul, planPull, planPush, renderSoul, sectionFor, soulTags, type SoulDoc, type SoulSection } from './soul'
import type { Lesson, State } from './state'
import { addChange, newId } from './state'
import { hashText, isDuplicate, similarity } from './text'

export async function readSoul(io: Io): Promise<string | null> {
  return io.read(soulPath(io.config, io.isWindows)).catch(() => null)
}

export async function writeSoul(io: Io, doc: SoulDoc): Promise<void> {
  await io.write(soulPath(io.config, io.isWindows), renderSoul(doc))
}

export type SyncResult = { pushed: number; pulled: number; queued: number; error: string }

// Pushes the file's new lines to the bank and pulls the bank's new facts into the file (in suggest mode they wait in
// the Soul tab instead). Hindsight off or down: nothing is lost, the lines are pushed on a later run.
export async function syncSoul(io: Io, state: State, s: Settings, hs: HindsightState): Promise<SyncResult> {
  const out: SyncResult = { pushed: 0, pulled: 0, queued: 0, error: '' }
  if (!hs.on) {
    out.error = `Hindsight ${hs.reason}`
    state.soul.lastError = out.error
    return out
  }
  const bank = s.soulBank
  let doc = parseSoul(await readSoul(io))
  // Pull first, so a fact that came from the bank is not sent back to it.
  const listed = await hs.client.list(bank)
  // What the bank already says: a line it holds (in any wording) is never sent again, whatever the local record lost.
  const inBank = listed.ok ? listed.value.map(m => bankText(m.text)) : []
  if (listed.ok) {
    const plan = planPull(
      listed.value,
      parseSoul(renderSoul(doc) + state.soul.pending.map(p => `\n## ${p.section}\n- ${p.text}`).join('')),
      state.soul.seen,
    )
    state.soul.seen = plan.seen
    if (plan.add.length) {
      if (s.mode === 'suggest') {
        for (const a of plan.add) state.soul.pending.push({ id: a.id, section: a.section, text: a.text })
        out.queued = plan.add.length
      } else {
        const r = addFacts(doc, plan.add)
        doc = r.doc
        for (const f of r.added) {
          state.soul.pushed.push(hashText(f.text))
          addChange(state, { at: await io.now(), kind: 'soul', targetId: 0, title: `From the Soul Bank: ${f.text}`, before: '', after: f.text, auto: true })
        }
        out.pulled = r.added.length
        if (r.added.length) await writeSoul(io, doc)
      }
    }
  } else if (listed.error !== 'answered 404') {
    out.error = `Soul Bank ${bank}: ${listed.error}`
  }
  for (const f of planPush(doc, state.soul.pushed)) {
    if (isKnownFact(inBank, f.text)) {
      state.soul.pushed.push(hashText(f.text))
      continue
    }
    const r = await hs.client.retain(bank, f.text, soulTags(f), `soul.md: ${f.section}`)
    if (!r.ok) {
      out.error = `Soul Bank ${bank}: ${r.error}`
      break
    }
    state.soul.pushed.push(hashText(f.text))
    out.pushed++
  }
  state.soul.lastSync = await io.now()
  state.soul.lastError = out.error
  return out
}

// Seeding

export type SeedFact = { section: SoulSection; text: string; from: string }

// A Claude Code memory file's type (top-level or under metadata:), description and first paragraph.
export function parseMemoryFile(text: string): { type: string; description: string; first: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return null
  const head = m[1]!
  const type = /^\s*type:\s*["']?(\w+)/m.exec(head)?.[1] ?? ''
  const description = /^description:\s*["']?(.*?)["']?\s*$/m.exec(head)?.[1] ?? ''
  const first = m[2]!
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .find(p => p && !/^(Files|Symbols):/.test(p) && !/^\*\*/.test(p) && !p.startsWith('#'))
  return first ? { type, description, first: first.replace(/\s+/g, ' ') } : null
}

// The user and feedback memories of every project, as soul facts. A project lesson (another tool's
// *_lesson_* file), a pitfall or a procedure is about code, not the person, and is left out.
export async function memorySeeds(io: Io): Promise<SeedFact[]> {
  const out: SeedFact[] = []
  const root = joinPath(io.isWindows, io.config, 'projects')
  let projects: { name: string; kind: string }[] = []
  try {
    projects = await io.list(root)
  } catch {
    return out
  }
  for (const p of projects) {
    if (p.kind === 'file') continue
    const dir = joinPath(io.isWindows, root, p.name, 'memory')
    let files: { name: string; kind: string }[] = []
    try {
      files = await io.list(dir)
    } catch {
      continue
    }
    for (const f of files) {
      if (f.kind !== 'file' || !f.name.endsWith('.md') || f.name === 'MEMORY.md' || /_lesson_\d+\.md$/.test(f.name)) continue
      const text = await io.read(joinPath(io.isWindows, dir, f.name)).catch(() => null)
      const mem = text ? parseMemoryFile(text) : null
      if (!mem || (mem.type !== 'user' && mem.type !== 'feedback')) continue
      if (/^(pitfall|procedure)\b/i.test(mem.description)) continue
      const fact = cleanFact(mem.first)
      if (fact) out.push({ section: sectionFor(fact, mem.type === 'feedback' ? 'correction' : undefined), text: fact, from: `${p.name}/${f.name}` })
    }
  }
  return out
}

// The first soul.md: an existing file is read and merged into, never overwritten. Facts come from the memory files
// and, when Hindsight answers, the Soul Bank. Bank facts are marked as already pushed.
export async function seedSoul(io: Io, state: State, s: Settings, hs: HindsightState): Promise<{ added: number; fromBank: number; fromMemory: number; error: string }> {
  const r = { added: 0, fromBank: 0, fromMemory: 0, error: '' }
  let doc = parseSoul(await readSoul(io))
  const memory = await memorySeeds(io)
  const a = addFacts(doc, memory)
  doc = a.doc
  r.fromMemory = a.added.length
  if (hs.on) {
    const listed = await hs.client.list(s.soulBank)
    if (listed.ok) {
      const plan = planPull(listed.value, doc, state.soul.seen, 200)
      state.soul.seen = plan.seen
      const b = addFacts(doc, plan.add)
      doc = b.doc
      for (const f of b.added) state.soul.pushed.push(hashText(f.text))
      r.fromBank = b.added.length
    } else if (listed.error !== 'answered 404') r.error = `Soul Bank ${s.soulBank}: ${listed.error}`
  } else r.error = `Hindsight ${hs.reason}`
  r.added = r.fromBank + r.fromMemory
  await writeSoul(io, doc)
  state.seededAt = await io.now()
  return r
}

// Import from the old self-improve plugin (1.0.0)

type OldData = { learnings?: { text?: string; kind?: string; project?: string }[]; prefs?: string[] }

export type MigrateResult = { soul: number; lessons: number; banks: string[]; error: string }

// Reads the old plugin's stores (<config>/plugins/store/self-improve_*.json) and its Hindsight banks. Preferences go to
// soul.md, other facts become project lessons sent to coding-agent::<project>. Old data is never deleted.
// `oldBanks` are the banks the old plugin was set to use (its hindsightBank, default self-improve), each with a client for
// the server its settings named (hindsightBaseUrl), when that answered.
export async function migrateV1(io: Io, state: State, s: Settings, hs: HindsightState, oldBanks: readonly { client: Hindsight; bank: string }[]): Promise<MigrateResult> {
  const out: MigrateResult = { soul: 0, lessons: 0, banks: [], error: '' }
  const prefs: string[] = []
  const facts: { text: string; project: string }[] = []
  const storeDir = joinPath(io.isWindows, io.config, 'plugins', 'store')
  const files = await io.list(storeDir).catch(() => [])
  for (const f of files) {
    if (!/^self-improve_.*\.json$/.test(f.name)) continue
    const text = await io.read(joinPath(io.isWindows, storeDir, f.name)).catch(() => null)
    if (!text) continue
    let data: OldData
    try {
      data = ((JSON.parse(text) as Record<string, unknown>)['self-improve.data'] ?? {}) as OldData
    } catch {
      continue
    }
    for (const p of data.prefs ?? []) if (typeof p === 'string') prefs.push(p)
    for (const l of data.learnings ?? []) {
      if (typeof l?.text !== 'string') continue
      if (l.kind === 'preference') prefs.push(l.text)
      else facts.push({ text: l.text, project: typeof l.project === 'string' ? l.project : '' })
    }
  }
  {
    for (const { client, bank } of oldBanks) {
      const listed = await client.list(bank)
      if (!listed.ok) continue
      out.banks.push(bank)
      for (const m of listed.value) {
        if (m.type === 'observation') continue
        const kind = m.tags.find(t => t.startsWith('kind:'))?.slice(5)
        const project = m.tags.find(t => t.startsWith('project:'))?.slice(8) ?? ''
        if (kind === 'preference') prefs.push(m.text)
        else facts.push({ text: m.text, project })
      }
    }
  }
  const doc = parseSoul(await readSoul(io))
  const added = addFacts(doc, prefs.map(p => ({ section: sectionFor(p), text: p })))
  if (added.added.length) await writeSoul(io, added.doc)
  out.soul = added.added.length
  const now = await io.now()
  for (const f of facts) {
    const text = cleanFact(f.text)
    if (!text || !f.project) continue
    const lesson: Lesson = {
      id: 0, folder: '', project: f.project, kind: 'convention', supersedes: [], scope: 'project', section: '', text, files: [], symbols: [], skill: null,
      sessions: ['self-improve-1.0.0'], status: 'active', stores: [], hindsightPending: true, reviewReason: '', hits: 1, createdAt: now, updatedAt: now,
    }
    if (state.lessons.some(l => l.project.toLowerCase() === f.project.toLowerCase() && isDuplicate(l, lesson))) continue
    lesson.id = newId(state)
    if (hs.on) {
      const known = await hs.client.recall(projectBank(f.project), text, 3)
      if (known.ok && known.value.some(k => similarity(k, text) >= 0.7)) {
        lesson.hindsightPending = false
        lesson.stores = ['hindsight']
      }
    }
    state.lessons.push(lesson)
    out.lessons++
  }
  state.migratedAt = now
  return out
}

export const projectOf = (l: Pick<Lesson, 'folder' | 'project'>): string => (l.folder ? folderName(l.folder) : l.project)

export const syncError = (e: unknown): string => `soul sync failed: ${errText(e)}`

export type { Hindsight }

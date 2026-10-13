// A project's auto-memory folder, as Claude Code keeps it: <config>/projects/<encoded folder>/memory, one file per
// lesson and a pointer line in MEMORY.md. Ported from Operant (core/learn-memory.ts).

import type { Io } from './io'
import { joinPath, memoryDirFor } from './paths'
import type { Lesson } from './state'
import { clean, scrubSecrets } from './text'

const INDEX = 'MEMORY.md'

export const memoryFileName = (l: Pick<Lesson, 'id'>): string => `self_improve_lesson_${l.id}.md`

export function renderMemory(l: Lesson): { name: string; description: string; text: string } {
  const type = l.kind === 'correction' ? 'feedback' : 'project'
  const name = clean(l.text).slice(0, 60)
  const n = l.sessions.length
  const description = `${l.kind} learned by Self Improve${n ? ` from ${n} session${n === 1 ? '' : 's'}` : ''}`
  const where = [l.files.length ? `Files: ${l.files.join(', ')}` : '', l.symbols.length ? `Symbols: ${l.symbols.join(', ')}` : ''].filter(Boolean)
  const text = `---\nname: ${name}\ndescription: ${description}\ntype: ${type}\n---\n\n${scrubSecrets(l.text)}\n${where.length ? `\n${where.join('\n')}\n` : ''}`
  return { name, description, text }
}

// MEMORY.md with the file's pointer line put in (replaced when there, added when not).
export function withPointer(index: string | null, file: string, line: string): string {
  const lines = index ? index.replace(/\r\n/g, '\n').split('\n') : []
  const at = lines.findIndex(x => x.includes(`](${file})`))
  if (at >= 0) lines[at] = line
  else lines.push(line)
  return `${lines.join('\n').replace(/\s+$/, '')}\n`
}

export function withoutPointer(index: string | null, file: string): string | null {
  if (index === null) return null
  const lines = index.replace(/\r\n/g, '\n').split('\n').filter(x => !x.includes(`](${file})`))
  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}

export async function writeMemory(io: Io, l: Lesson): Promise<string> {
  const dir = memoryDirFor(io.config, l.folder, io.isWindows)
  const file = memoryFileName(l)
  const r = renderMemory(l)
  await io.write(joinPath(io.isWindows, dir, file), r.text)
  const indexPath = joinPath(io.isWindows, dir, INDEX)
  await io.write(indexPath, withPointer(await io.read(indexPath), file, `- [${r.name}](${file}) — ${r.description}`))
  return file
}

export async function removeMemory(io: Io, l: Lesson): Promise<void> {
  const dir = memoryDirFor(io.config, l.folder, io.isWindows)
  const file = memoryFileName(l)
  await io.remove(joinPath(io.isWindows, dir, file))
  const indexPath = joinPath(io.isWindows, dir, INDEX)
  const next = withoutPointer(await io.read(indexPath), file)
  if (next !== null) await io.write(indexPath, next)
}

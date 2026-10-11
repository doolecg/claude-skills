import { folderKey, homeDir, isSameOrInside, joinPath, normPath } from './paths'
import type { Io } from './io'

export type SkillSource = 'user' | 'operant-hub' | 'project' | `plugin:${string}`

export type SkillInfo = {
  /** `plugin:skill` for a plugin's skill, the plain name otherwise. */
  name: string
  description: string
  /** The SKILL.md file. */
  path: string
  source: SkillSource
}

export type SkillReadError = { path: string; reason: string }

export type SkillList = { skills: SkillInfo[]; errors: SkillReadError[] }

export type Frontmatter = { data: Record<string, string>; body: string }

const KEY_LINE = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:(?:\s+(.*)|\s*)$/
const BLOCK_HEAD = /^[>|][+-]?\d*\s*(#.*)?$/

const indentOf = (line: string): number => line.length - line.trimStart().length

function unquote(value: string): string | null {
  const q = value[0]
  if (q !== '"' && q !== "'") return null
  if (q === "'") {
    const m = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(value)
    return m ? m[1]!.replace(/''/g, "'") : null
  }
  const m = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(value)
  if (!m) return null
  return m[1]!.replace(/\\(["\\/nrt]|u[0-9a-fA-F]{4})/g, (_, c: string) => {
    if (c === 'n') return '\n'
    if (c === 'r') return '\r'
    if (c === 't') return '\t'
    if (c[0] === 'u') return String.fromCharCode(parseInt(c.slice(1), 16))
    return c
  })
}

/**
 * Reads the YAML frontmatter of a SKILL.md: top-level `key: value` pairs as strings.
 * Handles plain, 'single' and "double" quoted values (also over several lines), `>` and `|`
 * blocks, and plain values continued on indented lines. Nested maps and lists read as ''.
 * Returns null when the text has no frontmatter block.
 */
export function parseFrontmatter(text: string): Frontmatter | null {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') return null
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i]!.trimEnd()
    if (t === '---' || t === '...') {
      end = i
      break
    }
  }
  if (end < 0) return null

  const data: Record<string, string> = {}
  const body = lines.slice(end + 1).join('\n')
  const block = lines.slice(1, end)

  for (let i = 0; i < block.length; i++) {
    const line = block[i]!
    if (line.trim() === '' || line.trimStart().startsWith('#') || indentOf(line) > 0) continue
    const m = KEY_LINE.exec(line)
    if (!m) continue
    const key = m[1]!
    const raw = (m[2] ?? '').trim()

    const following: string[] = []
    let j = i + 1
    while (j < block.length && (block[j]!.trim() === '' || indentOf(block[j]!) > 0)) {
      following.push(block[j]!)
      j++
    }
    while (following.length > 0 && following[following.length - 1]!.trim() === '') following.pop()

    if (BLOCK_HEAD.test(raw)) {
      const folded = raw.startsWith('>')
      const strip = Math.min(...following.filter(l => l.trim() !== '').map(indentOf), Infinity)
      const rows = following.map(l => (l.trim() === '' ? '' : l.slice(Number.isFinite(strip) ? strip : 0)))
      data[key] = (folded ? foldRows(rows) : rows.join('\n')).trim()
      i = j - 1
      continue
    }

    if (raw === '') {
      data[key] = ''
      i = j - 1
      continue
    }

    const whole = unquote(raw)
    if (whole !== null) {
      data[key] = whole
      i = j - 1
      continue
    }
    if ((raw[0] === '"' || raw[0] === "'") && following.length > 0) {
      const joined = [raw, ...following.map(l => l.trim())].join(' ')
      data[key] = unquote(joined) ?? raw
      i = j - 1
      continue
    }

    data[key] = following.length > 0 ? [raw, ...following.map(l => l.trim())].filter(Boolean).join(' ') : raw
    i = j - 1
  }
  return { data, body }
}

function foldRows(rows: string[]): string {
  let out = ''
  for (const row of rows) {
    if (row === '') out += '\n'
    else out += out === '' || out.endsWith('\n') ? row : ` ${row}`
  }
  return out
}

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim()

const errText = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.length > 200 ? `${msg.slice(0, 200)}...` : msg
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

type Scan = { source: SkillSource; plugin?: string; errors: SkillReadError[] }

async function readSkill(io: Io, file: string, folder: string, scan: Scan): Promise<SkillInfo | null> {
  let text: string
  try {
    text = await io.fs.read(file)
  } catch (e) {
    scan.errors.push({ path: file, reason: errText(e) })
    return null
  }
  const fm = parseFrontmatter(text)
  const base = tidy(fm?.data.name ?? '') || folder
  return {
    name: scan.plugin ? `${scan.plugin}:${base}` : base,
    description: tidy(fm?.data.description ?? ''),
    path: file,
    source: scan.source,
  }
}

/** `dir/<skill>/SKILL.md`; with `depth` 2 also `dir/<category>/<skill>/SKILL.md`. */
async function scanDir(io: Io, dir: string, depth: number, scan: Scan): Promise<SkillInfo[]> {
  try {
    if (!(await io.fs.exists(dir))) return []
  } catch (e) {
    scan.errors.push({ path: dir, reason: errText(e) })
    return []
  }
  let entries
  try {
    entries = await io.fs.list(dir)
  } catch (e) {
    scan.errors.push({ path: dir, reason: errText(e) })
    return []
  }
  const candidates = entries.filter(en => !en.name.startsWith('.') && en.kind !== 'file')
  const found = await mapLimit(candidates, 12, async (en): Promise<SkillInfo[]> => {
    const folder = joinPath(dir, en.name)
    const file = `${folder}/SKILL.md`
    try {
      if (await io.fs.exists(file)) {
        const skill = await readSkill(io, file, en.name, scan)
        return skill ? [skill] : []
      }
      if (depth <= 1) return []
      // A symlink lists as kind 'other'; stat follows it.
      if (en.kind === 'other' && (await io.fs.stat(folder)).kind !== 'dir') return []
    } catch (e) {
      scan.errors.push({ path: folder, reason: errText(e) })
      return []
    }
    return scanDir(io, folder, depth - 1, scan)
  })
  return found.flat()
}

type PluginInstall = { scope?: string; installPath?: string; projectPath?: string }

async function pluginSkills(io: Io, home: string, cwd: string | null, errors: SkillReadError[]): Promise<SkillInfo[]> {
  const file = joinPath(home, '.claude/plugins/installed_plugins.json')
  let installed: Record<string, PluginInstall[]>
  try {
    if (!(await io.fs.exists(file))) return []
    const parsed = JSON.parse(await io.fs.read(file)) as { plugins?: Record<string, PluginInstall[]> }
    installed = parsed.plugins ?? {}
  } catch (e) {
    errors.push({ path: file, reason: errText(e) })
    return []
  }

  const jobs: Array<{ plugin: string; root: string }> = []
  const seen = new Set<string>()
  for (const [key, installs] of Object.entries(installed)) {
    const at = key.lastIndexOf('@')
    const plugin = at > 0 ? key.slice(0, at) : key
    for (const install of Array.isArray(installs) ? installs : []) {
      if (typeof install?.installPath !== 'string' || install.installPath === '') continue
      const isProjectScoped = install.scope !== undefined && install.scope !== 'user'
      if (isProjectScoped) {
        const owner = install.projectPath
        if (!cwd || !owner || !isSameOrInside(cwd, owner)) continue
      }
      const root = normPath(install.installPath)
      const id = `${plugin}\0${folderKey(root)}`
      if (seen.has(id)) continue
      seen.add(id)
      jobs.push({ plugin, root })
    }
  }
  const lists = await mapLimit(jobs, 4, job =>
    scanDir(io, joinPath(job.root, 'skills'), 1, { source: `plugin:${job.plugin}`, plugin: job.plugin, errors }),
  )
  return lists.flat()
}

/**
 * Every skill the session can use: user, operant-hub, project and installed plugins.
 * Never throws; whatever could not be read is listed in `errors`.
 */
export async function listSkills(io: Io, cwd: string | null | undefined): Promise<SkillList> {
  const errors: SkillReadError[] = []
  const skills: SkillInfo[] = []
  const home = await homeDir(io)
  if (!home) errors.push({ path: '~', reason: 'home folder not found' })

  const roots: Array<{ dir: string; source: SkillSource }> = []
  if (home) {
    roots.push({ dir: joinPath(home, '.claude/skills'), source: 'user' })
    roots.push({ dir: joinPath(home, '.claude/operant-hub/skills'), source: 'operant-hub' })
  }
  if (cwd) roots.push({ dir: joinPath(cwd, '.claude/skills'), source: 'project' })

  for (const root of roots) {
    skills.push(...(await scanDir(io, root.dir, 2, { source: root.source, errors })))
  }
  if (home) skills.push(...(await pluginSkills(io, home, cwd ? normPath(cwd) : null, errors)))

  const seen = new Set<string>()
  const unique = skills.filter(s => {
    const id = `${s.source}\0${s.name}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  return { skills: unique, errors }
}

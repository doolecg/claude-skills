import type { Io } from './io'

export function toSlash(p: string): string {
  const s = p.replace(/\\/g, '/')
  const lead = s.startsWith('//') ? '//' : ''
  return lead + s.slice(lead.length).replace(/\/{2,}/g, '/')
}

const isRootPath = (p: string): boolean => p === '/' || /^[A-Za-z]:\/?$/.test(p)

export function normPath(p: string): string {
  const s = toSlash(p)
  if (isRootPath(s)) return s.length === 2 ? `${s}/` : s
  return s.replace(/\/+$/, '')
}

export function joinPath(...parts: Array<string | null | undefined>): string {
  const real = parts.filter((p): p is string => typeof p === 'string' && p !== '')
  if (real.length === 0) return ''
  let out = normPath(real[0]!)
  for (const part of real.slice(1)) {
    out = `${out.replace(/\/+$/, '')}/${toSlash(part).replace(/^\/+/, '')}`
  }
  return normPath(out)
}

export function isAbsolutePath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\')
}

/** Folds `.` and `..` of `rel` onto `base` (or returns `rel` when it is absolute). */
export function resolvePath(base: string, rel: string): string {
  if (isAbsolutePath(rel)) return normPath(rel)
  const b = normPath(base)
  const drive = /^[A-Za-z]:/.exec(b)?.[0] ?? ''
  const rest = b.slice(drive.length)
  const parts = rest.split('/').filter(Boolean)
  for (const seg of toSlash(rel).split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  const lead = rest.startsWith('/') || drive ? '/' : ''
  return `${drive}${lead}${parts.join('/')}` || '/'
}

export function basename(p: string): string {
  const s = normPath(p)
  const cut = s.lastIndexOf('/')
  return cut < 0 ? s : s.slice(cut + 1)
}

export function dirname(p: string): string {
  const s = normPath(p)
  const cut = s.lastIndexOf('/')
  if (cut < 0) return '.'
  if (cut === 0) return '/'
  const head = s.slice(0, cut)
  return /^[A-Za-z]:$/.test(head) ? `${head}/` : head
}

/** Same folder, however it is spelled: slashes, trailing slash and case folded. */
export function folderKey(p: string): string {
  return normPath(p).toLowerCase()
}

export function isSameOrInside(child: string, parent: string): boolean {
  const c = folderKey(child)
  const p = folderKey(parent).replace(/\/+$/, '')
  return c === p || c.startsWith(`${p}/`)
}

export async function isWindows(io: Io, hint?: string): Promise<boolean> {
  if ((await io.env.OS()) === 'Windows_NT') return true
  return hint !== undefined && /^[A-Za-z]:[\\/]/.test(hint)
}

export async function homeDir(io: Io): Promise<string | null> {
  const profile = await io.env.USERPROFILE()
  if (profile) return normPath(profile)
  const home = await io.env.HOME()
  if (home) return normPath(home)
  const drive = await io.env.HOMEDRIVE()
  const path = await io.env.HOMEPATH()
  return drive && path ? normPath(`${drive}${path}`) : null
}

export async function tempDir(io: Io): Promise<string | null> {
  for (const value of [await io.env.TMPDIR(), await io.env.TEMP(), await io.env.TMP()]) {
    if (value) return normPath(value)
  }
  return (await isWindows(io)) ? null : '/tmp'
}

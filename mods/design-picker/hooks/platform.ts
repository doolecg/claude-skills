// Where the preview goes and how it is opened, per operating system.

export type Platform = 'windows' | 'macos' | 'linux'

export const PAGE_NAME = 'claude-design-picker.html'

export type PlatformFacts = {
  // Value of the OS variable ("Windows_NT" on Windows).
  os?: string
  // Any temp variable value, used when OS is not set.
  temp?: string
  // Whether /System/Library/CoreServices exists (macOS).
  hasMacRoot?: boolean
}

const DRIVE_PATH = /^[A-Za-z]:[\\/]/

function given(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value
}

export function detectPlatform(facts: PlatformFacts): Platform {
  if (given(facts.os)?.toLowerCase() === 'windows_nt') return 'windows'
  const temp = given(facts.temp)
  if (temp !== undefined && DRIVE_PATH.test(temp)) return 'windows'

  return facts.hasMacRoot === true ? 'macos' : 'linux'
}

export type TempEnv = { TEMP?: string; TMP?: string; TMPDIR?: string }

// The temp folder to use: TEMP then TMP on Windows, TMPDIR then /tmp elsewhere.
// Undefined when there is none.
export function chooseTempDir(platform: Platform, env: TempEnv, tmpExists: boolean): string | undefined {
  if (platform === 'windows') return given(env.TEMP) ?? given(env.TMP)

  return given(env.TMPDIR) ?? (tmpExists ? '/tmp' : undefined)
}

export function pagePath(platform: Platform, dir: string): string {
  const separator = platform === 'windows' ? '\\' : '/'
  const trimmed = dir.replace(/[\\/]+$/, '')

  return `${trimmed}${separator}${PAGE_NAME}`
}

export function openArgv(platform: Platform, path: string): string[] {
  if (platform === 'windows') return ['cmd', '/c', 'start', '', path]
  if (platform === 'macos') return ['open', path]

  return ['xdg-open', path]
}

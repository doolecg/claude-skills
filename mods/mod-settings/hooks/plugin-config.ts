// Plugin settings as Claude Code really stores them. `$.config.list()` only returns the engine's own rows, so a mod's
// fields come from its manifest (`userConfig` in `.claude-plugin/plugin.json`) and its saved values from
// `pluginConfigs["<name>@<marketplace>"].options.<field>` in the user's settings.json (missing means the default).
// These are pure helpers: the callers read and write the files with `$.fs`. This file is copied unchanged into
// mod-settings and sidebar; keep the two copies identical.

/** One installed, enabled plugin from `claude plugin list --json`. */
export type PluginEntry = { id: string; name: string; installPath: string; hasUserConfig: boolean }

export type FieldKind = 'boolean' | 'choice' | 'text' | 'number'

/** One `userConfig` field of a manifest. */
export type PluginField = { key: string; label: string; description: string; kind: FieldKind; default: string | number | boolean | undefined; options: string[] }

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The installed, enabled plugins, once each: the user-scope entry wins over a project one. */
export function pluginEntries(list: unknown): PluginEntry[] {
  if (!Array.isArray(list)) return []
  const by = new Map<string, { scope: string; entry: PluginEntry }>()
  for (const p of list) {
    if (!isObject(p) || p.enabled === false || typeof p.id !== 'string' || p.id === '') continue
    const scope = typeof p.scope === 'string' ? p.scope : ''
    const entry: PluginEntry = {
      id: p.id,
      name: p.id.split('@')[0]!,
      installPath: typeof p.installPath === 'string' ? p.installPath : '',
      hasUserConfig: p.hasUserConfig !== false,
    }
    const had = by.get(p.id)
    if (!had || (scope === 'user' && had.scope !== 'user')) by.set(p.id, { scope, entry })
  }
  return [...by.values()].map(v => v.entry)
}

/** A manifest's file inside its install folder. */
export const manifestPath = (installPath: string): string => `${installPath.replace(/[\\/]+$/, '')}/.claude-plugin/plugin.json`

/** The manifest's `userConfig` fields, in file order. */
export function userConfigFields(manifestText: string): PluginField[] {
  let manifest: unknown
  try {
    manifest = JSON.parse(manifestText.replace(/^﻿/, ''))
  } catch {
    return []
  }
  const uc = isObject(manifest) ? manifest.userConfig : undefined
  if (!isObject(uc)) return []
  const out: PluginField[] = []
  for (const [key, raw] of Object.entries(uc)) {
    if (!isObject(raw)) continue
    const options = Array.isArray(raw.options) ? raw.options.map(String) : []
    const kind: FieldKind = raw.type === 'boolean' ? 'boolean' : options.length > 0 ? 'choice' : raw.type === 'number' ? 'number' : 'text'
    const d = raw.default
    out.push({
      key,
      label: typeof raw.title === 'string' && raw.title ? raw.title : key,
      description: typeof raw.description === 'string' ? raw.description : '',
      kind,
      default: typeof d === 'string' || typeof d === 'number' || typeof d === 'boolean' ? d : undefined,
      options,
    })
  }
  return out
}

/** The saved options of one plugin (`{}` when there are none). */
export function optionsOf(settings: unknown, id: string): Json {
  const configs = isObject(settings) ? settings.pluginConfigs : undefined
  const entry = isObject(configs) ? configs[id] : undefined
  const options = isObject(entry) ? entry.options : undefined
  return isObject(options) ? options : {}
}

/** A field's value on screen: what is saved, else its default, else empty. Saved text for a number or switch is read as that kind. */
export function valueOf(field: PluginField, options: Json): string | number | boolean {
  const saved = options[field.key]
  const v = saved === undefined || saved === null ? field.default : saved
  if (field.kind === 'boolean') return v === true || v === 'true'
  if (field.kind === 'number') {
    const n = Number(v)
    return v === undefined || v === '' || !Number.isFinite(n) ? 0 : n
  }
  return v === undefined ? '' : String(v)
}

/** The mods saved as switched off (`enabled` is false), by plugin name. */
export function offNames(settings: unknown): string[] {
  const configs = isObject(settings) ? settings.pluginConfigs : undefined
  if (!isObject(configs)) return []
  return Object.keys(configs).filter(id => {
    const o = optionsOf(settings, id).enabled
    return o === false || o === 'false'
  }).map(id => id.split('@')[0]!)
}

/** The plugin ids in `pluginConfigs` for a plugin name (`bottom-bar` finds `bottom-bar@dooles-tools`). */
export function configIdsOf(settings: unknown, name: string): string[] {
  const configs = isObject(settings) ? settings.pluginConfigs : undefined
  return isObject(configs) ? Object.keys(configs).filter(id => id === name || id.startsWith(`${name}@`)) : []
}

/** The settings file's text with only `pluginConfigs[id].options[field]` set; every other key stays as it was. */
export function withOption(settingsText: string, id: string, field: string, value: string | number | boolean): string {
  let root: Json = {}
  const trimmed = settingsText.replace(/^﻿/, '').trim()
  if (trimmed) {
    const parsed: unknown = JSON.parse(trimmed)
    if (!isObject(parsed)) throw new Error('settings.json is not an object')
    root = parsed
  }
  const configs = isObject(root.pluginConfigs) ? root.pluginConfigs : {}
  const entry = isObject(configs[id]) ? (configs[id] as Json) : {}
  const options = isObject(entry.options) ? entry.options : {}
  root.pluginConfigs = { ...configs, [id]: { ...entry, options: { ...options, [field]: value } } }
  return `${JSON.stringify(root, null, 2)}\n`
}

/** Where the user's settings.json lives: `$CLAUDE_CONFIG_DIR`, else `.claude` in the home folder. */
export function settingsPath(claudeConfigDir: string | undefined, home: string): string {
  const dir = claudeConfigDir && claudeConfigDir.trim() ? claudeConfigDir : `${home}/.claude`
  return `${dir.replace(/[\\/]+$/, '')}/settings.json`
}

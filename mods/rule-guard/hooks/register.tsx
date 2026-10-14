import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { RgBlock } from '../types'
import { LABELS, clip, evaluate, narrowPasses } from './rules'
import type { Context, RuleId } from './rules'

const blocks = atom({ plugin: 'rule-guard', key: 'blocks' } as const, [] as RgBlock[])
const badge = atom({ plugin: 'rule-guard', key: 'sidebarBadge' } as const, 0)
const lastPrompt = atom({ plugin: 'rule-guard', key: 'lastPrompt' } as const, '')

const KEEP = 10

// Prompts typed by the person count; notifications, peers and schedules do not.
const PERSON = new Set(['composer', 'bridge'])

export const register: Register = (on, options) => {
  const enabled: Partial<Record<RuleId, boolean>> = {}
  for (const rule of Object.keys(LABELS) as RuleId[]) enabled[rule] = options[rule] !== false

  // Also kept in $.state; the variable is the fast path and covers a state that is not there yet.
  let prompt = ''

  on('prompt.submit', async ($, e, next) => {
    if (PERSON.has(e.origin.kind) && e.isMeta !== true) {
      prompt = e.text
      await update($, lastPrompt, () => e.text)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const tool = e.tool as string
    const command = (tool === 'Bash' || tool === 'PowerShell') && typeof input.command === 'string' ? input.command : undefined
    const message = tool.endsWith('git_commit') && typeof input.message === 'string' ? input.message : undefined
    if (command === undefined && message === undefined) return next(e)

    const footer = enabled.passCap === false ? undefined : (await $.state.get({ plugin: 'context', key: 'footer' } as const))?.value
    const ctx: Context = {
      enabled,
      prompt: prompt !== '' ? prompt : await read($, lastPrompt),
      passes: narrowPasses(footer),
    }
    const hit = evaluate({ tool, command, message }, ctx)
    if (hit === null) return next(e)

    const at = await $.clock.now()
    const entry: RgBlock = { at, rule: hit.rule, label: hit.label, what: clip(command ?? message ?? '') }
    await update($, blocks, list => [entry, ...list].slice(0, KEEP))
    await update($, badge, count => count + 1)
    $.ui.toast(`Rule Guard stopped: ${hit.label}`)

    return { deny: hit.reason }
  }).catch(($, e, next) => next(e))
}

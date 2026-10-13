import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Learning, Proposal, SelfImproveData } from '../types'
import { buildSection } from './lib/compose'
import { parseConfig } from './lib/config'
import type { Config } from './lib/config'
import {
  addLearnings,
  addPref,
  addUsage,
  countTurn,
  dropProposal,
  editProposal,
  emptyData,
  isOverCap,
  normalise,
  queueProposal,
  recordCorrection,
  recordSkillUse,
  registerSkill,
  searchLocal,
  tokensToday,
  unregisterSkill,
  weakSkills,
} from './lib/data'
import {
  curlArgv,
  documentsSpec,
  isConfigured,
  memoriesFromRecall,
  parseCurl,
  recallSpec,
  reflectSpec,
  retainSpec,
  tagsFor,
  textFromReflect,
} from './lib/hindsight'
import type { HsSpec } from './lib/hindsight'
import { nudgePrompt, rewritePrompt, skillPrompt, transcriptText } from './lib/prompts'
import type { Turn } from './lib/prompts'
import { redact } from './lib/secrets'
import { parseNudge, parseProposal, planApproval, routeProposal, skillPath } from './lib/skills'
import { truncateToTokens } from './lib/tokens'
import { isCorrection, shouldNudge, shouldProposeSkill } from './lib/triggers'

type S = EngineInterface

const PANE = 'self-improve'
const STORE_KEY = 'self-improve.data'
const RECALL_TOOL = 'mcp__self-improve__recall'

const dataAtom = atom({ plugin: 'self-improve', key: 'data' } as const, emptyData())
const editingAtom = atom({ plugin: 'self-improve', key: 'editing' } as const, null)

const GOLD = '#F2C46D'
const HAIR = '#262B33'
const MUTED = '#7D8590'
const TEXT = '#E6EDF3'
const GREEN = '#3DD68C'
const AMBER = '#E3B341'
const INK = '#0D1117'

type Job = { kind: 'nudge' } | { kind: 'skill'; reason: string } | { kind: 'review' }

const mutate = async ($: S, fn: (d: SelfImproveData) => SelfImproveData): Promise<void> => {
  await update($, dataAtom, fn)
  try {
    await $.store.set(STORE_KEY, await read($, dataAtom))
  } catch {
    // the store is a convenience; the session state still holds the data
  }
}

const baseName = (p: string): string => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'project'

let cfg: Config = parseConfig({})

let home = ''
let cwd = ''
let hasCodegraph = false
let hs: 'off' | 'ok' | 'down' = isConfigured(cfg) ? 'ok' : 'off'
let recalled: string[] = []
let toolCalls = 0
let lastTaskToolCalls = 0
let usedThisTask = new Set<string>()
let usedLastTask: string[] = []
let lastUserText = ''
const queue: Job[] = []
let isDraining = false

const setStatus = ($: S, text: string): void => {
  void $.ui.status(text === '' ? undefined : text)
}

const homeDir = async ($: S): Promise<string> => {
  if (home !== '') return home
  home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  return home
}

// ---- Hindsight over curl -------------------------------------------------

const hsCall = async ($: S, spec: HsSpec): Promise<unknown | null> => {
  if (!isConfigured(cfg)) return null
  const stdin = spec.body === undefined ? undefined : JSON.stringify(spec.body)
  for (const withAuth of [true, false]) {
    try {
      const r = await $.process.run(curlArgv(cfg, spec, withAuth), { stdin, timeoutMs: 20_000 })
      if (r.exitCode !== 0) continue
      const { status, body } = parseCurl(r.stdout)
      if (status >= 200 && status < 300) {
        if (hs !== 'ok') {
          hs = 'ok'
          setStatus($, '')
        }
        return body
      }
      break
    } catch {
      break
    }
  }
  if (hs !== 'down') {
    hs = 'down'
    setStatus($, 'self-improve: Hindsight unreachable, learning locally')
  }
  return null
}

const mcpTool = async ($: S, suffix: string): Promise<string | null> => {
  try {
    const t = (await $.tool.list()).find(x => x.mcp && x.name.endsWith(suffix) && x.name.includes('hindsight'))
    return t ? t.name : null
  } catch {
    return null
  }
}

// ---- CodeGraph -----------------------------------------------------------

const codegraph = async ($: S, query: string): Promise<string> => {
  if (!cfg.codegraph.enabled || !hasCodegraph || query.trim() === '') return ''
  try {
    const r = await $.process.run(['codegraph', 'explore', redact(query).slice(0, 300)], { cwd, timeoutMs: 20_000 })
    return r.exitCode === 0 ? truncateToTokens(redact(r.stdout), 700) : ''
  } catch {
    return ''
  }
}

// ---- learner calls -------------------------------------------------------

const ask = async (
  $: S,
  model: string,
  prompt: string,
  limits: { maxIn: number; maxOut: number },
): Promise<string | null> => {
  const now = await $.clock.now()
  const d = await read($, dataAtom)
  if (d.paused) return null
  if (isOverCap(d, cfg.dailyTokenCap, now, limits.maxOut)) {
    if (d.status !== 'cap') {
      await mutate($, x => ({ ...x, status: 'cap' }))
      setStatus($, 'self-improve: daily token cap reached, learner stopped for today')
    }
    return null
  }
  const r = await $.model.complete({
    model,
    system: 'You are a careful memory curator for a coding assistant. Reply with JSON only. Never output secrets.',
    prompt: truncateToTokens(prompt, limits.maxIn + 400),
    maxTokens: limits.maxOut,
    effort: 'low',
    timeoutMs: 60_000,
  })
  const u = r.usage
  const spent = (u?.input_tokens ?? 0) + (u?.output_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0)
  await mutate($, x => addUsage(x, spent, now))
  return r.isAnswered ? r.text : null
}

const recentTurns = async ($: S, count: number): Promise<{ turns: Turn[]; tools: string[] }> => {
  const found = await $.session.messages()
  if (!Array.isArray(found)) return { turns: [], tools: [] }
  const slice = found.slice(-count)
  const tools: string[] = []
  for (const m of slice) for (const t of m.toolUses ?? []) tools.push(t.tool)
  return { turns: slice.map(m => ({ role: m.role, text: m.text })), tools }
}

const retain = async ($: S, items: Learning[]): Promise<void> => {
  if (!isConfigured(cfg) || items.length === 0) return
  const body = await hsCall(
    $,
    retainSpec(
      cfg,
      items.map(l => ({ content: l.text, tags: tagsFor(l.project, l.kind) })),
    ),
  )
  if (body === null) return
  const ids = new Set(items.map(l => l.id))
  await mutate($, d => ({ ...d, learnings: d.learnings.map(l => (ids.has(l.id) ? { ...l, synced: true } : l)) }))
}

const runNudge = async ($: S): Promise<void> => {
  const d = await read($, dataAtom)
  const { turns } = await recentTurns($, 14)
  const text = transcriptText(turns, cfg.nudge.maxIn)
  if (text === '') return
  const cg = await codegraph($, lastUserText)
  const out = await ask($, cfg.nudgeModel, nudgePrompt(text, d.prefs, cg), cfg.nudge)
  if (out === null) return
  const nudge = parseNudge(out)
  const now = await $.clock.now()
  const project = baseName(cwd)
  const items: Learning[] = nudge.facts.map((f, i) => ({
    id: `l${now}-${i}`,
    text: redact(f.text),
    kind: f.kind,
    project,
    at: now,
    synced: false,
  }))
  const safe = items.filter(l => !l.text.includes('[redacted]'))
  await mutate($, x => nudge.prefs.reduce(addPref, addLearnings(x, safe)))
  await retain($, safe)
}

const existingSkills = (d: SelfImproveData): string[] => Object.keys(d.skills)

const submit = async ($: S, p: Proposal): Promise<void> => {
  if (routeProposal(cfg.approvalMode) === 'approve') {
    await approve($, p)
    return
  }
  await mutate($, d => queueProposal(d, p))
  $.ui.toast(`self-improve: skill proposed (${p.action} ${p.name}), see /learn`)
}

const runSkill = async ($: S, reason: string): Promise<void> => {
  const d = await read($, dataAtom)
  const { turns, tools } = await recentTurns($, 30)
  const text = transcriptText(turns, cfg.skill.maxIn)
  if (text === '') return
  const counts = new Map<string, number>()
  for (const t of tools) counts.set(t, (counts.get(t) ?? 0) + 1)
  const toolLine = [...counts].map(([k, v]) => `${k} x${v}`).join(', ')
  const cg = await codegraph($, lastUserText)
  const out = await ask(
    $,
    cfg.skillModel,
    skillPrompt(`${text}\n\nTools used: ${toolLine}`, reason, existingSkills(d), cg),
    cfg.skill,
  )
  if (out === null) return
  const now = await $.clock.now()
  const p = parseProposal(out, 'create', `p${now}`, now)
  if (p === null || d.skills[p.name]) return
  await submit($, p)
}

const runReview = async ($: S): Promise<void> => {
  const now = await $.clock.now()
  const d = await read($, dataAtom)
  const weak = weakSkills(d, now).find(w => !d.pending.some(p => p.name === w.name))
  if (!weak) return
  if (weak.why === 'unused') {
    await submit($, {
      id: `p${now}`,
      action: 'prune',
      name: weak.name,
      description: '',
      body: '',
      reason: 'Never used in over 30 days.',
      at: now,
    })
    return
  }
  const h0 = await homeDir($)
  const path = skillPath(h0, weak.name)
  if (path === null) return
  let current = ''
  try {
    current = await $.fs.read(path)
  } catch {
    return
  }
  const cg = await codegraph($, weak.name)
  const others = existingSkills(d).filter(n => n !== weak.name)
  const out = await ask(
    $,
    cfg.skillModel,
    rewritePrompt(weak.name, truncateToTokens(redact(current), cfg.rewrite.maxIn), 'often corrected after use', 'rewrite', others, cg),
    cfg.rewrite,
  )
  if (out === null) return
  const p = parseProposal(out, 'rewrite', `p${now}`, now)
  if (p === null || p.name !== weak.name) return
  if (p.mergeInto) p.action = 'merge'
  await submit($, p)
}

const drain = async ($: S): Promise<void> => {
  if (isDraining) return
  isDraining = true
  try {
    while (queue.length > 0) {
      const job = queue.shift()
      if (!job || !cfg.enabled) continue
      try {
        if (job.kind === 'nudge') await runNudge($)
        else if (job.kind === 'skill') await runSkill($, job.reason)
        else await runReview($)
      } catch {
        // a failed learner job is dropped; it never reaches a turn
      }
    }
  } finally {
    isDraining = false
  }
}

const enqueue = ($: S, job: Job): void => {
  if (!cfg.enabled) return
  if (queue.some(j => j.kind === job.kind)) return
  queue.push(job)
  $.clock.after(50, () => {
    void drain($)
  })
}

// ---- approval ------------------------------------------------------------

const approve = async ($: S, p: Proposal): Promise<string> => {
  const h0 = await homeDir($)
  const d = await read($, dataAtom)
  const owned = new Set(Object.keys(d.skills))
  const plan = planApproval(p, h0, owned)
  if (plan.error !== undefined) return `Not applied: ${plan.error}.`
  try {
    if (plan.write) {
      if (p.action === 'create' && (await $.fs.exists(plan.write.path))) return 'Not applied: a skill with that name already exists.'
      await $.fs.write(plan.write.path, plan.write.content)
    }
    if (plan.remove) {
      const dir = (skillPath(h0, plan.remove) ?? '').replace(/\/SKILL\.md$/, '')
      if (!/\/\.claude\/skills\/[a-z0-9][a-z0-9-]*$/.test(dir)) return 'Not applied: bad path.'
      const isWin = /^[A-Za-z]:|\\/.test(h0)
      await $.process.run(isWin ? ['powershell', '-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath '${dir.replace(/'/g, "''")}'`] : ['rm', '-rf', dir])
    }
  } catch {
    return 'Not applied: the write failed.'
  }
  const now = await $.clock.now()
  await mutate($, x => {
    let n = dropProposal(x, p.id)
    if (p.action === 'create') n = registerSkill(n, p.name, now)
    if (p.action === 'merge' || p.action === 'prune') n = unregisterSkill(n, p.name)
    return n
  })
  if (isConfigured(cfg) && plan.write) {
    void hsCall(
      $,
      retainSpec(cfg, [{ content: `Skill ${p.mergeInto ?? p.name}: ${p.description}`, tags: tagsFor(baseName(cwd), 'skill'), documentId: `skill:${p.mergeInto ?? p.name}` }]),
    )
  }
  return `Applied: ${p.action} ${p.mergeInto ?? p.name}.`
}

const findPending = (d: SelfImproveData, ref: string): Proposal | undefined => {
  const n = Number(ref)
  return d.pending.find(p => p.id === ref) ?? (Number.isInteger(n) && n >= 1 ? d.pending[n - 1] : undefined)
}

export const register: Register = (on, options) => {
  cfg = parseConfig(options)

  // ---- hooks ---------------------------------------------------------------

  on('session.start', async ($, e, next) => {
    try {
      cwd = e.cwd
      await homeDir($)
      const stored = await $.store.get(STORE_KEY)
      await update($, dataAtom, () => ({ ...normalise(stored), status: '' }))
      hasCodegraph = cfg.codegraph.enabled && (await $.fs.exists(`${cwd}/.codegraph`))
      await $.command.register({ name: 'learn', description: 'Self-improve: status, pause, resume, pending, config, approve, reject', argumentHint: '[status|pause|resume|pending|config|approve N|reject N]' })
      await $.tool.register({
        name: 'recall',
        description: 'Search what past sessions learned: decisions, preferences, facts. Searches Hindsight first, then the local index. Set why=true to ask Hindsight to reflect on why something was decided.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' }, why: { type: 'boolean' }, docs: { type: 'boolean' } },
          required: ['query'],
        },
        isDeferred: false,
      })
      if (cfg.enabled && isConfigured(cfg)) {
        $.clock.after(100, () => {
          void (async () => {
            const body = await hsCall($, recallSpec(cfg, `preferences and decisions for ${baseName(cwd)}`, Math.max(100, cfg.maxInjectTokens)))
            if (body !== null) recalled = memoriesFromRecall(body)
          })()
        })
      }
    } catch {
      // starting up never fails the session
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      if (cfg.enabled) {
        lastUserText = e.text
        lastTaskToolCalls = toolCalls
        usedLastTask = [...usedThisTask]
        if (lastTaskToolCalls > 0 && isCorrection(e.text)) {
          if (usedLastTask.length > 0) await mutate($, d => recordCorrection(d, usedLastTask))
          if (shouldProposeSkill(lastTaskToolCalls, true, cfg.minToolCallsForSkill)) enqueue($, { kind: 'skill', reason: 'was corrected by the user' })
        }
        toolCalls = 0
        usedThisTask = new Set()
        if (isConfigured(cfg) && !isCorrection(e.text) && e.text.length > 12) {
          const q = redact(e.text).slice(0, 300)
          $.clock.after(10, () => {
            void (async () => {
              const body = await hsCall($, recallSpec(cfg, q, Math.max(100, cfg.maxInjectTokens)))
              if (body !== null) recalled = memoriesFromRecall(body)
            })()
          })
        }
      }
    } catch {
      // never block a prompt
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined && !String(e.tool).startsWith('mcp__self-improve__')) toolCalls += 1
    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    try {
      const d = await read($, dataAtom)
      if (d.skills[e.skill]) {
        usedThisTask.add(e.skill)
        const now = await $.clock.now()
        await mutate($, x => recordSkillUse(x, e.skill, now))
      }
    } catch {
      // usage tracking is best effort
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined || !cfg.enabled || e.reason !== 'answer') return next(e)
    try {
      await mutate($, countTurn)
      const d = await read($, dataAtom)
      if (d.paused) return next(e)
      if (shouldNudge(d.turns, cfg.nudgeEveryTurns)) {
        enqueue($, { kind: 'nudge' })
        enqueue($, { kind: 'review' })
      }
      if (shouldProposeSkill(toolCalls, false, cfg.minToolCallsForSkill)) enqueue($, { kind: 'skill', reason: `took ${toolCalls} tool calls` })
    } catch {
      // learning never fails a turn
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const res = await next(e)
    if (!cfg.enabled) return res
    try {
      const d = await read($, dataAtom)
      if (d.paused) return res
      const text = buildSection({ prefs: d.prefs, recalled, isCodegraph: hasCodegraph, maxTokens: cfg.maxInjectTokens })
      if (text === '') return res
      return { ...res, sections: [...res.sections, { id: 'self-improve:context', text, scope: 'session' as const }] }
    } catch {
      return res
    }
  })

  on('tool.call', { tool: /^mcp__self-improve__recall$/ }, async ($, ev) => {
    const e = ev as unknown as { query?: unknown; why?: unknown; docs?: unknown }
    const query = typeof e.query === 'string' ? redact(e.query).slice(0, 400) : ''
    if (query === '') return { result: 'Give a query.' }
    const why = e.why === true
    try {
      const out: string[] = []
      if (e.docs === true && isConfigured(cfg)) {
        const docs = await hsCall($, documentsSpec(cfg))
        const items = (docs as { items?: { id?: string }[] } | null)?.items
        if (Array.isArray(items)) out.push(...items.map(x => `document: ${String(x.id ?? '')}`))
      }
      if (isConfigured(cfg)) {
        const body = await hsCall($, why ? reflectSpec(cfg, query) : recallSpec(cfg, query, 800))
        if (body !== null) {
          if (why) {
            const t = textFromReflect(body)
            if (t) out.push(t)
          } else out.push(...memoriesFromRecall(body))
        } else if (why) {
          const name = await mcpTool($, 'reflect')
          if (name) {
            const r = await $.tool.call({ tool: name, query } as never)
            if (typeof (r as { text?: string }).text === 'string') out.push((r as { text: string }).text)
          }
        }
      }
      const d = await read($, dataAtom)
      for (const l of searchLocal(d, query)) if (!out.includes(l)) out.push(l)
      if (out.length === 0) return { result: 'Nothing found in past knowledge.' }
      return { result: truncateToTokens(redact(out.map(x => `- ${x}`).join('\n')), 1500) }
    } catch {
      return { result: 'Recall is unavailable right now.' }
    }
  })

  on('command.run', { command: 'learn' }, async ($, e) => {
    try {
      const d = await read($, dataAtom)
      const now = await $.clock.now()
      const [verb = 'status', arg = ''] = e.args.trim().split(/\s+/)
      const open = (): void => {
        $.clock.after(50, () => void $.ui.open({ id: PANE, title: 'Self improve' }))
      }
      if (verb === 'pause' || verb === 'resume') {
        await mutate($, x => ({ ...x, paused: verb === 'pause', status: '' }))
        return { text: verb === 'pause' ? 'Learner paused.' : 'Learner resumed.' }
      }
      if (verb === 'approve' || verb === 'reject') {
        const p = findPending(d, arg)
        if (!p) return { text: 'No pending proposal with that id or number.' }
        if (verb === 'reject') {
          await mutate($, x => dropProposal(x, p.id))
          return { text: `Rejected ${p.name}.` }
        }
        return { text: await approve($, p) }
      }
      if (verb === 'config') {
        return {
          text: [
            `enabled ${cfg.enabled}, approval ${cfg.approvalMode}, memory every ${cfg.nudgeEveryTurns} turns, skill at ${cfg.minToolCallsForSkill} tool calls`,
            `models ${cfg.nudgeModel} / ${cfg.skillModel}, inject budget ${cfg.maxInjectTokens} tokens, daily cap ${cfg.dailyTokenCap || 'none'}`,
            `hindsight ${isConfigured(cfg) ? `${cfg.hindsight.baseUrl} bank ${cfg.hindsight.bank} key env ${cfg.hindsight.apiKeyEnv}` : 'off'}, codegraph ${hasCodegraph ? 'on' : 'off'}`,
            'Change these in /config under the self-improve plugin.',
          ].join('\n'),
        }
      }
      if (verb === 'pending') {
        open()
        return {
          text: d.pending.length
            ? d.pending.map((p, i) => `${i + 1}. ${p.action} ${p.name} (${p.id}): ${p.reason}`).join('\n')
            : 'No pending proposals.',
        }
      }
      open()
      const cap = cfg.dailyTokenCap ? ` of ${cfg.dailyTokenCap}` : ''
      return {
        text: `${d.paused ? 'Paused' : cfg.enabled ? 'Active' : 'Disabled'}. Hindsight ${hs}. ${d.pending.length} pending, ${d.learnings.length} learnings, ${tokensToday(d, now)}${cap} tokens today.`,
      }
    } catch {
      return { text: 'self-improve hit an error; nothing was changed.' }
    }
  })

  // ---- pane ----------------------------------------------------------------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const d = await read($, dataAtom)
    const editing = await read($, editingAtom)
    const now = Date.now()
    const cols = Math.max(20, e.props.bodyColumns)
    const used = tokensToday(d, now)
    const ratio = cfg.dailyTokenCap > 0 ? Math.min(1, used / cfg.dailyTokenCap) : 0
    const barLen = Math.max(8, Math.min(30, cols - 24))
    const filled = Math.round(ratio * barLen)
    const meter = ratio >= 0.8 ? AMBER : GREEN
    const state = d.paused ? 'PAUSED' : cfg.enabled ? 'ACTIVE' : 'DISABLED'
    const stateColor = state === 'ACTIVE' ? GREEN : AMBER
    const hsText = hs === 'off' ? 'local only' : hs === 'ok' ? 'connected' : 'unreachable, local only'
    const goldLen = Math.min(8, cols)

    const heading = (text: string) => (
      <Box marginTop={1}>
        <Text color={MUTED} bold>
          {text.toUpperCase()}
        </Text>
      </Box>
    )
    const chip = (text: string, isPrimary = false) => (
      <Text backgroundColor={isPrimary ? GOLD : HAIR} color={isPrimary ? INK : TEXT} bold={isPrimary}>
        {` ${text} `}
      </Text>
    )

    return (
      <Box flexDirection="column" width={cols}>
        <Text color={TEXT} bold wrap="truncate-end">
          SELF IMPROVE
        </Text>
        <Text wrap="truncate-end">
          <Text color={GOLD}>{'━'.repeat(goldLen)}</Text>
          <Text color={HAIR}>{'─'.repeat(Math.max(0, cols - goldLen))}</Text>
        </Text>

        {heading("Status")}
        <Text wrap="truncate-end">
          <Text color={stateColor} bold>
            {state}
          </Text>
          <Text color={TEXT}>{`  Hindsight ${hsText}  CodeGraph ${hasCodegraph ? 'on' : 'off'}`}</Text>
        </Text>

        {heading("Today")}
        <Text wrap="truncate-end">
          <Text color={meter}>{'█'.repeat(filled)}</Text>
          <Text color={HAIR}>{'█'.repeat(barLen - filled)}</Text>
          <Text color={TEXT}>{`  ${used.toLocaleString()}${cfg.dailyTokenCap ? ` / ${cfg.dailyTokenCap.toLocaleString()}` : ''} tokens`}</Text>
        </Text>

        {heading(`Pending skills (${d.pending.length})`)}
        {d.pending.length === 0 && (
          <Text color={MUTED} wrap="truncate-end">
            Nothing waiting.
          </Text>
        )}
        {d.pending.map(p => (
          <Box key={p.id} flexDirection="column" marginBottom={1}>
            <Text wrap="truncate-end">
              <Text color={TEXT} bold>
                {p.name}
              </Text>
              <Text color={MUTED}>{`  ${p.action}`}</Text>
            </Text>
            <Text color={MUTED} wrap="truncate-end">
              {p.reason || p.description}
            </Text>
            <Box gap={1}>
              <Button key={`ok-${p.id}`} plain onPress={() => void approve($, p)}>
                {chip('APPROVE', true)}
              </Button>
              <Button key={`ed-${p.id}`} plain onPress={() => void update($, editingAtom, () => (editing === p.id ? null : p.id))}>
                {chip('EDIT')}
              </Button>
              <Button key={`no-${p.id}`} plain onPress={() => void mutate($, x => dropProposal(x, p.id))}>
                {chip('REJECT')}
              </Button>
            </Box>
            {editing === p.id && Input !== undefined && (
              <Box flexDirection="column">
                <Input
                  key={`desc-${p.id}`}
                  label="Description"
                  value={p.description}
                  onSubmit={(v: string) => void mutate($, x => editProposal(x, p.id, { description: v }))}
                />
                <Input
                  key={`body-${p.id}`}
                  label="Body (replaces)"
                  placeholder="Enter new body, Enter to save"
                  onSubmit={(v: string) => void mutate($, x => editProposal(x, p.id, { body: v }))}
                />
              </Box>
            )}
          </Box>
        ))}

        {heading("Recent learnings")}
        {d.learnings.length === 0 && (
          <Text color={MUTED} wrap="truncate-end">
            Nothing yet.
          </Text>
        )}
        {d.learnings
          .slice(-6)
          .reverse()
          .map(l => (
            <Text key={l.id} color={TEXT} wrap="truncate-end">
              {`${l.synced ? '+' : '-'} ${l.text}`}
            </Text>
          ))}
        <Box marginTop={1} gap={1}>
          <Button key="toggle" plain onPress={() => void mutate($, x => ({ ...x, paused: !x.paused }))}>
            {chip(d.paused ? 'RESUME' : 'PAUSE')}
          </Button>
        </Box>
      </Box>
    )
  })

}

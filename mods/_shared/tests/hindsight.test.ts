import { describe, expect, test } from 'claude-code/testing'

import {
  gitProjectName,
  health,
  loadHindsight,
  parseHindsightConfig,
  projectBank,
  recall,
  resolveProjectBank,
  retain,
  userBank,
} from '../lib/hindsight'
import type { HindsightConfig } from '../lib/hindsight'
import { fakeIo, reply } from './fakeio'

const URL = 'http://192.168.0.41:8888'

const cfgOf = (extra: Record<string, unknown> = {}): HindsightConfig => {
  const parsed = parseHindsightConfig({ serverMode: 'self-hosted', apiUrl: `${URL}/`, ...extra })
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.config
}

describe('config', () => {
  test('only a self-hosted config with a url is used', () => {
    expect(parseHindsightConfig({ serverMode: 'cloud', apiUrl: URL })).toEqual({ ok: false, reason: 'not self-hosted' })
    expect(parseHindsightConfig({ apiUrl: URL })).toEqual({ ok: false, reason: 'not self-hosted' })
    expect(parseHindsightConfig({ serverMode: 'self-hosted' })).toEqual({ ok: false, reason: 'not configured' })
    expect(parseHindsightConfig({ serverMode: 'self-hosted', apiUrl: 'nonsense' })).toEqual({ ok: false, reason: 'not configured' })
    expect(parseHindsightConfig({ serverMode: 'self-hosted', apiUrl: URL, disabled: true })).toEqual({ ok: false, reason: 'disabled' })
    expect(parseHindsightConfig(null)).toEqual({ ok: false, reason: 'invalid config' })
  })

  test('the token is read from apiToken and never shows when the config is printed', () => {
    const cfg = cfgOf({ apiToken: 'sekrit-123' })
    expect(cfg.apiUrl).toBe(URL)
    expect(cfg.token).toBe('sekrit-123')
    expect(JSON.stringify(cfg)).not.toContain('sekrit')
    expect(cfgOf().token).toBeUndefined()
  })

  test('loadHindsight reads ~/.hindsight/coding-agent.json', async () => {
    const env = { USERPROFILE: 'C:\\Users\\Dayle Frost' }
    const file = 'C:/Users/Dayle Frost/.hindsight/coding-agent.json'
    const ok = await loadHindsight(fakeIo({ files: { [file]: JSON.stringify({ serverMode: 'self-hosted', apiUrl: URL }) }, env }).io)
    expect(ok.ok && ok.config.apiUrl).toBe(URL)
    expect(await loadHindsight(fakeIo({ env }).io)).toEqual({ ok: false, reason: 'not configured' })
    expect(await loadHindsight(fakeIo({ files: { [file]: '{ bad' }, env }).io)).toEqual({ ok: false, reason: 'invalid config' })
    expect(await loadHindsight(fakeIo().io)).toEqual({ ok: false, reason: 'not configured' })
  })
})

describe('bank names', () => {
  test('project bank is coding-agent::<folder name>; the user bank is global', () => {
    expect(projectBank('F:\\PROGRAMMING\\REPOS\\ClaudeMods')).toBe('coding-agent::ClaudeMods')
    expect(projectBank('C:/Users/Dayle Frost/')).toBe('coding-agent::Dayle Frost')
    expect(projectBank('F:/x/sub', 'ClaudeMods')).toBe('coding-agent::ClaudeMods')
    expect(projectBank('')).toBe('coding-agent::unknown')
    expect(userBank()).toBe('coding-agent::user')
    expect(userBank(cfgOf({ userBankId: 'me-global' }))).toBe('me-global')
  })

  test('git project: main checkout, subfolder, worktree, submodule, no repository', async () => {
    const { io } = fakeIo({
      files: {
        'F:/R/ClaudeMods/.git/HEAD': 'ref',
        'F:/R/ClaudeMods/mods/a/x.txt': 'x',
        'F:/R/wt-dir/.git': 'gitdir: F:/R/ClaudeMods/.git/worktrees/wt\n',
        'F:/R/ClaudeMods/.git/worktrees/wt/commondir': '../..\n',
        'F:/R/rel/.git': 'gitdir: ../ClaudeMods/.git/worktrees/wt',
        'F:/R/parent/sub/.git': 'gitdir: ../.git/modules/sub',
        'F:/R/parent/.git/modules/sub/HEAD': 'ref',
        'F:/plain/folder/a.txt': 'a',
      },
    })
    expect(await gitProjectName(io, 'F:/R/ClaudeMods')).toBe('ClaudeMods')
    expect(await gitProjectName(io, 'F:\\R\\ClaudeMods\\mods\\a')).toBe('ClaudeMods')
    expect(await gitProjectName(io, 'F:/R/ClaudeMods/not/made/yet')).toBe('ClaudeMods')
    expect(await gitProjectName(io, 'F:/R/wt-dir')).toBe('ClaudeMods')
    expect(await gitProjectName(io, 'F:/R/rel')).toBe('ClaudeMods')
    expect(await gitProjectName(io, 'F:/R/parent/sub')).toBe('sub')
    expect(await gitProjectName(io, 'F:/plain/folder')).toBe('folder')
    expect(await gitProjectName(io, 'F:/R/wt-dir', false)).toBe('wt-dir')
  })

  test('resolveProjectBank follows the hook config: template, fixed bank, path map', async () => {
    const { io } = fakeIo({ files: { 'F:/R/App/.git/HEAD': 'x', 'F:/R/App/src/a.ts': 'a' }, env: { HINDSIGHT_USER_ID: 'dayle' } })
    expect(await resolveProjectBank(io, cfgOf(), 'F:/R/App/src')).toBe('coding-agent::App')
    expect(await resolveProjectBank(io, cfgOf({ bankIdTemplate: 'cc-{harness}-{project}-{user}-{channel}' }), 'F:/R/App/src')).toBe('cc-claude-code-src-dayle-default')
    expect(await resolveProjectBank(io, cfgOf({ bankIdTemplate: 'x-{nope}' }), 'F:/R/App')).toBe('x-unknown')
    expect(await resolveProjectBank(io, cfgOf({ bankId: 'one-bank' }), 'F:/R/App')).toBe('one-bank')
    expect(await resolveProjectBank(io, cfgOf({ bankId: 'one-bank', dynamicBankId: true }), 'F:/R/App')).toBe('coding-agent::App')
    const mapped = cfgOf({ mapPathToBank: { 'f:\\r\\app': 'mapped', 'F:/R/App/src': 'deeper' } })
    expect(await resolveProjectBank(io, mapped, 'F:/R/App/src/x')).toBe('deeper')
    expect(await resolveProjectBank(io, mapped, 'F:/R/App')).toBe('mapped')
    expect(await resolveProjectBank(io, mapped, 'F:/R/Other')).toBe('coding-agent::Other')
  })
})

describe('recall', () => {
  const body = {
    results: [
      { id: 'a', text: '  First lesson  ', type: 'observation', tags: ['t'], document_id: 'd1', mentioned_at: '2026-10-10T00:00:00Z' },
      { id: 'b', text: '', type: 'observation' },
      { id: 'c', text: 'Second', type: 'world' },
    ],
  }

  test('posts the hooks request shape and parses the results', async () => {
    const f = fakeIo({ fetch: async () => reply(200, body) })
    const r = await recall(f.io, cfgOf({ apiToken: 'tok-9' }), 'coding-agent::ClaudeMods', 'hooks api', { maxTokens: 800 })
    expect(r).toEqual({
      ok: true,
      results: [
        { id: 'a', text: 'First lesson', type: 'observation', tags: ['t'], documentId: 'd1', mentionedAt: '2026-10-10T00:00:00Z' },
        { id: 'c', text: 'Second', type: 'world', tags: [], documentId: null, mentionedAt: null },
      ],
    })
    const call = f.calls.fetch[0]!
    expect(call.url).toBe(`${URL}/v1/default/banks/coding-agent%3A%3AClaudeMods/memories/recall`)
    expect(call.init?.method).toBe('POST')
    expect(call.init?.headers?.Authorization).toBe('Bearer tok-9')
    expect(JSON.parse(call.init?.body ?? '{}')).toEqual({
      query: 'hooks api',
      types: ['observation'],
      budget: 'low',
      max_tokens: 800,
      include: { entities: null },
    })
  })

  test('no Authorization header without a token; tags and types are passed on', async () => {
    const f = fakeIo({ fetch: async () => reply(200, { results: [] }) })
    await recall(f.io, cfgOf(), 'b', 'q', { types: ['observation', 'world'], tags: ['x'], budget: 'mid' })
    expect(f.calls.fetch[0]!.init?.headers?.Authorization).toBeUndefined()
    const sent = JSON.parse(f.calls.fetch[0]!.init?.body ?? '{}')
    expect(sent.types).toEqual(['observation', 'world'])
    expect(sent.tags).toEqual(['x'])
    expect(sent.budget).toBe('mid')
  })

  test('a bank that does not exist yet gives no results', async () => {
    const f = fakeIo({ fetch: async () => reply(404, { detail: 'bank not found' }) })
    expect(await recall(f.io, cfgOf(), 'new', 'q')).toEqual({ ok: true, results: [] })
  })

  test('failures come back as reasons, never as throws', async () => {
    const f401 = fakeIo({ fetch: async () => reply(401, { detail: 'no' }) })
    expect(await recall(f401.io, cfgOf(), 'b', 'q')).toEqual({ ok: false, reason: 'HTTP 401' })
    const f500 = fakeIo({ fetch: async () => reply(500, 'boom') })
    expect(await recall(f500.io, cfgOf(), 'b', 'q')).toEqual({ ok: false, reason: 'HTTP 500' })
    const garbage = fakeIo({ fetch: async () => reply(200, '<html>') })
    expect(await recall(garbage.io, cfgOf(), 'b', 'q')).toEqual({ ok: true, results: [] })
  })

  test('a server that does not answer in 5 s is skipped as a timeout', async () => {
    const f = fakeIo({ sleep: 'now', fetch: () => new Promise(() => undefined) })
    expect(await recall(f.io, cfgOf(), 'b', 'q')).toEqual({ ok: false, reason: 'timeout' })
    expect(await health(f.io, cfgOf())).toEqual({ ok: false, reason: 'timeout' })
    expect(await retain(f.io, cfgOf(), 'b', [{ content: 'x' }])).toEqual({ ok: false, reason: 'timeout' })
  })

  test('the limit is 5000 ms on the engine clock, and is cancelled when the server answers', async () => {
    let asked = -1
    let aborted = false
    const f = fakeIo({ fetch: async () => reply(200, { results: [] }) })
    f.io.clock.sleep = (ms, options) => {
      asked = ms
      return new Promise<void>((_, reject) =>
        options?.signal?.addEventListener('abort', () => {
          aborted = true
          reject(new Error('aborted'))
        }),
      )
    }
    await recall(f.io, cfgOf(), 'b', 'q')
    expect(asked).toBe(5000)
    expect(aborted).toBe(true)
  })

  test('a network error is reported without the token', async () => {
    const f = fakeIo({
      fetch: async () => {
        throw new Error('connect ECONNREFUSED while sending Bearer tok-77')
      },
    })
    const r = await recall(f.io, cfgOf({ apiToken: 'tok-77' }), 'b', 'q')
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).toContain('unreachable')
    expect(JSON.stringify(r)).not.toContain('tok-77')
  })
})

describe('retain and health', () => {
  test('retain posts async items with only the fields given', async () => {
    const f = fakeIo({ fetch: async () => reply(200, { success: true, operation_id: 'op-1' }) })
    const r = await retain(f.io, cfgOf({ apiToken: 't' }), 'coding-agent::user', [
      { content: 'Dayle prefers short replies', tags: ['source:learner'], documentId: 'lesson:1', context: 'a lesson' },
      { content: '   ' },
      { content: 'second', metadata: { session: 's1' }, timestamp: '2026-10-11T00:00:00Z' },
    ])
    expect(r).toEqual({ ok: true, operationId: 'op-1' })
    const call = f.calls.fetch[0]!
    expect(call.url).toBe(`${URL}/v1/default/banks/coding-agent%3A%3Auser/memories`)
    expect(call.init?.method).toBe('POST')
    expect(JSON.parse(call.init?.body ?? '{}')).toEqual({
      async: true,
      items: [
        { content: 'Dayle prefers short replies', context: 'a lesson', document_id: 'lesson:1', tags: ['source:learner'] },
        { content: 'second', metadata: { session: 's1' }, timestamp: '2026-10-11T00:00:00Z' },
      ],
    })
  })

  test('retain refuses an empty list without calling the server, and reports HTTP errors', async () => {
    const f = fakeIo({ fetch: async () => reply(422, {}) })
    expect(await retain(f.io, cfgOf(), 'b', [])).toEqual({ ok: false, reason: 'nothing to retain' })
    expect(f.calls.fetch.length).toBe(0)
    expect(await retain(f.io, cfgOf(), 'b', [{ content: 'x' }])).toEqual({ ok: false, reason: 'HTTP 422' })
    const missing = fakeIo({ fetch: async () => reply(404, {}) })
    expect(await retain(missing.io, cfgOf(), 'b', [{ content: 'x' }])).toEqual({ ok: false, reason: 'HTTP 404' })
  })

  test('health asks /health and wants "healthy"', async () => {
    const f = fakeIo({ fetch: async () => reply(200, { status: 'healthy', database: 'connected' }) })
    expect(await health(f.io, cfgOf())).toEqual({ ok: true, status: 'healthy' })
    expect(f.calls.fetch[0]!.url).toBe(`${URL}/health`)
    expect(f.calls.fetch[0]!.init?.method).toBe('GET')
    const sick = fakeIo({ fetch: async () => reply(200, { status: 'degraded' }) })
    expect(await health(sick.io, cfgOf())).toEqual({ ok: false, reason: 'status degraded' })
    const down = fakeIo({ fetch: async () => reply(503, '') })
    expect(await health(down.io, cfgOf())).toEqual({ ok: false, reason: 'HTTP 503' })
  })
})

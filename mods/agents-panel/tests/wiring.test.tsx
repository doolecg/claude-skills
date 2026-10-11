import { describe, expect, mock, test } from 'claude-code/testing'

import { critterOf } from '../hooks/critter'

const PLUGIN = 'agents-panel'
const SURFACES = ['terminal', 'desktop'] as const
const T0 = 1_800_000_000_000
const SESSION = { cwd: 'F:/proj', surface: 'terminal', isInteractive: true } as any

const BAND = {
  component: 'AbovePrompt' as const,
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
}
const pane = (bodyColumns = 100) =>
  ({
    component: 'Pane' as const,
    requestId: 'agents-panel',
    props: { title: 'Agents', isFocused: false, bodyColumns, bodyRows: 40, placement: 'inline', scroll: { offset: 0, bodyRows: 40 } },
  }) as any

const ON = { options: { showBand: true } }
const command = (args: string) => ({ command: 'agents-panel', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }) as any

type World = {
  store: Map<string, unknown>
  sets: { key: string; value: unknown }[]
  opened: any[]
  registered: string[]
  tools: any[]
  mcpTools: { name: string; serverName: string }[]
  denyConfig: boolean
}

function world(on: any, over: Partial<World> = {}): World {
  const w: World = { store: new Map(), sets: [], opened: [], registered: [], tools: [], mcpTools: [], denyConfig: false, ...over }
  mock.clock(on, { now: T0 })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.cwd', () => ({ value: 'F:/proj' }))
  on('session.id', () => ({ value: 'sid' }))
  on('session.repo', () => ({ value: { root: 'F:/proj' } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '## main...origin/main\n M src/a.ts\n', stderr: '' } }))
  on('command.register', (_$: any, e: any) => {
    w.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('store.get', (_$: any, e: any) => ({ value: w.store.get(e.key) }))
  on('store.set', (_$: any, e: any) => {
    w.store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_$: any, e: any) => {
    w.store.delete(e.key)
    return { value: undefined }
  })
  on('config.set', (_$: any, e: any) => {
    w.sets.push({ key: e.key, value: e.value })
    return w.denyConfig ? { deny: 'managed' } : { value: e.value }
  })
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }))
  on('ui.open', (_$: any, e: any) => {
    w.opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.scroll', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { context: { window: 200_000, breakdown: { mcpTools: w.mcpTools } } },
  }))
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', (_$: any, e: any) => ({ agentId: `agent-${e.tool_use_id}`, model: 'claude-haiku-5-5' }))
  on('session.messages', () => ({ value: [] }))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  on('classic.SubagentStop', () => ({}))
  on('classic.SubagentStart', () => ({}))
  on('classic.PermissionRequest', () => ({}))
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => {
    throw new Error('no file')
  })
  on('tool.call', (_$: any, e: any) => {
    w.tools.push(e)
    return { result: 'ok', text: 'ok' } as never
  })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['below me'] }))
  return w
}

const spawn = ($: any, id: string) =>
  $.agent.spawn({ tool_use_id: id, prompt: 'look around', description: 'Find the bug', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' } })

describe('hook wiring', () => {
  test('session.start registers /agents-panel and never opens a pane', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(w.registered).toEqual(['agents-panel'])
    expect(w.opened).toEqual([])
  })

  test('/agents-panel opens the pane', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const out = await $.command.run(command(''))
    expect(out.text).toBe('Agents panel opened.')
    expect(w.opened).toEqual([{ id: 'agents-panel', title: 'Agents' }])
  })

  test('tool calls pass on unchanged', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const ran = await $.tool.call({ tool: 'Edit', file_path: 'F:/proj/src/a.ts', old_string: 'a', new_string: 'b' })
    expect(ran).toMatchObject({ result: 'ok', text: 'ok' })
    expect(w.tools[0]).toMatchObject({ tool: 'Edit', file_path: 'F:/proj/src/a.ts', old_string: 'a', new_string: 'b' })
  })
})

describe('pane', () => {
  for (const surface of SURFACES) {
    test(`Right Now, files, cards and the empty states on ${surface}`, async ($, on) => {
      world(on)
      await $.session.start(SESSION)
      await $.turn.start({ text: 'go', turnId: 't1' })
      for (const f of ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts']) {
        await $.tool.call({ tool: 'Read', file_path: `F:/proj/src/${f}` })
      }
      await $.tool.call({ tool: 'Edit', file_path: 'F:/proj/src/a.ts', old_string: 'a', new_string: 'b' })
      await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1' })

      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...pane() })
      expect(await ui.find({ text: 'Right now' })).toBeDefined()
      expect(await ui.find({ text: 'Claude edited 1 file' })).toBeDefined()
      expect(await ui.find({ text: 'main' })).toBeDefined()
      expect(await ui.find({ text: '+2 more' })).toBeDefined()
      expect(await ui.find({ text: 'Claude read' })).toBeDefined()
      expect(await ui.find({ text: 'Claude edited' })).toBeDefined()
      expect(await ui.find({ text: 'Not committed' })).toBeDefined()
      expect(await ui.find({ text: 'Cost' })).toBeDefined()
      expect(await ui.find({ text: 'Tokens' })).toBeDefined()
      expect(await ui.find({ text: 'Time' })).toBeDefined()
      expect(await ui.find({ text: 'No agents in this session yet.' })).toBeDefined()
      expect(await ui.find({ text: 'Nothing to report.' })).toBeDefined()
      expect(await ui.find({ text: /Memory: nothing learned yet/ })).toBeDefined()
      await ui.unmount()
    })

    test(`a sub-agent row with its critter, then Finished and Clear finished on ${surface}`, async ($, on) => {
      world(on)
      await $.session.start(SESSION)
      const out = await spawn($, 'u1')
      const id = out.agentId as string

      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...pane() })
      expect(await ui.find({ text: 'Running · 1' })).toBeDefined()
      expect(await ui.find({ text: 'Find the bug' })).toBeDefined()
      expect(await ui.find({ text: new RegExp(`${critterOf(id).name} · Explore`) })).toBeDefined()
      expect(await ui.find({ text: 'Haiku 5.5' })).toBeDefined()
      expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeDefined()
      if (surface === 'terminal') expect((await ui.find({ key: `critter:${id}` }))?.props).toMatchObject({ columns: 12, rows: 6 })
      await ui.unmount()

      await $.classic.SubagentStop({ agent_id: id, agent_type: 'Explore' } as any)
      const done = await $.ui.mount({ plugin: PLUGIN, surface, ...pane() })
      expect(await done.find({ text: 'Finished · 1' })).toBeDefined()
      expect(await done.find({ key: `clear:${id}` })).toBeDefined()
      await done.press({ key: 'clear-finished' })
      expect(await done.find({ text: 'All agents cleared.' })).toBeDefined()
      await done.unmount()
    })
  }

  test('MCP and skill tiles in Status, with a red dot on a collapsed header after a failure', async ($, on) => {
    const w = world(on, {
      mcpTools: [
        { name: 'mcp__git__git_status', serverName: 'git' },
        { name: 'mcp__linear__authenticate', serverName: 'linear' },
      ],
    })
    await $.session.start(SESSION)
    await $.command.run(command(''))
    await $.tool.call({ tool: 'Skill', skill: 'plugin:thing' } as any)
    expect(w.opened).toHaveLength(1)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...pane() })
      expect(await ui.find({ text: 'MCP · 1 connected · 1 needs sign-in' })).toBeDefined()
      expect(await ui.find({ text: 'needs sign-in' })).toBeDefined()
      expect(await ui.find({ text: 'Skills · 1 loaded' })).toBeDefined()
      expect(await ui.find({ text: 'thing' })).toBeDefined()
      await ui.press({ key: 'status' })
      expect(await ui.find({ text: 'Skills · 1 loaded' })).toBeUndefined()
      await ui.press({ key: 'status' })
      await ui.unmount()
    }
    expect(w.store.get('statusOpen')).toBe(true)
  })
})

describe('the band', () => {
  test('hidden by default, and it keeps what is below it', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ key: 'band-off' })).toBeUndefined()
    expect(await ui.find({ text: 'below me' })).toBeDefined()
  })

  for (const surface of SURFACES) {
    test(`on: one line of headline, branch and memory above what is below, and Off turns it off on ${surface}`, ON, async ($, on) => {
      const w = world(on)
      await $.session.start(SESSION)
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
      expect(await ui.find({ text: 'Claude is idle · main · Memory: nothing learned yet' })).toBeDefined()
      expect(await ui.find({ text: 'below me' })).toBeDefined()
      await ui.press({ key: 'band-off' })
      expect(w.sets.at(-1)).toEqual({ key: 'agents-panel.showBand', value: false })
      expect(await ui.find({ key: 'band-off' })).toBeUndefined()
      expect(await ui.find({ text: 'below me' })).toBeDefined()
      await ui.unmount()
    })
  }

  test('a survey holds the band', ON, async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND, props: { ...BAND.props, hasSurvey: true } })
    expect(await ui.find({ key: 'band-off' })).toBeUndefined()
  })

  test('/agents-panel band on and off, and the toggle in the pane', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)

    const said = await $.command.run(command('band on'))
    expect(said.text).toBe('Agents band above the prompt: on.')
    expect(w.sets).toEqual([{ key: 'agents-panel.showBand', value: true }])
    const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'band-off' })).toBeDefined()
    await band.unmount()

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...pane() })
      expect(await ui.find({ text: 'Band: on' })).toBeDefined()
      await ui.press({ key: 'band-toggle' })
      expect(w.sets.at(-1)).toEqual({ key: 'agents-panel.showBand', value: false })
      expect(await ui.find({ text: 'Band: off' })).toBeDefined()
      await ui.press({ key: 'band-toggle' })
      await ui.unmount()
    }

    await $.command.run(command('band off'))
    const off = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
    expect(await off.find({ key: 'band-off' })).toBeUndefined()
  })

  test('if the setting is refused the choice is kept in the store', async ($, on) => {
    const w = world(on, { denyConfig: true })
    await $.session.start(SESSION)
    await $.command.run(command('band on'))
    expect(w.store.get('bandPick')).toEqual({ value: true, from: false })
    const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'band-off' })).toBeDefined()
  })
})

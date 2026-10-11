import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { MIN, PLUGIN, SESSION, SHOWN, T0, bandFor, command, other, textOf, worldOf } from './world'
import type { World } from './world'

const MINE = 's|f:/proj|me'

type Stored = { phase: string; files: string[]; updatedAt: number; folder: string; sid: string }

let current: World | undefined
const mine = async (_$?: unknown) => current?.store.get(MINE) as Stored | undefined
const track = (world: World): World => {
  current = world
  return world
}

const edit = (file: string, tool: 'Edit' | 'Write' = 'Edit') =>
  tool === 'Edit'
    ? ({ tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b' } as const)
    : ({ tool: 'Write', file_path: file, content: 'x' } as const)

describe('this session\'s entry', () => {
  test('the start writes an idle entry under the folder key, with no file contents', async ($, on) => {
    track(worldOf(on))
    await $.session.start(SESSION)

    const entry = await mine($)
    expect(entry).toEqual({ sid: 'me', folder: 'f:/proj', phase: 'idle', updatedAt: T0, files: [] })
  })

  test('phase follows the hook events: working, waiting on permission, working, idle, done', async ($, on) => {
    track(worldOf(on))
    await $.session.start(SESSION)

    await $.turn.start({ text: 'go', turnId: 't1' })
    expect((await mine($))?.phase).toBe('working')

    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })
    expect((await mine($))?.phase).toBe('waiting')

    await $.classic.PostToolUse({ tool_name: 'Bash', tool_input: {}, tool_response: {}, tool_use_id: 'u1' } as never)
    expect((await mine($))?.phase).toBe('working')

    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't1' })
    expect((await mine($))?.phase).toBe('idle')

    await $.session.end({ reason: 'prompt_input_exit', sessionId: 'me', resume: {} as never })
    expect((await mine($))?.phase).toBe('done')
  })

  test('a notification that asks for permission also means waiting', async ($, on) => {
    track(worldOf(on))
    await $.session.start(SESSION)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' })
    expect((await mine($))?.phase).toBe('waiting')
  })

  test('a subagent turn ending does not make the session idle', async ($, on) => {
    track(worldOf(on))
    await $.session.start(SESSION)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't2', agentId: 'sub1' })
    expect((await mine($))?.phase).toBe('working')
  })
})

describe('edited paths', () => {
  test('Edit, Write and NotebookEdit calls are recorded, other tools are not, and every call passes on unchanged', async ($, on) => {
    const world = track(worldOf(on))
    await $.session.start(SESSION)

    const ran = await $.tool.call(edit('F:\\Proj\\src\\a.ts'))
    expect(ran).toMatchObject({ result: 'ok', text: 'ok' })
    await $.tool.call(edit('F:/Proj/b.ts', 'Write'))
    await $.tool.call({ tool: 'NotebookEdit', notebook_path: 'F:/Proj/n.ipynb', new_source: 'x' })
    await $.tool.call({ tool: 'Read', file_path: 'F:/Proj/read-only.ts' })

    expect((await mine($))?.files).toEqual(['F:/Proj/src/a.ts', 'F:/Proj/b.ts', 'F:/Proj/n.ipynb'])
    expect(world.toolCalls).toHaveLength(4)
    expect(world.toolCalls[0]).toMatchObject({ tool: 'Edit', file_path: 'F:\\Proj\\src\\a.ts', old_string: 'a', new_string: 'b' })
  })

  test('a refused or failed edit is not recorded', async ($, on) => {
    track(
      worldOf(on, { answer: e => (e.tool === 'Edit' ? { deny: 'no' } : { result: 'x', text: 'x', isError: true }) }),
    )
    await $.session.start(SESSION)

    await $.tool.call(edit('/proj/denied.ts'))
    await $.tool.call(edit('/proj/failed.ts', 'Write'))
    expect((await mine($))?.files).toEqual([])
  })

  test('only the 50 most recent paths are stored', async ($, on) => {
    track(worldOf(on))
    await $.session.start(SESSION)
    for (let i = 0; i < 55; i++) await $.tool.call(edit(`F:/Proj/f${i}.ts`))

    const files = (await mine($))?.files ?? []
    expect(files).toHaveLength(50)
    expect(files[0]).toBe('F:/Proj/f5.ts')
    expect(files[49]).toBe('F:/Proj/f54.ts')
  })
})

describe('the toast', () => {
  const entries = Object.fromEntries([other('peer', { files: ['F:/Proj/Shared.ts', 'F:/Proj/x.ts'] })])

  test('warns once per file when another live session already edited it, and never blocks the edit', async ($, on) => {
    const world = worldOf(on, { entries })
    await $.session.start(SESSION)

    const first = await $.tool.call(edit('f:/proj/shared.ts'))
    const second = await $.tool.call(edit('F:/Proj/Shared.ts', 'Write'))
    await $.tool.call(edit('F:/Proj/x.ts'))
    await $.tool.call(edit('F:/Proj/own.ts'))

    expect(first).toMatchObject({ result: 'ok' })
    expect(second).toMatchObject({ result: 'ok' })
    expect(world.toasts).toEqual([
      'Another session in this folder already edited shared.ts.',
      'Another session in this folder already edited x.ts.',
    ])
  })

  test('no toast for an other session that is done or has gone quiet for 30 minutes', async ($, on) => {
    const world = worldOf(on, {
      entries: Object.fromEntries([
        other('ended', { phase: 'done', files: ['F:/Proj/a.ts'] }),
        other('quiet', { updatedAt: T0 - 31 * MIN, files: ['F:/Proj/a.ts'] }),
      ]),
    })
    await $.session.start(SESSION)
    await $.tool.call(edit('F:/Proj/a.ts'))
    expect(world.toasts).toEqual([])
  })

  test('no toast for a session in a subfolder, which is its own folder', async ($, on) => {
    const world = worldOf(on, { entries: Object.fromEntries([other('sub', { files: ['F:/Proj/a.ts'] }, 'f:/proj/sub')]) })
    await $.session.start(SESSION)
    await $.tool.call(edit('F:/Proj/a.ts'))
    expect(world.toasts).toEqual([])
  })

  test('a folder written with other case or backslashes is the same folder', async ($, on) => {
    const world = worldOf(on, { cwd: 'f:\\PROJ\\', entries })
    await $.session.start(SESSION)
    await $.tool.call(edit('F:/Proj/x.ts'))
    expect(world.toasts).toHaveLength(1)
  })
})

describe('the band', () => {
  const peers = (n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => other(`p${i}`, { updatedAt: T0 - i * 1000, files: [`F:/Proj/f${i}.ts`] })),
    )

  const lines = async ($: Engine, surface: 'terminal' | 'desktop') => {
    const ui = await $.ui.mount({ plugin: PLUGIN, ...bandFor(surface) })
    const found = await ui.findAll({ type: 'Text', text: /session/ })
    await ui.unmount()
    return found.map(f => f.text)
  }

  for (const [count, shown] of [[0, 0], [1, 1], [3, 3], [4, 4]] as const) {
    test(`with ${count} other sessions the band has ${shown} lines on the terminal and the desktop`, SHOWN, async ($, on) => {
      worldOf(on, { entries: peers(count) })
      await $.session.start(SESSION)

      for (const surface of ['terminal', 'desktop'] as const) {
        const got = await lines($, surface)
        expect(got).toHaveLength(shown)
        if (count >= 1) expect(got[0]).toBe('Other session: working \u2014 editing f0.ts (1 file)')
        if (count === 4) expect(got[3]).toBe('+1 more session in this folder')
      }
    })
  }

  test('a survey holds the band, so nothing is added', SHOWN, async ($, on) => {
    worldOf(on, { entries: peers(1) })
    await $.session.start(SESSION)
    const tree = await $.ui.render({ ...bandFor('terminal'), props: { ...bandFor('terminal').props, hasSurvey: true } })
    expect(textOf(tree)).toEqual([])
  })

  test('the band keeps what is below it in the same column', SHOWN, async ($, on) => {
    worldOf(on, { entries: peers(1), below: 'from another mod' })
    await $.session.start(SESSION)
    const tree = await $.ui.render(bandFor('terminal'))
    expect(textOf(tree)).toEqual(['Other session: working \u2014 editing f0.ts (1 file)', 'from another mod'])
  })

  test('a session drops out of the band 30 minutes after its last update, picked up by the refresh timer', SHOWN, async ($, on) => {
    const { clock } = worldOf(on, { entries: Object.fromEntries([other('p', { updatedAt: T0 - 28 * MIN })]) })
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(bandFor('terminal')))).toHaveLength(1)

    await clock.advance(3 * MIN)
    expect(textOf(await $.ui.render(bandFor('terminal')))).toEqual([])
  })

  test('a session that ends leaves the band at the next refresh', SHOWN, async ($, on) => {
    const { clock, store } = worldOf(on, { entries: peers(1) })
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(bandFor('terminal')))).toHaveLength(1)

    store.set('s|f:/proj|p0', { sid: 'p0', folder: 'f:/proj', phase: 'done', updatedAt: T0, files: [] })
    await clock.advance(30_000)
    expect(textOf(await $.ui.render(bandFor('terminal')))).toEqual([])
  })
})


describe('the on and off switch', () => {
  const peer = Object.fromEntries([other('p0', { files: ['F:/Proj/f0.ts'] })])
  const LINE = 'Other session: working — editing f0.ts (1 file)'

  test('the band starts hidden, and the toast still warns', async ($, on) => {
    const world = worldOf(on, { entries: peer })
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(bandFor('terminal')))).toEqual([])

    await $.tool.call(edit('F:/Proj/f0.ts'))
    expect(world.toasts).toHaveLength(1)
  })

  test('the Off button on the band turns it off through the setting, on both surfaces', async ($, on) => {
    const world = worldOf(on, { entries: peer })
    await $.session.start(SESSION)

    for (const surface of ['terminal', 'desktop'] as const) {
      await $.command.run(command('band on'))
      const ui = await $.ui.mount({ plugin: PLUGIN, ...bandFor(surface) })
      expect(await ui.find({ key: 'band-off' })).toBeDefined()
      await ui.press({ key: 'band-off' })
      expect(world.configSets.at(-1)).toEqual({ key: 'same-folder-tracker.showBand', value: false })
      expect(textOf(await $.ui.render(bandFor(surface)))).toEqual([])
      await ui.unmount()
    }
  })

  test('/folder-tracker band on shows the band and band off hides it', async ($, on) => {
    const world = worldOf(on, { entries: peer })
    await $.session.start(SESSION)
    expect(world.commands).toEqual(['folder-tracker'])

    const on1 = await $.command.run(command('band on'))
    expect(on1).toMatchObject({ text: 'The line above the prompt is on.' })
    expect(world.configSets).toEqual([{ key: 'same-folder-tracker.showBand', value: true }])
    expect(textOf(await $.ui.render(bandFor('terminal')))).toEqual([LINE])

    await $.command.run(command('band off'))
    expect(textOf(await $.ui.render(bandFor('terminal')))).toEqual([])
  })

  test('with no argument the command says whether the band is on', async ($, on) => {
    worldOf(on)
    await $.session.start(SESSION)
    const said = await $.command.run(command(''))
    expect(JSON.stringify(said)).toContain('The line above the prompt is off.')
  })

  test('if the engine refuses the setting, the choice is kept in the store', async ($, on) => {
    const world = worldOf(on, { entries: peer, denyConfig: true })
    await $.session.start(SESSION)

    await $.command.run(command('band on'))
    expect(world.store.get('showBand')).toBe(true)
    expect(textOf(await $.ui.render(bandFor('terminal')))).toEqual([LINE])
  })

  test('a choice kept in the store is honoured by a freshly loaded copy', async ($, on) => {
    worldOf(on, { entries: { ...peer, showBand: true } })
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(bandFor('terminal')))).toEqual([LINE])
  })
})

describe('housekeeping', () => {
  test('a day-old entry is removed at the start, and a fresh one of another session is left alone', async ($, on) => {
    const { store } = worldOf(on, {
      entries: Object.fromEntries([other('dead', { updatedAt: T0 - 25 * 60 * MIN }), other('live', { updatedAt: T0 - MIN })]),
    })
    await $.session.start(SESSION)

    expect(store.has('s|f:/proj|dead')).toBe(false)
    expect(store.has('s|f:/proj|live')).toBe(true)
  })
})

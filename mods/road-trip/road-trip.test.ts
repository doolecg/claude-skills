import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PROPS = {
  title: 'Road Trip',
  isFocused: true,
  bodyColumns: 100,
  placement: 'inline' as const,
  scroll: { offset: 0, bodyRows: 28 },
  view: {},
}

const stub = (on: On, log: string[]): void => {
  on('ui.open', () => {
    log.push('open')
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    log.push(`close:${e.id}`)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: {} }))
  on('command.register', () => ({ value: { command: 'roadtrip' } }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: 'ok' }))
}

const complete = {
  answer: 'done',
  durationMs: 10,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
}

test('/roadtrip opens the pane, /roadtrip off closes it and refuses until /roadtrip on', async ($, on) => {
  const log: string[] = []
  stub(on, log)
  mock.store(on)
  mock.clock(on)

  const first = await $.command.run({ command: 'roadtrip' })
  expect(first?.text).toContain('open')
  expect(log).toContain('open')

  const off = await $.command.run({ command: 'roadtrip', args: 'off' })
  expect(off?.text).toContain('off')
  expect(log).toContain('close:road-trip')

  log.length = 0
  const refused = await $.command.run({ command: 'roadtrip' })
  expect(refused?.text).toContain('/roadtrip on')
  expect(log).not.toContain('open')

  const back = await $.command.run({ command: 'roadtrip', args: 'on' })
  expect(back?.text).toContain('on')
  expect(log).toContain('open')
})

test('turn.complete shows the Arrived buttons and turn.start resumes', async ($, on) => {
  const log: string[] = []
  stub(on, log)
  mock.store(on)
  mock.clock(on)
  await $.command.run({ command: 'roadtrip' })

  const view = await $.ui.mount({ plugin: 'road-trip', surface: 'terminal', component: 'Pane', props: PROPS, requestId: 'road-trip' })
  expect(await view.find({ type: 'Raster' })).toBeDefined()
  expect(await view.find({ key: 'pause' })).toBeDefined()
  expect(await view.find({ key: 'keep' })).toBeUndefined()

  await $.turn.complete({ ...complete, agentId: 'sub-1' })
  await view.redraw()
  expect(await view.find({ key: 'keep' })).toBeUndefined()

  await $.turn.complete(complete)
  await view.redraw()
  expect(await view.find({ key: 'keep' })).toBeDefined()
  expect(await view.find({ key: 'close' })).toBeDefined()

  await $.turn.start({ text: 'again', turnId: 't2' })
  await view.redraw()
  expect(await view.find({ key: 'keep' })).toBeUndefined()
  expect(await view.find({ key: 'pause' })).toBeDefined()
})

test('the pane draws on both surfaces and tolerates a broken saved profile', async ($, on) => {
  const log: string[] = []
  stub(on, log)
  mock.store(on, { profile: { bank: -9, owned: ['nope'], car: 'ghost', xp: 'x' }, retro: true })
  mock.clock(on)
  await $.command.run({ command: 'roadtrip' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const view = await $.ui.mount({ plugin: 'road-trip', surface, component: 'Pane', props: PROPS, requestId: 'road-trip' })
    if (surface === 'terminal') {
      expect(await view.find({ type: 'Raster' })).toBeDefined()
    } else {
      expect(await view.find({ text: /plays in the terminal/ })).toBeDefined()
    }
    await view.unmount()
  }

  const small = await $.ui.mount({
    plugin: 'road-trip',
    surface: 'terminal',
    component: 'Pane',
    props: { ...PROPS, bodyColumns: 30 },
    requestId: 'road-trip',
  })
  expect(await small.find({ text: /a little bigger/ })).toBeDefined()
})

test('a Claude tool call still runs normally while the game is open', async ($, on) => {
  const log: string[] = []
  stub(on, log)
  mock.store(on)
  mock.clock(on)
  await $.command.run({ command: 'roadtrip' })
  const done = await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'a', status: 'completed', activeForm: 'a' }], tool_use_id: 'u1' })
  expect(done).toBeDefined()
})

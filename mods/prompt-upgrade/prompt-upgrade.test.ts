import { test, expect, mock } from 'claude-code/testing'

const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const QUESTIONS = JSON.stringify({
  questions: [
    { q: 'Who is it for?', options: ['Me', 'Customers', 'A team'] },
    { q: 'Which format?', options: ['Short list', 'Full page'] },
  ],
})
const REWRITE = JSON.stringify({
  prompt: 'Write a one-page website for customers with a clear goal and a short list of services.',
  added: ['Said who it is for', 'Asked for a short list'],
})
const PANE = {
  title: 'Prompt Upgrade',
  isFocused: true,
  bodyColumns: 90,
  placement: 'dock',
  scroll: { bodyRows: 40 },
  view: {},
} as any
const SURFACES = ['terminal', 'desktop'] as const

function world(on: any, replies: string[]) {
  const clock = mock.clock(on)
  mock.store(on)
  const seen = { models: [] as any[], submitted: [] as any[], filled: [] as string[], closed: 0 }
  on('model.complete', (_$: any, e: any) => {
    seen.models.push(e)
    const text = replies.shift()
    return {
      value:
        text === undefined
          ? { isAnswered: false, reason: 'api-error', status: 500, error: 'unknown', usage }
          : { isAnswered: true, text, usage },
    }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => {
    seen.closed += 1
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', (_$: any, e: any) => {
    seen.submitted.push(e)
    return { text: e.text }
  })
  on('prompt.fill', (_$: any, e: any) => {
    seen.filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  return { clock, seen }
}

const typed = (text: string, extra: object = {}) => ({ text, wait: false, origin: { kind: 'composer' }, ...extra }) as any
const cmd = (args: string) =>
  ({ command: 'better', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } }) as any
const mountPane = ($: any, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'prompt-upgrade', surface, component: 'Pane', requestId: 'prompt-upgrade', props: PANE })

test('/better replies at once and starts reading the questions', async ($, on) => {
  const { clock, seen } = world(on, [QUESTIONS])
  const out = await $.command.run(cmd('make me a website'))
  expect(out.text).toContain('Upgrading')
  await clock.settle()
  expect(seen.models).toHaveLength(1)
  expect(seen.models[0].prompt).toContain('make me a website')
})

test('full flow from /better to Run, on every surface', async ($, on) => {
  const { clock, seen } = world(on, [QUESTIONS, REWRITE, QUESTIONS, REWRITE])
  for (const surface of SURFACES) {
    await $.command.run(cmd('make me a website'))
    await clock.settle()
    const ui = await mountPane($, surface)
    expect(await ui.find({ key: 'q0o1' })).toBeDefined()
    expect(await ui.find({ key: 'skip-all' })).toBeDefined()
    await ui.press({ key: 'q0o1' })
    await ui.press({ key: 'q1skip' })
    await clock.settle()
    const last = seen.models[seen.models.length - 1]
    expect(last.prompt).toContain('Who is it for? -> Customers')
    expect(last.prompt).not.toContain('Which format?')
    expect(await ui.find({ type: 'Text', text: 'one-page website' })).toBeDefined()
    await ui.press({ key: 'run' })
    const sent = seen.submitted[seen.submitted.length - 1]
    expect(sent.text).toContain('one-page website')
    expect(sent.origin.kind).toBe('plugin')
    await ui.unmount()
  }
  expect(seen.closed).toBeGreaterThan(1)
})

test('Skip the rest goes straight to the rewrite; no questions skips to rewrite', async ($, on) => {
  const { clock, seen } = world(on, [QUESTIONS, REWRITE, '{"questions":[]}', REWRITE])
  await $.command.run(cmd('plan my week'))
  await clock.settle()
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'skip-all' })
  await clock.settle()
  expect(await ui.find({ key: 'run' })).toBeDefined()
  await ui.unmount()
  await $.command.run(cmd('plan my month'))
  await clock.settle()
  expect(seen.models).toHaveLength(4)
})

test('Cancel puts the original prompt back', async ($, on) => {
  const { clock, seen } = world(on, [QUESTIONS])
  await $.command.run(cmd('make me a website'))
  await clock.settle()
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: 'cancel' })
  expect(seen.filled).toEqual(['make me a website'])
  expect(seen.closed).toBe(1)
  expect(seen.submitted).toHaveLength(0)
})

test('a failed model call shows a calm card and Send my original works', async ($, on) => {
  const { clock, seen } = world(on, [])
  await $.command.run(cmd('make me a website'))
  await clock.settle()
  const ui = await mountPane($, 'terminal')
  expect(await ui.find({ type: 'Text', text: 'Your prompt is safe' })).toBeDefined()
  expect(await ui.find({ key: 'retry' })).toBeDefined()
  await ui.press({ key: 'send-original' })
  expect(seen.submitted[0].text).toBe('make me a website')
})

test('automatic mode: what is intercepted and what passes through', async ($, on) => {
  const { clock, seen } = world(on, [QUESTIONS, QUESTIONS, QUESTIONS])
  const off = await $.prompt.submit(typed('make me a website for my shop'))
  expect(off.drop).toBeUndefined()
  expect(seen.submitted).toHaveLength(1)

  const turned = await $.command.run(cmd('on'))
  expect(turned.text).toContain('Automatic mode is on')

  const taken = await $.prompt.submit(typed('make me a website for my shop'))
  expect(taken.drop).toBeDefined()
  await clock.settle()
  expect(seen.models).toHaveLength(1)

  const before = seen.submitted.length
  for (const e of [
    typed('/compact'),
    typed('yes'),
    typed('keep going'),
    typed('look at this picture please', { attachments: [{ type: 'image' }] }),
    typed('and also do the footer', { turnId: 't1' }),
    typed('something from a plugin here', { origin: { kind: 'plugin', name: 'other' } }),
  ]) {
    const res = await $.prompt.submit(e)
    expect(res.drop).toBeUndefined()
  }
  expect(seen.submitted.length).toBe(before + 6)
  expect(seen.models).toHaveLength(1)

  const stripped = await $.prompt.submit(typed('> send this exactly as it is'))
  expect(stripped.drop).toBeUndefined()
  expect(seen.submitted[seen.submitted.length - 1].text).toBe('send this exactly as it is')

  const offAgain = await $.command.run(cmd('off'))
  expect(offAgain.text).toContain('Automatic mode is off')
  const after = await $.prompt.submit(typed('make me another website please'))
  expect(after.drop).toBeUndefined()
})

test('the upgraded prompt is sent by the mod and never loops back', async ($, on) => {
  const { clock, seen } = world(on, [QUESTIONS, REWRITE])
  await $.command.run(cmd('on'))
  await $.prompt.submit(typed('make me a website for my shop'))
  await clock.settle()
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'skip-all' })
  await clock.settle()
  await ui.press({ key: 'run' })
  expect(seen.models).toHaveLength(2)
  expect(seen.submitted).toHaveLength(1)
})

test('history lists upgrades and reopens one at its review', async ($, on) => {
  const { clock } = world(on, [QUESTIONS, REWRITE])
  await $.command.run(cmd('make me a website'))
  await clock.settle()
  let ui = await mountPane($, 'terminal')
  await ui.press({ key: 'skip-all' })
  await clock.settle()
  await ui.press({ key: 'cancel' })
  await ui.unmount()
  await $.command.run(cmd('history'))
  await clock.settle()
  ui = await mountPane($, 'desktop')
  expect(await ui.find({ key: 'h0' })).toBeDefined()
  await ui.press({ key: 'h0' })
  expect(await ui.find({ key: 'run' })).toBeDefined()
})

test('draws at narrow and wide widths on both surfaces', async ($, on) => {
  const { clock } = world(on, [QUESTIONS, REWRITE])
  await $.command.run(cmd('make me a website'))
  await clock.settle()
  for (const surface of SURFACES) {
    for (const bodyColumns of [30, 60, 140]) {
      const ui = await $.ui.mount({
        plugin: 'prompt-upgrade',
        surface,
        component: 'Pane',
        requestId: 'prompt-upgrade',
        props: { ...PANE, bodyColumns },
        viewport: { columns: bodyColumns, rows: 40 },
      })
      expect(await ui.find({ key: 'q0o0' })).toBeDefined()
      await ui.unmount()
    }
  }
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'skip-all' })
  await clock.settle()
  await ui.unmount()
  for (const surface of SURFACES) {
    for (const bodyColumns of [30, 60, 140]) {
      const wide = await $.ui.mount({
        plugin: 'prompt-upgrade',
        surface,
        component: 'Pane',
        requestId: 'prompt-upgrade',
        props: { ...PANE, bodyColumns },
        viewport: { columns: bodyColumns, rows: 40 },
      })
      expect(await wide.find({ key: 'run' })).toBeDefined()
      await wide.unmount()
    }
  }
})

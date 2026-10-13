import { expect, mock, test } from 'claude-code/testing'

import { addTask, dayKey } from './hooks/logic'

const NOW = new Date(2026, 9, 13, 12, 0, 0).getTime()
const TODAY = dayKey(NOW)

const props = (bodyColumns: number) => ({
  title: 'Work report',
  isFocused: false,
  bodyColumns,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
})

const seeded = () => {
  let days = {}
  days = addTask(days, TODAY, 'emails', 'claude-opus-4-1-20250805')
  days = addTask(days, TODAY, 'research', 'claude-sonnet-4-5')
  days = addTask(days, '2026-10-12', 'documents', 'claude-sonnet-4-5')
  return days
}

test('empty state on every surface', async ($, on) => {
  mock.store(on, {})
  mock.clock(on, { now: NOW })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'work-report',
      surface,
      component: 'Pane',
      requestId: 'work-report',
      props: props(60),
    })
    expect(await ui.find({ type: 'Text', text: /Nothing finished yet today/ })).toBeDefined()
    await ui.unmount()
  }
})

test('each tab draws its own title and chart, wide and narrow', async ($, on) => {
  mock.store(on, { days: seeded() })
  mock.clock(on, { now: NOW })
  const titles = { week: 'LAST 7 DAYS', month: 'LAST 30 DAYS', year: 'THIS YEAR', today: 'TODAY' } as const
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const columns of [90, 30]) {
      const ui = await $.ui.mount({
        plugin: 'work-report',
        surface,
        component: 'Pane',
        requestId: 'work-report',
        props: props(columns),
      })
      for (const tab of ['today', 'week', 'month', 'year'] as const) {
        await ui.press({ key: `tab-${tab}` })
        expect(await ui.find({ type: 'Text', text: titles[tab] })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /Hours and dollars are estimates/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /Tasks per (day|month)/i })).toBeDefined()
      }
      await ui.unmount()
    }
  }
})

test('records only finished answers to typed prompts', async ($, on) => {
  mock.store(on, {})
  mock.clock(on, { now: NOW })
  on('prompt.submit', (_$, e) => ({ text: e.text, origin: e.origin }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
  await $.tool.call({ tool: 'WebSearch', query: 'x' } as never)
  await $.turn.complete({ answer: 'hi', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer', usage: { model: 'claude-opus-4-1-20250805' } } as never)
  await $.prompt.submit({ text: 'ping', origin: { kind: 'task-notification' }, wait: false })
  await $.turn.complete({ answer: 'x', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' } as never)
  await $.prompt.submit({ text: 'again', origin: { kind: 'composer' }, wait: false })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: true, turnId: 't3', reason: 'aborted' } as never)
  const ui = await $.ui.mount({
    plugin: 'work-report',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 80, scroll: { offset: 0, bodyRows: 5 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: /1 task today/ })).toBeDefined()
  await ui.unmount()
})

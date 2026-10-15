import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { addTask, allDone, planStep, summary, tasksFromList, tasksFromTodos, updateTask, withTasks, EMPTY_CHECKLIST } from '../hooks/clean-logic'

const SURFACES = ['terminal', 'desktop'] as const

const TODOS = [
  { content: 'Read your brand notes', status: 'completed', activeForm: 'Reading' },
  { content: 'Build the pricing section', status: 'in_progress', activeForm: 'Building' },
  { content: 'Add the contact form', status: 'pending', activeForm: 'Adding' },
  { content: 'Polish the footer', status: 'pending', activeForm: 'Polishing' },
]
const ALL_DONE = TODOS.map(t => ({ ...t, status: 'completed' }))

function world(on: On) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as any)
  on('settings.read', () => ({ value: { theme: 'dark' } }) as any)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as any)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.toast', () => ({ value: undefined }) as any)
  // The engine's own rows: a plain line for a tool the mod leaves alone.
  on('ui.render', { component: ['ToolUse', 'ToolResult'] }, (($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return (globalThis as any).h(Text, {}, 'vanilla row')
  }) as any)
  on('tool.call', { tool: ['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'Bash'] }, (_$: any, e: any) =>
    e.tool === 'TaskCreate' ? ({ result: { task: { id: e.tool_use_id, subject: e.subject } }, text: 'ok' } as any) : ({ result: 'ok', text: 'ok' } as any),
  )
  return clock
}

async function start($: any) {
  await $.session.start({ cwd: '.' })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
}

async function todoCall($: any, id: string, todos: unknown[]) {
  await $.tool.call({ tool: 'TodoWrite', tool_use_id: id, todos } as any)
}

async function row($: any, surface: 'terminal' | 'desktop', id: string, todos: unknown[], tool = 'TodoWrite', component = 'ToolUse') {
  const ui = await $.ui.mount({
    plugin: 'clean-view',
    surface,
    component,
    props: { tool_use_id: id, tool, input: { todos }, isRunning: false, isErrored: false, isInterrupted: false, output: {}, bodyColumns: 100 },
  } as any)
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text))
  return { ui, all: texts.join('\n') }
}

test('a TodoWrite row draws the header, the main bar and one line per item, on both surfaces', async ($, on) => {
  world(on)
  await start($)
  await todoCall($, 'u1', TODOS)
  for (const surface of SURFACES) {
    const { ui, all } = await row($, surface, 'u1', TODOS)
    expect(all).toContain('To-do')
    expect(all).toContain('1 of 4 done · 25%')
    expect(all).toMatch(/✓\n?Read your brand notes/)
    expect(all).toMatch(/▶\n?Build the pricing section/)
    expect(all).toMatch(/○\n?Add the contact form/)
    expect(all).toMatch(/○\n?Polish the footer/)
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Raster', key: 'main-bar' })).toBeDefined()
      expect((await ui.findAll({ type: 'Raster' })).length).toBe(5)
    } else {
      expect(await ui.find({ type: 'Raster' })).toBeUndefined()
      expect((await ui.findAll({ type: 'Svg' })).length).toBe(5)
    }
    await ui.unmount()
  }
})

test('desktop bars are drawn at their real pixel width: 360 for the main bar, 160 for each item', async ($, on) => {
  world(on)
  await start($)
  await todoCall($, 'u1', TODOS)
  const { ui } = await row($, 'desktop', 'u1', TODOS)
  const svgs = await ui.findAll({ type: 'Svg' })
  const widths = svgs.map((s: any) => [s.props.width, /<svg[^>]* width="(\d+)"/.exec(String(s.props.source))?.[1]])
  expect(widths[0]).toEqual([360, '360'])
  for (const w of widths.slice(1)) expect(w).toEqual([160, '160'])
  await ui.unmount()
})

test('in-progress bars move with the frame clock; done and pending bars stay still', async ($, on) => {
  const clock = world(on)
  await start($)
  await todoCall($, 'u1', TODOS)
  const sources = async () => {
    const { ui } = await row($, 'desktop', 'u1', TODOS)
    const s = (await ui.findAll({ type: 'Svg' })).map((x: any) => String(x.props.source))
    await ui.unmount()
    return s
  }
  const before = await sources()
  await clock.advance(1_000)
  const after = await sources()
  expect(after[2]).not.toBe(before[2])
  expect(after[1]).toBe(before[1])
  expect(after[3]).toBe(before[3])
  expect(after[4]).toBe(before[4])
})

test('when every item is done the header says All done and every bar is still', async ($, on) => {
  const clock = world(on)
  await start($)
  await todoCall($, 'u1', ALL_DONE)
  for (const surface of SURFACES) {
    const { ui, all } = await row($, surface, 'u1', ALL_DONE)
    expect(all).toContain('All done · 4 of 4')
    expect(all).not.toContain('of 4 done')
    await ui.unmount()
  }
  const grab = async () => {
    const { ui } = await row($, 'desktop', 'u1', ALL_DONE)
    const s = (await ui.findAll({ type: 'Svg' })).map((x: any) => String(x.props.source))
    await ui.unmount()
    return s
  }
  const before = await grab()
  await clock.advance(2_000)
  expect(await grab()).toEqual(before)
})

test('the to-do result row is blanked so the list shows once', async ($, on) => {
  world(on)
  await start($)
  await todoCall($, 'u1', TODOS)
  const { ui, all } = await row($, 'terminal', 'u1', TODOS, 'TodoWrite', 'ToolResult')
  expect(all).toBe('')
  await ui.unmount()
})

test('other tools keep their normal rows', async ($, on) => {
  world(on)
  await start($)
  const { ui, all } = await row($, 'terminal', 'u9', [], 'Bash')
  expect(all).toBe('vanilla row')
  await ui.unmount()
})

test('/simple off leaves the vanilla row, and /simple on brings the list back', async ($, on) => {
  world(on)
  await start($)
  await todoCall($, 'u1', TODOS)
  const off = await $.command.run({ command: 'simple', args: 'off' } as any)
  expect((off as any).text).toBe('Task View is off.')
  for (const surface of SURFACES) {
    const { ui, all } = await row($, surface, 'u1', TODOS)
    expect(all).toBe('vanilla row')
    await ui.unmount()
  }
  const blank = await row($, 'terminal', 'u1', TODOS, 'TodoWrite', 'ToolResult')
  expect(blank.all).toBe('vanilla row')
  await blank.ui.unmount()
  const on2 = await $.command.run({ command: 'simple', args: 'on' } as any)
  expect((on2 as any).text).toBe('Task View is on.')
  const { ui, all } = await row($, 'terminal', 'u1', TODOS)
  expect(all).toContain('Build the pricing section')
  await ui.unmount()
})

test('/doole_task-view flips Task View like /simple', async ($, on) => {
  world(on)
  await start($)
  const off = await $.command.run({ command: 'doole_task-view', args: '' } as any)
  expect((off as any).text).toBe('Task View is off.')
  const on2 = await $.command.run({ command: 'doole_task-view', args: '' } as any)
  expect((on2 as any).text).toBe('Task View is on.')
})

test('the checklist is published for the sidebar from the to-do list', async ($, on) => {
  world(on)
  const seen: any[] = []
  on('state.set', { plugin: 'clean-view', key: 'checklist' } as any, (async (_$: any, e: any, next: any) => {
    seen.push(e.value)
    return next(e)
  }) as any)
  await start($)
  await todoCall($, 'u1', TODOS)
  const cl = seen[seen.length - 1]
  expect(cl.phase).toBe('working')
  expect(cl.tasks.map((t: any) => [t.name, t.status])).toEqual([
    ['Read your brand notes', 'done'],
    ['Build the pricing section', 'active'],
    ['Add the contact form', 'upcoming'],
    ['Polish the footer', 'upcoming'],
  ])
  expect(typeof cl.startedAt).toBe('number')
  await todoCall($, 'u2', ALL_DONE)
  expect(seen[seen.length - 1].phase).toBe('done')
})

test('the Task tools keep a running list, and only the latest of their rows draws it', async ($, on) => {
  world(on)
  await start($)
  await $.tool.call({ tool: 'TaskCreate', tool_use_id: 'c1', subject: 'Write the intro', description: 'x' } as any)
  await $.tool.call({ tool: 'TaskCreate', tool_use_id: 'c2', subject: 'Check the links', description: 'x' } as any)
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'c3', taskId: 'c1', status: 'completed' } as any)
  const first = await row($, 'terminal', 'c1', [], 'TaskCreate')
  expect(first.all).toBe('')
  await first.ui.unmount()
  const last = await row($, 'terminal', 'c3', [], 'TaskUpdate')
  expect(last.all).toContain('Write the intro')
  expect(last.all).toContain('Check the links')
  expect(last.all).toContain('1 of 2 done')
  await last.ui.unmount()
})

test('the frame clock stops when nothing is in progress and when the turn ends', async ($, on) => {
  const clock = world(on)
  let ticks = 0
  on('state.set', { plugin: 'clean-view', key: 'tick' } as any, (async (_$: any, e: any, next: any) => {
    ticks += 1
    return next(e)
  }) as any)
  await start($)
  await todoCall($, 'u1', ALL_DONE)
  const idle = ticks
  await clock.advance(2_000)
  expect(ticks).toBe(idle)
  await todoCall($, 'u2', TODOS)
  const busy = ticks
  await clock.advance(1_000)
  expect(ticks).toBeGreaterThan(busy)
  await $.turn.complete({ reason: 'end_turn', answer: 'ok', turnId: 't1' } as any)
  const stopped = ticks
  await clock.advance(2_000)
  expect(ticks).toBe(stopped)
})

test('the to-do logic: lists parse, tasks add and update, and the summary counts', () => {
  const tasks = tasksFromTodos(TODOS)
  expect(summary(tasks)).toEqual({ done: 1, total: 4, percent: 25, isAllDone: false })
  expect(summary(tasksFromTodos(ALL_DONE)).isAllDone).toBe(true)
  expect(tasksFromTodos('nope')).toEqual([])
  const added = addTask(tasks, 'New thing', 'k9')
  expect(added.length).toBe(5)
  expect(updateTask(added, 'k9', 'completed', undefined).find(t => t.id === 'k9')?.status).toBe('done')
  expect(updateTask(added, 'k9', 'deleted', undefined).length).toBe(4)
  expect(tasksFromList({ tasks: [{ id: '1', subject: 'A', status: 'in_progress' }] })[0]).toMatchObject({ id: 'k1', status: 'active' })
  expect(withTasks(EMPTY_CHECKLIST, [], 5)).toEqual(EMPTY_CHECKLIST)
})

test("the desktop app's update_plan list is read: items set it, advance, done and start move it", () => {
  const items = [
    { content: 'Look at the code', status: 'in_progress' },
    { content: 'Make the change', status: 'pending' },
    { content: 'Run the tests', status: 'pending' },
  ]
  let tasks = planStep([], { items })
  expect(tasks.map(t => t.status)).toEqual(['active', 'upcoming', 'upcoming'])
  tasks = planStep(tasks, { advance: true })
  expect(tasks.map(t => t.status)).toEqual(['done', 'active', 'upcoming'])
  tasks = planStep(tasks, { done: [2], start: 3 })
  expect(tasks.map(t => t.status)).toEqual(['done', 'done', 'active'])
  tasks = planStep(tasks, { advance: true })
  expect(summary(tasks).isAllDone).toBe(true)
})


test("the app's wrap_up checks off the whole list", () => {
  const tasks = planStep([], { items: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'in_progress' }] })
  expect(summary(allDone(tasks)).isAllDone).toBe(true)
})

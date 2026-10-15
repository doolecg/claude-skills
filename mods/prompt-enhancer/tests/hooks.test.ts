import { expect, mock, test } from 'claude-code/testing'

const HOME = '/home/ann'
const ROOT = '/work/app'
const SURFACES = ['terminal', 'desktop'] as const

type World = {
  box: string
  files: Record<string, string>
  dirs: Record<string, Array<{ name: string; kind: string }>>
  exists: Set<string>
  hindsight: 'answers' | 'silent' | 'down'
  codegraph: 'installed' | 'missing'
  reply: { isAnswered: true; text: string } | { isAnswered: false; reason: string }
  typeWhileRunning?: string
  fillRefused?: boolean
}

const HINDSIGHT_CFG = JSON.stringify({ serverMode: 'self-hosted', apiUrl: 'http://hs.local:8888' })

function baseWorld(over: Partial<World> = {}): World {
  return {
    box: 'fix the login bug',
    files: {
      [`${HOME}/.hindsight/coding-agent.json`]: HINDSIGHT_CFG,
      [`${HOME}/.claude/soul.md`]: '# Me\n- Likes short answers',
      [`${HOME}/.claude/projects/-work-app/memory/MEMORY.md`]: '- [Cap](cap.md) - test cap',
      [`${HOME}/.claude/projects/-work-app/memory/cap.md`]: '---\ndescription: Stop after 3 test passes\n---\n',
      [`${HOME}/.claude/skills/debugging/SKILL.md`]: '---\nname: debugging\ndescription: Find and fix bugs in login code\n---\n',
    },
    dirs: { [`${HOME}/.claude/skills`]: [{ name: 'debugging', kind: 'dir' }] },
    exists: new Set([`${ROOT}/.codegraph`]),
    hindsight: 'answers',
    codegraph: 'installed',
    reply: { isAnswered: true, text: 'Fix the login bug.\n\nFiles to change: login (function) src/auth.ts:12\n\nSkills to load: debugging\n\nAsk me first about: nothing\n\nDone when: login works' },
    ...over,
  }
}

const USAGE = { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

// Stands in for the engine beneath the mod: the prompt box, files, git, CodeGraph, Hindsight and the model.
function engine(on: any, w: World) {
  const seen = { toasts: [] as string[], fills: [] as string[], prompts: [] as any[], fetched: [] as string[], argv: [] as string[][], reads: [] as string[] }
  mock.store(on)
  mock.env(on, { HOME })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('command.list', () => ({ value: [{ name: 'xlsx', description: 'Spreadsheets', source: 'plugin', plugin: 'docs' }, { name: 'help', description: 'Help', source: 'builtin' }] }))
  on('settings.read', () => ({ value: { enabledPlugins: {} } }))
  on('session.root', () => ({ value: ROOT }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'the login page hangs', toolUses: [] }] }))
  on('ui.toast', (_$: any, e: any) => (seen.toasts.push(e.text), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.read', () => ({ value: { text: w.box, cursor: w.box.length } }))
  on('prompt.fill', (_$: any, e: any) => {
    if (w.fillRefused) return { isFilled: false, refusal: 'dialog' }
    seen.fills.push(e.text)
    w.box = e.text
    return { isFilled: true }
  })
  // The kit hands paths over resolved for this machine (on Windows `F:\home\ann\...`): compare them POSIX-style.
  const norm = (p: unknown) => String(p).replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  on('fs.read', (_$: any, e: any) => {
    const path = norm(e.path)
    seen.reads.push(path)
    return path in w.files ? { value: w.files[path] } : { deny: 'no such file' }
  })
  on('fs.list', (_$: any, e: any) => (norm(e.path) in w.dirs ? { value: w.dirs[norm(e.path)] } : { deny: 'no such folder' }))
  on('fs.exists', (_$: any, e: any) => ({ value: w.exists.has(norm(e.path)) }))
  on('process.run', (_$: any, e: any) => {
    const argv = e.argv as string[]
    seen.argv.push(argv)
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === 'git' && argv.includes('--git-common-dir')) return ok(`${ROOT}/.git\n`)
    if (argv[0] === 'git' && argv.includes('--show-toplevel')) return ok(`${ROOT}\n`)
    if (argv[0] === 'git') return ok('## main\n M src/auth.ts\n')
    if (argv[0] === 'codegraph') {
      if (w.codegraph === 'missing') return { deny: 'not found' }
      return ok(JSON.stringify([{ node: { name: 'login', kind: 'function', filePath: 'src/auth.ts', startLine: 12 } }]))
    }
    return { deny: 'unexpected command' }
  })
  on('http.fetch', async (_$: any, e: any) => {
    seen.fetched.push(e.url)
    if (w.hindsight === 'down') return { deny: 'unreachable' }
    if (w.hindsight === 'silent') await new Promise(r => (globalThis as any).setTimeout(r, 400))
    const bank = decodeURIComponent(String(e.url).split('/banks/')[1]!.split('/')[0]!)
    const text = bank.startsWith('coding-agent::') ? 'login uses JWT cookies' : 'prefers plain words'
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ results: [{ text }] }) } }
  })
  on('model.complete', async (_$: any, e: any) => {
    seen.prompts.push(e)
    if (w.typeWhileRunning !== undefined) w.box = w.typeWhileRunning
    return { value: w.reply.isAnswered ? { ...w.reply, usage: USAGE } : { ...w.reply, usage: USAGE } }
  })
  on('ui.render', { component: 'SessionMode' }, ($: any, e: any) => (globalThis as any).h($.ui.resolve(e).Text, {}, 'status row'))
  return seen
}

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise(r => (globalThis as any).setTimeout(r, 20))
}

const start = ($: any) => $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
const mountRow = ($: any, surface: 'terminal' | 'desktop' | 'vscode' | 'mobile') =>
  $.ui.mount({ plugin: 'prompt-enhancer', surface, component: 'SessionMode', props: { modes: [] } })

for (const surface of SURFACES) {
  test(`${surface}: the button sits on the left, before the row beneath it`, async ($, on) => {
    engine(on, baseWorld())
    await start($)
    const row = await mountRow($, surface)
    expect(await row.find({ type: 'Text', text: 'status row' })).toBeDefined()
    expect(await row.find({ key: 'pe-enhance', text: 'Enhance Prompt' })).toBeDefined()
    const drawn = JSON.stringify(await row.drawn())
    expect(drawn.indexOf('pe-enhance')).toBeLessThan(drawn.indexOf('status row'))
    expect(await row.find({ key: 'pe-undo' })).toBeUndefined()
  })

  test(`${surface}: pressing it rewrites the box in place, and Undo puts the text back`, { options: { soulBank: 'soul' } }, async ($, on) => {
    const w = baseWorld()
    const seen = engine(on, w)
    await start($)
    const row = await mountRow($, surface)
    await row.press({ key: 'pe-enhance' })

    expect(seen.fills).toEqual([(w.reply as any).text])
    expect(w.box.startsWith('Fix the login bug.')).toBe(true)
    const ask = seen.prompts[0]
    expect(ask.model).toBe('haiku')
    expect(ask.effort).toBeUndefined()
    expect(ask.system.includes('Skills to load:')).toBe(true)
    expect(ask.prompt.includes('"""\nfix the login bug\n"""')).toBe(true)
    expect(ask.prompt.includes('login (function) src/auth.ts:12')).toBe(true)
    expect(ask.prompt.includes('- login uses JWT cookies')).toBe(true)
    expect(ask.prompt.includes('- Likes short answers')).toBe(true)
    expect(ask.prompt.includes('- prefers plain words')).toBe(true)
    expect(ask.prompt.includes('Git branch: main')).toBe(true)
    expect(ask.prompt.includes('Person: the login page hangs')).toBe(true)
    expect(ask.prompt.indexOf('- debugging:') < ask.prompt.indexOf('- xlsx:')).toBe(true)
    expect(ask.prompt.includes('- help:')).toBe(false)
    expect(seen.fetched.some(u => u.includes(encodeURIComponent('coding-agent::app')))).toBe(true)
    expect(seen.fetched.some(u => u.includes('/banks/soul/'))).toBe(true)
    expect(seen.toasts.at(-1)).toContain('ready to review')

    await row.press({ key: 'pe-undo' })
    expect(w.box).toBe('fix the login bug')
    expect(await row.find({ key: 'pe-undo' })).toBeUndefined()
  })
}

// The desktop row is native Buttons and plain Text: no pill caps (◖ ◗) and no box-drawing glyphs in any Text.
test('desktop: no Text draws a pill cap or box-drawing glyph, idle or after a run', { options: { soulBank: 'soul' } }, async ($, on) => {
  engine(on, baseWorld())
  await start($)
  const row = await mountRow($, 'desktop')
  const glyph = /[◖◗─-╿]/
  const texts = async (): Promise<string[]> => (await row.findAll({ type: 'Text' })).map((t: { text?: unknown }) => String(t.text ?? ''))
  expect((await texts()).length).toBeGreaterThan(0)
  expect((await texts()).some((t: string) => glyph.test(t))).toBe(false)
  await row.press({ key: 'pe-enhance' })
  expect(await row.find({ type: 'Text', text: '3 recalls' })).toBeDefined()
  expect((await texts()).some((t: string) => glyph.test(t))).toBe(false)
})

for (const surface of ['vscode', 'mobile'] as const) {
  test(`${surface}: the row is left to the hooks beneath, with no Enhance button`, async ($, on) => {
    engine(on, baseWorld())
    await start($)
    const row = await mountRow($, surface)
    expect(await row.find({ type: 'Text', text: 'status row' })).toBeDefined()
    expect(await row.find({ key: 'pe-enhance' })).toBeUndefined()
  })
}

test('the model, effort and Soul Bank settings are used', { options: { model: 'sonnet', effort: 'high', soulBank: 'my-soul' } }, async ($, on) => {
  const seen = engine(on, baseWorld())
  await start($)
  const row = await mountRow($, 'terminal')
  await row.press({ key: 'pe-enhance' })
  expect(seen.prompts[0].model).toBe('sonnet')
  expect(seen.prompts[0].effort).toBe('high')
  expect(seen.fetched.some(u => u.includes('/banks/my-soul/'))).toBe(true)
})

test('model "session" uses the session\'s model', { options: { model: 'session' } }, async ($, on) => {
  const seen = engine(on, baseWorld())
  await start($)
  await (await mountRow($, 'terminal')).press({ key: 'pe-enhance' })
  expect(seen.prompts[0].model).toBe('claude-opus-5-5')
})

test('an empty box asks for a prompt and calls no model', async ($, on) => {
  const seen = engine(on, baseWorld({ box: '   ' }))
  await start($)
  await (await mountRow($, 'terminal')).press({ key: 'pe-enhance' })
  expect(seen.prompts).toHaveLength(0)
  expect(seen.fills).toHaveLength(0)
  expect(seen.toasts.at(-1)).toContain('type your prompt in the box first')
})

test('a model that does not answer leaves the box as it was', async ($, on) => {
  const w = baseWorld({ reply: { isAnswered: false, reason: 'empty-reply' } })
  const seen = engine(on, w)
  await start($)
  await (await mountRow($, 'terminal')).press({ key: 'pe-enhance' })
  expect(seen.fills).toHaveLength(0)
  expect(w.box).toBe('fix the login bug')
  expect(seen.toasts.at(-1)).toContain('Your prompt is unchanged')
})

test('text typed while it runs is kept, and Use rewrite puts the rewrite in later', async ($, on) => {
  const w = baseWorld({ typeWhileRunning: 'fix the login bug please' })
  const seen = engine(on, w)
  await start($)
  const row = await mountRow($, 'terminal')
  await row.press({ key: 'pe-enhance' })
  expect(seen.fills).toHaveLength(0)
  expect(w.box).toBe('fix the login bug please')
  expect(seen.toasts.at(-1)).toContain('your text was kept')
  await row.press({ key: 'pe-use' })
  expect(w.box.startsWith('Fix the login bug.')).toBe(true)
  expect(await row.find({ key: 'pe-undo' })).toBeDefined()
})

test('a box held by a dialog keeps the rewrite for later', async ($, on) => {
  const w = baseWorld({ fillRefused: true })
  const seen = engine(on, w)
  await start($)
  const row = await mountRow($, 'terminal')
  await row.press({ key: 'pe-enhance' })
  expect(w.box).toBe('fix the login bug')
  expect(seen.toasts.at(-1)).toContain('could not take the rewrite')
  expect(await row.find({ key: 'pe-use' })).toBeDefined()
  await row.press({ key: 'pe-discard' })
  expect(await row.find({ key: 'pe-use' })).toBeUndefined()
})

test('/enhance-prompt <text> rewrites the text given, and /enhance-prompt undo puts it back', async ($, on) => {
  const w = baseWorld({ box: '' })
  const seen = engine(on, w)
  await start($)
  await ($ as any).command.run({ command: 'enhance-prompt', args: 'make login faster' })
  expect(seen.prompts[0].prompt.includes('"""\nmake login faster\n"""')).toBe(true)
  expect(w.box.startsWith('Fix the login bug.')).toBe(true)
  await ($ as any).command.run({ command: 'enhance-prompt', args: 'undo' })
  expect(w.box).toBe('make login faster')
})

test('/doole_prompt-enhancer does the same as /enhance-prompt', async ($, on) => {
  const w = baseWorld({ box: '' })
  const seen = engine(on, w)
  await start($)
  await ($ as any).command.run({ command: 'doole_prompt-enhancer', args: 'make login faster' })
  expect(seen.prompts[0].prompt.includes('"""\nmake login faster\n"""')).toBe(true)
  expect(w.box.startsWith('Fix the login bug.')).toBe(true)
})

test('no Hindsight set up: no server call, MEMORY.md and soul.md are used', async ($, on) => {
  const w = baseWorld()
  delete w.files[`${HOME}/.hindsight/coding-agent.json`]
  const seen = engine(on, w)
  await start($)
  await (await mountRow($, 'terminal')).press({ key: 'pe-enhance' })
  expect(seen.fetched).toEqual([])
  const p = seen.prompts[0].prompt
  expect(p.includes('- Stop after 3 test passes')).toBe(true)
  expect(p.includes('- Likes short answers')).toBe(true)
  expect(seen.toasts.at(-1)).toContain('Hindsight: not set up, used MEMORY.md')
})

test('a Hindsight that does not answer in time is skipped and MEMORY.md stands in', { options: { hindsightSeconds: 0.1 } }, async ($, on) => {
  const seen = engine(on, baseWorld({ hindsight: 'silent' }))
  await start($)
  await (await mountRow($, 'terminal')).press({ key: 'pe-enhance' })
  // The time limit runs on a real timer, which the press does not wait for.
  await until(() => seen.toasts.length > 0)
  expect(seen.prompts[0].prompt.includes('- Stop after 3 test passes')).toBe(true)
  expect(seen.prompts[0].prompt.includes('login uses JWT cookies')).toBe(false)
  expect(seen.toasts.at(-1)).toContain('Hindsight: no answer in 0.1 s')
})

test('no CodeGraph index: CodeGraph is never run and the note says not indexed', async ($, on) => {
  const seen = engine(on, baseWorld({ exists: new Set() }))
  await start($)
  await (await mountRow($, 'terminal')).press({ key: 'pe-enhance' })
  expect(seen.argv.some(a => a.includes('codegraph'))).toBe(false)
  expect(seen.argv.some(a => a.includes('index') || a.includes('init'))).toBe(false)
  expect(seen.toasts.at(-1)).toContain('CodeGraph: not indexed')
  expect(seen.fills).toHaveLength(1)
})

test('no CodeGraph CLI: the note says not installed and the rewrite still lands', async ($, on) => {
  const seen = engine(on, baseWorld({ codegraph: 'missing' }))
  await start($)
  await (await mountRow($, 'terminal')).press({ key: 'pe-enhance' })
  expect(seen.toasts.at(-1)).toContain('CodeGraph: not installed')
  expect(seen.fills).toHaveLength(1)
})

test('neither Hindsight nor CodeGraph: the rewrite still lands with the session and files', async ($, on) => {
  const w = baseWorld({ exists: new Set(), hindsight: 'down' })
  delete w.files[`${HOME}/.hindsight/coding-agent.json`]
  const seen = engine(on, w)
  await start($)
  await (await mountRow($, 'terminal')).press({ key: 'pe-enhance' })
  const note = seen.toasts.at(-1)!
  expect(note).toContain('Hindsight: not set up, used MEMORY.md')
  expect(note).toContain('CodeGraph: not indexed')
  expect(seen.prompts[0].prompt.includes('Git branch: main')).toBe(true)
  expect(seen.fills).toHaveLength(1)
})

// ---------------------------------------------------------------- counts, the published segment, a host bar

test('after a run the own row shows how many recalls it found', { options: { soulBank: 'soul' } }, async ($, on) => {
  engine(on, baseWorld())
  await start($)
  const row = await mountRow($, 'terminal')
  await row.press({ key: 'pe-enhance' })
  expect(await row.find({ type: 'Text', text: '3 recalls' })).toBeDefined()
})

test('with Hindsight off and no index the row shows 0 recalls', async ($, on) => {
  const w = baseWorld({ exists: new Set() })
  delete w.files[`${HOME}/.hindsight/coding-agent.json`]
  engine(on, w)
  await start($)
  const row = await mountRow($, 'terminal')
  await row.press({ key: 'pe-enhance' })
  expect(await row.find({ type: 'Text', text: '0 recalls' })).toBeDefined()
})

test('the segment is published at start, while working and after a run', { options: { soulBank: 'soul' } }, async ($, on) => {
  const published: any[] = []
  on('state.set', { plugin: 'prompt-enhancer', key: 'segments' } as any, (_$: any, e: any, next: any) => (published.push(e.value?.enhance), next(e)))
  engine(on, baseWorld())
  await start($)
  expect(published.at(-1)).toEqual({ label: 'Enhance Prompt', detail: '', command: 'enhance-prompt', state: 'idle', actions: [] })
  await (await mountRow($, 'terminal')).press({ key: 'pe-enhance' })
  expect(published.some(s => s.state === 'working' && s.label === 'Enhancing!')).toBe(true)
  expect(published.at(-1)).toEqual({
    label: 'Enhance Prompt',
    detail: '3 recalls',
    command: 'enhance-prompt',
    state: 'done',
    actions: [{ label: 'Undo', command: 'enhance-prompt undo' }],
  })
})

// A stand-in status bar that hosts published segments: it draws the row itself, keyed as Bottom Bar does,
// with the segment's buttons; its own press handlers only record (the enhancer should take the press).
const barPresses: string[] = []
const HOST_BAR = {
  name: 'bottom-bar',
  register: ((on: any) => {
    on('ui.render', { component: 'SessionMode' }, ($: any, e: any) => {
      const { Box, Button, Text } = $.ui.resolve(e)
      const h = (globalThis as any).h
      return h(
        Box,
        { key: 'bottom-bar-segments' },
        h(Text, {}, '1 agent'),
        h(Button, { key: 'seg:prompt-enhancer:enhance', plain: true, onPress: () => barPresses.push('enhance') }, 'Enhance Prompt'),
        h(Button, { key: 'seg:prompt-enhancer:enhance:0', plain: true, onPress: () => barPresses.push('undo') }, 'Undo'),
      )
    })
  }) as any,
}

test("with a host bar the own button is not drawn, and the bar's segment and Undo do the work", { plugins: [HOST_BAR] }, async ($, on) => {
  barPresses.length = 0
  const w = baseWorld()
  const seen = engine(on, w)
  await start($)
  const row = await $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
  expect(await row.find({ key: 'pe-enhance' })).toBeUndefined()
  expect(await row.find({ key: 'seg:prompt-enhancer:enhance' })).toBeDefined()

  // The bar's buttons are the bar's: pressed as the bar drew them.
  const bar = await $.ui.mount({ plugin: 'bottom-bar', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
  await bar.press({ key: 'seg:prompt-enhancer:enhance' })
  await until(() => seen.toasts.some(t => t.includes('ready to review')))
  expect(w.box.startsWith('Fix the login bug.')).toBe(true)

  // The run publishes its Undo as it finishes; then the bar's Undo puts the text back.
  for (let i = 0; i < 5 && w.box !== 'fix the login bug'; i++) {
    await bar.press({ key: 'seg:prompt-enhancer:enhance:0' })
    await until(() => w.box === 'fix the login bug')
  }
  expect(w.box).toBe('fix the login bug')
  expect(barPresses).toEqual([])
})


test('enabled false: no button is drawn, no segment is published and the command says it is off', { options: { enabled: false } }, async ($, on) => {
  const seen = engine(on, baseWorld())
  await start($)
  const row = await mountRow($, 'terminal')
  expect(await row.find({ key: 'pe-enhance' })).toBeUndefined()
  expect(await row.find({ type: 'Text', text: 'status row' })).toBeDefined()
  await ($ as any).command.run({ command: 'enhance-prompt', args: 'make login faster' })
  expect(seen.prompts).toHaveLength(0)
  expect(seen.toasts.at(-1)).toContain('Enhance Prompt is off. Turn it on in Mod Settings (/doole_settings)')
})

test('maxSkills limits the skills offered to the model', { options: { maxSkills: 1 } }, async ($, on) => {
  const seen = engine(on, baseWorld())
  await start($)
  await (await mountRow($, 'terminal')).press({ key: 'pe-enhance' })
  const listed = String(seen.prompts[0].prompt).split('Installed skills:' + String.fromCharCode(10))[1]!.split(String.fromCharCode(10, 10))[0]!.split(String.fromCharCode(10))
  expect(listed).toHaveLength(1)
})

import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { MAX_SESSION_TOKENS, MODEL } from '../hooks/logic'

const PLUGIN = 'prompt-enhancer'

const REPLY = [
  'TASK:',
  'Add a dark mode switch to the settings page.',
  'LOAD THESE SKILLS:',
  '- plan: breaks the work into steps',
  '- ghost: not installed',
  'ASK ME FIRST ABOUT:',
  '- Should the choice be remembered between runs?',
  'DONE WHEN:',
  '- The switch changes the theme',
].join('\n')

const FILES: Record<string, string> = {
  'C:/Users/T/.claude/skills/plan/SKILL.md': '---\nname: plan\ndescription: Break work into steps\n---\nbody',
  'C:/Users/T/.claude/skills/review/SKILL.md': '---\nname: review\ndescription: Review a change\n---\nbody',
}

const USAGE = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type ModelCall = { model: string; prompt: string; system?: string; maxTokens?: number; timeoutMs?: number }

function band(surface: 'terminal' | 'desktop', hasSurvey = false) {
  return {
    plugin: PLUGIN,
    surface,
    component: 'AbovePrompt' as const,
    props: { hasSurvey, isWorking: false, maxRows: 30, bodyColumns: 100, scroll: { offset: 0, bodyRows: 29 }, view: {} },
  }
}

function setup(
  on: On,
  options: { files?: Record<string, string>; reply?: () => unknown; canFill?: boolean; below?: string } = {},
) {
  const world = {
    toasts: [] as string[],
    models: [] as ModelCall[],
    filled: [] as string[],
    sent: [] as { text: string; asUser: boolean }[],
    submitDrop: null as string | null,
    canFill: options.canFill ?? true,
    reply: options.reply ?? (() => ({ isAnswered: true, text: REPLY, usage: USAGE })),
    registered: [] as { name: string; immediate?: boolean }[],
    clock: mock.clock(on, { now: 1_000_000 }),
  }
  const files = options.files ?? FILES
  const norm = (p: string) => p.replace(/\\/g, '/')
  const isDir = (p: string) => Object.keys(files).some(k => k.startsWith(`${norm(p)}/`))

  mock.env(on, { USERPROFILE: 'C:\\Users\\T', OS: 'Windows_NT' })
  on('fs.exists', (_$, e) => ({ value: norm(e.path) in files || isDir(e.path) }))
  on('fs.read', (_$, e) => ({ value: files[norm(e.path)] ?? '' }))
  on('fs.stat', (_$, e) => {
    const k = norm(e.path)
    if (k in files) return { value: { kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false } }
    if (isDir(k)) return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } }
    throw new Error('ENOENT')
  })
  on('fs.list', (_$, e) => {
    const dir = norm(e.path)
    const names = new Set(
      Object.keys(files)
        .filter(k => k.startsWith(`${dir}/`))
        .map(k => k.slice(dir.length + 1).split('/')[0]!),
    )
    return {
      value: [...names].map(name => ({
        name,
        kind: files[`${dir}/${name}`] === undefined ? ('dir' as const) : ('file' as const),
        size: 0,
        mtimeMs: 0,
        isLink: false,
      })),
    }
  })
  on('session.cwd', () => ({ value: 'F:/work/app' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.toast', (_$, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('model.complete', (_$, e) => {
    world.models.push(e as ModelCall)
    return { value: world.reply() as never }
  })
  on('prompt.fill', (_$, e) => {
    world.filled.push(e.text)
    return { isFilled: world.canFill }
  })
  on('prompt.submit', (_$, e) => {
    if (world.submitDrop !== null) return { drop: world.submitDrop }
    world.sent.push({ text: e.text, asUser: (e.origin as { asUser?: boolean }).asUser === true })
    return { text: e.text }
  })
  on('command.register', (_$, e) => {
    world.registered.push({ name: e.name, immediate: e.immediate })
    return { value: { command: e.name } }
  })
  on('ui.render', (_$, e) => {
    if (options.below === undefined) return { type: 'Text', children: [] } as never
    return { type: 'Text', children: [options.below] } as never
  })
  return world
}

const type = ($: Engine, text: string, origin: { kind: 'composer' } | { kind: 'plugin'; name: string } = { kind: 'composer' }) =>
  $.prompt.submit({ text, wait: false, origin } as never)

const enhance = ($: Engine, args: string) =>
  $.command.run({ command: 'enhance', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

const textsOf = async (ui: { findAll: (q: { type: string }) => Promise<{ text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')

describe('commands', () => {
  test('session start registers /enhance as an immediate command', async ($, on) => {
    const world = setup(on)
    await $.session.start({ cwd: 'F:/work/app', surface: 'desktop', isInteractive: true })
    expect(world.registered).toEqual([{ name: 'enhance', immediate: true }])
  })

  test('/enhance with no text answers with usage and calls no model', async ($, on) => {
    const world = setup(on)
    const out = await enhance($, '   ')
    expect(out.text).toContain('Usage: /enhance')
    await world.clock.settle()
    expect(world.models).toHaveLength(0)
  })

  test('/enhance <text> starts a rewrite by itself and sends nothing', async ($, on) => {
    const world = setup(on)
    const out = await enhance($, 'dark mode pls')
    expect(out.text).toContain('Rewriting your prompt')
    await world.clock.settle()
    expect(world.models).toHaveLength(1)
    expect(world.sent).toHaveLength(0)
    const ui = await $.ui.mount(band('desktop'))
    expect(await ui.find({ key: 'use' })).toBeDefined()
    await ui.unmount()
  })
})

describe('++ prefix', () => {
  test('a "++ " prompt is dropped from sending and rewritten', async ($, on) => {
    const world = setup(on)
    const out = await type($, '++ dark mode pls')
    expect(out.drop).toContain('Held for a rewrite')
    await world.clock.settle()
    expect(world.models).toHaveLength(1)
    expect(world.models[0]!.prompt).toContain('dark mode pls')
    expect(world.models[0]!.prompt).not.toContain('++')
    expect(world.sent).toHaveLength(0)
    expect(world.filled).toHaveLength(0)
  })

  test('other prompts pass through untouched', async ($, on) => {
    const world = setup(on)
    const out = await type($, 'just a normal prompt')
    expect(out.drop).toBeUndefined()
    expect(out.text).toBe('just a normal prompt')
    await world.clock.settle()
    expect(world.models).toHaveLength(0)
  })

  test('a prompt a plugin submits is not held', async ($, on) => {
    const world = setup(on)
    const out = await type($, '++ from a plugin', { kind: 'plugin', name: 'idea-shelf' })
    expect(out.drop).toBeUndefined()
    await world.clock.settle()
    expect(world.models).toHaveLength(0)
  })

  test('"++ " alone is dropped with a note and calls no model', async ($, on) => {
    const world = setup(on)
    const out = await type($, '++ ')
    expect(out.drop).toContain('Nothing to rewrite')
    await world.clock.settle()
    expect(world.models).toHaveLength(0)
  })
})

describe('the model call', () => {
  test('uses Haiku with a 900 token cap, a 30 second limit and the skills list', async ($, on) => {
    const world = setup(on)
    await type($, '++ dark mode pls')
    await world.clock.settle()
    const call = world.models[0]!
    expect(call.model).toBe(MODEL)
    expect(call.model).toBe('claude-haiku-5-5')
    expect(call.maxTokens).toBe(900)
    expect(call.timeoutMs).toBe(30_000)
    expect(call.system).toContain('LOAD THESE SKILLS:')
    expect(call.prompt).toContain('- plan: Break work into steps')
    expect(call.prompt).toContain('- review: Review a change')
  })

  test('when skills cannot be read it says so in the list and carries on', async ($, on) => {
    const world = setup(on, { files: {} })
    await type($, '++ dark mode pls')
    await world.clock.settle()
    expect(world.models).toHaveLength(1)
    expect(world.models[0]!.prompt).toContain('no skills are available')
    const ui = await $.ui.mount(band('desktop'))
    const texts = await textsOf(ui)
    expect(texts.some(t => t.includes('Skills could not be read') || t.includes('No skills were found'))).toBe(true)
    await ui.press({ key: 'use' })
    const sent = world.sent[0]!.text
    expect(sent).toMatch(/Load these skills:\n- (Skills could not be read|No skills were found)/)
    await ui.unmount()
  })
})

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`band on ${surface}`, () => {
    test('shows the four parts with Use, Edit and Cancel, and drops skills that do not exist', async ($, on) => {
      const world = setup(on)
      await type($, '++ dark mode pls')
      await world.clock.settle()
      const ui = await $.ui.mount(band(surface))
      const texts = await textsOf(ui)
      expect(texts).toContain('Add a dark mode switch to the settings page.')
      expect(texts).toContain('Load these skills:')
      expect(texts).toContain('- plan: breaks the work into steps')
      expect(texts.join('\n')).not.toContain('ghost')
      expect(texts).toContain('Ask me first about:')
      expect(texts).toContain('Done when:')
      expect(await ui.find({ type: 'Button', key: 'use' })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'edit' })).toBeDefined()
      expect(await ui.find({ type: 'Button', key: 'cancel' })).toBeDefined()
      await ui.unmount()
    })

    test('shows a working line with Cancel while the model runs', async ($, on) => {
      const world = setup(on)
      await type($, '++ dark mode pls')
      const ui = await $.ui.mount(band(surface))
      expect((await textsOf(ui)).join('')).toContain('Rewriting your prompt')
      expect(await ui.find({ key: 'use' })).toBeUndefined()
      expect(await ui.find({ key: 'cancel' })).toBeDefined()
      await ui.unmount()
      await world.clock.settle()
    })

    test('Use sends the rewrite as the user\'s prompt and clears the band', async ($, on) => {
      const world = setup(on)
      await type($, '++ dark mode pls')
      await world.clock.settle()
      const ui = await $.ui.mount(band(surface))
      await ui.press({ key: 'use' })
      expect(world.sent).toHaveLength(1)
      expect(world.sent[0]!.asUser).toBe(true)
      expect(world.sent[0]!.text).toBe(
        [
          'Add a dark mode switch to the settings page.',
          '',
          'Load these skills:',
          '- plan: breaks the work into steps',
          '',
          'Ask me first about:',
          '- Should the choice be remembered between runs?',
          '',
          'Done when:',
          '- The switch changes the theme',
        ].join('\n'),
      )
      expect(await ui.find({ key: 'use' })).toBeUndefined()
      await ui.unmount()
    })

    test('Use that is refused keeps the rewrite and toasts', async ($, on) => {
      const world = setup(on)
      await type($, '++ dark mode pls')
      await world.clock.settle()
      world.submitDrop = 'blocked'
      const ui = await $.ui.mount(band(surface))
      await ui.press({ key: 'use' })
      expect(world.sent).toHaveLength(0)
      expect(world.toasts.some(t => t.includes('Not sent: blocked'))).toBe(true)
      expect(await ui.find({ key: 'use' })).toBeDefined()
      await ui.unmount()
    })

    test('Edit puts the rewrite in the box and sends nothing', async ($, on) => {
      const world = setup(on)
      await type($, '++ dark mode pls')
      await world.clock.settle()
      const ui = await $.ui.mount(band(surface))
      await ui.press({ key: 'edit' })
      expect(world.filled).toHaveLength(1)
      expect(world.filled[0]).toContain('Load these skills:')
      expect(world.sent).toHaveLength(0)
      expect(await ui.find({ key: 'use' })).toBeUndefined()
      await ui.unmount()
    })

    test('Edit that cannot fill the box keeps the band', async ($, on) => {
      const world = setup(on, { canFill: false })
      await type($, '++ dark mode pls')
      await world.clock.settle()
      const ui = await $.ui.mount(band(surface))
      await ui.press({ key: 'edit' })
      expect(await ui.find({ key: 'use' })).toBeDefined()
      expect(world.toasts.length).toBe(1)
      await ui.unmount()
    })

    test('Cancel puts the original text back and sends nothing', async ($, on) => {
      const world = setup(on)
      await type($, '++ dark mode pls')
      await world.clock.settle()
      const ui = await $.ui.mount(band(surface))
      await ui.press({ key: 'cancel' })
      expect(world.filled).toEqual(['++ dark mode pls'])
      expect(world.sent).toHaveLength(0)
      expect(await ui.find({ key: 'use' })).toBeUndefined()
      await ui.unmount()
    })

    test('Cancel while the model is still working ignores the late answer', async ($, on) => {
      const world = setup(on)
      await type($, '++ dark mode pls')
      const ui = await $.ui.mount(band(surface))
      await ui.press({ key: 'cancel' })
      expect(world.filled).toEqual(['++ dark mode pls'])
      await world.clock.settle()
      expect(await ui.find({ key: 'use' })).toBeUndefined()
      expect(await ui.find({ key: 'cancel' })).toBeUndefined()
      expect(world.sent).toHaveLength(0)
      await ui.unmount()
    })

    test('idle: draws nothing of its own and keeps what is below; yields to a survey', async ($, on) => {
      setup(on, { below: 'other mod band' })
      const ui = await $.ui.mount(band(surface))
      expect(await textsOf(ui)).toEqual(['other mod band'])
      expect(await ui.find({ key: 'use' })).toBeUndefined()
      await ui.unmount()
    })

    test('with a rewrite ready it draws above the band of another mod', async ($, on) => {
      const world = setup(on, { below: 'other mod band' })
      await type($, '++ dark mode pls')
      await world.clock.settle()
      const ui = await $.ui.mount(band(surface))
      const texts = await textsOf(ui)
      expect(texts[0]).toBe('Rewritten prompt')
      expect(texts.at(-1)).toBe('other mod band')
      await ui.unmount()
      const survey = await $.ui.mount(band(surface, true))
      expect(await survey.find({ key: 'use' })).toBeUndefined()
      await survey.unmount()
    })
  })
}

describe('failures', () => {
  test('a model error puts the text back and toasts that it was put back', async ($, on) => {
    const world = setup(on, { reply: () => ({ isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE }) })
    await type($, '++ dark mode pls')
    await world.clock.settle()
    expect(world.filled).toEqual(['++ dark mode pls'])
    expect(world.toasts).toHaveLength(1)
    expect(world.toasts[0]).toContain('The rewrite failed (error 529).')
    expect(world.toasts[0]).toContain('Your text is back in the prompt box.')
    const ui = await $.ui.mount(band('desktop'))
    expect(await ui.find({ key: 'use' })).toBeUndefined()
    await ui.unmount()
  })

  test('a timeout says so', async ($, on) => {
    const world = setup(on, { reply: () => ({ isAnswered: false, reason: 'aborted', usage: USAGE }) })
    await type($, '++ dark mode pls')
    await world.clock.settle()
    expect(world.toasts[0]).toContain('took too long')
  })

  test('when the box cannot take the text back the toast carries the text', async ($, on) => {
    const world = setup(on, { canFill: false, reply: () => ({ isAnswered: false, reason: 'empty-reply', usage: USAGE }) })
    await enhance($, 'dark mode pls')
    await world.clock.settle()
    expect(world.filled).toEqual(['dark mode pls'])
    expect(world.toasts[0]).toContain('could not be put back')
    expect(world.toasts[0]).toContain('dark mode pls')
  })

  test('a reply that is not in four parts counts as a failure', async ($, on) => {
    const world = setup(on, { reply: () => ({ isAnswered: true, text: 'Here is a nicer prompt for you.', usage: USAGE }) })
    await type($, '++ dark mode pls')
    await world.clock.settle()
    expect(world.filled).toEqual(['++ dark mode pls'])
    expect(world.toasts[0]).toContain('expected form')
  })
})

describe('caps', () => {
  test('the 21st rewrite is refused, the text is put back, and no model call is made', async ($, on) => {
    const world = setup(on)
    for (let i = 0; i < 20; i++) {
      await enhance($, `idea ${i}`)
      await world.clock.settle()
      const ui = await $.ui.mount(band('desktop'))
      await ui.press({ key: 'cancel' })
      await ui.unmount()
    }
    expect(world.models).toHaveLength(20)
    world.filled.length = 0
    const out = await type($, '++ one more')
    expect(out.drop).toContain('20 rewrites')
    await world.clock.settle()
    expect(world.models).toHaveLength(20)
    expect(world.filled).toEqual(['++ one more'])
    expect(world.toasts.at(-1)).toContain('Your text is back')
    const cmd = await enhance($, 'and another')
    expect(cmd.text).toContain('20 rewrites')
  })

  test('tokens from the usage add up and stop rewrites at 120k', async ($, on) => {
    const world = setup(on, {
      reply: () => ({
        isAnswered: true,
        text: REPLY,
        usage: { input_tokens: MAX_SESSION_TOKENS - 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
    })
    await enhance($, 'first')
    await world.clock.settle()
    const ui = await $.ui.mount(band('desktop'))
    await ui.press({ key: 'cancel' })
    await ui.unmount()
    const out = await enhance($, 'second')
    expect(out.text).toContain('120k tokens')
    await world.clock.settle()
    expect(world.models).toHaveLength(1)
  })

  test('a new request while one waits above the prompt is refused', async ($, on) => {
    const world = setup(on)
    await type($, '++ first')
    await world.clock.settle()
    const out = await type($, '++ second')
    expect(out.drop).toContain('Use, Edit or Cancel')
    await world.clock.settle()
    expect(world.models).toHaveLength(1)
    expect(world.filled).toEqual(['++ second'])
  })
})

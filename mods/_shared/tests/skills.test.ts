import { describe, expect, test } from 'claude-code/testing'

import { listSkills, parseFrontmatter } from '../lib/skills'
import { fakeIo } from './fakeio'

const fm = (text: string) => parseFrontmatter(text)?.data

describe('frontmatter parser', () => {
  test('plain, quoted and numeric values', () => {
    expect(fm('---\nname: my-skill\ndescription: Does a thing.\nversion: 1.56.1\n---\n# Body')).toEqual({
      name: 'my-skill',
      description: 'Does a thing.',
      version: '1.56.1',
    })
    expect(fm('---\nname: "q"\ndescription: "Say \\"hi\\"\\nthen: go"\n---\n')).toEqual({ name: 'q', description: 'Say "hi"\nthen: go' })
    expect(fm("---\nname: s\ndescription: 'It''s here'\n---\n")).toEqual({ name: 's', description: "It's here" })
    expect(fm('---\ndescription: "Knowledge comics (知识漫画): educational, biography, tutorial."\n---\n')?.description).toBe(
      'Knowledge comics (知识漫画): educational, biography, tutorial.',
    )
  })

  test('a colon inside a plain value stays in the value', () => {
    expect(fm('---\nname: a\ndescription: Use when X: do Y\n---\n')?.description).toBe('Use when X: do Y')
  })

  test('folded and literal blocks', () => {
    const folded = fm('---\nname: a\ndescription: >\n  Operational rules for\n  background tasks.\n\n  Second paragraph.\nnext: z\n---\n')
    expect(folded?.description).toBe('Operational rules for background tasks.\nSecond paragraph.')
    expect(folded?.next).toBe('z')
    expect(fm('---\ndescription: >-\n  one\n  two\n---\n')?.description).toBe('one two')
    expect(fm('---\ndescription: |\n  Drive the desktop\n  in the background.\nname: n\n---\n')).toEqual({
      description: 'Drive the desktop\nin the background.',
      name: 'n',
    })
  })

  test('a plain value continued on indented lines', () => {
    const d = fm(
      '---\nname: ai-inputs\ndescription: Design and implement AI input patterns. Use this skill whenever\n  the user wants to add an AI-powered input mechanism to their product,\n  improve how users interact.\n---\n',
    )
    expect(d?.description).toBe(
      'Design and implement AI input patterns. Use this skill whenever the user wants to add an AI-powered input mechanism to their product, improve how users interact.',
    )
  })

  test('a quoted value over several lines', () => {
    expect(fm('---\ndescription: "first part\n  second part"\n---\n')?.description).toBe('first part second part')
  })

  test('nested maps and lists read as empty and do not leak keys', () => {
    const d = fm('---\nname: minecraft-mod-dev\nmetadata:\n  mcpmarket-version: 1.0.0\ntags: [a, b]\ndescription: After\n---\n')
    expect(d).toEqual({ name: 'minecraft-mod-dev', metadata: '', tags: '[a, b]', description: 'After' })
  })

  test('CRLF, BOM, comments and the body', () => {
    const parsed = parseFrontmatter('\uFEFF---\r\n# a comment\r\nname: crlf\r\ndescription: ok\r\n---\r\n# Title\r\nText')
    expect(parsed?.data).toEqual({ name: 'crlf', description: 'ok' })
    expect(parsed?.body).toBe('# Title\nText')
  })

  test('no frontmatter gives null', () => {
    expect(parseFrontmatter('# Content Gen: Meta Stage\n\n## Purpose')).toBeNull()
    expect(parseFrontmatter('---\nname: never closed\n')).toBeNull()
    expect(parseFrontmatter('')).toBeNull()
  })
})

const HOME = 'C:/Users/Dayle Frost'
const skillMd = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`

const INSTALLED = JSON.stringify({
  version: 2,
  plugins: {
    'superpowers@claude-plugins-official': [
      { scope: 'user', installPath: 'C:\\Users\\Dayle Frost\\.claude\\plugins\\cache\\official\\superpowers\\6.4.1', version: '6.4.1' },
    ],
    'blockdesigner@doole-skills': [
      { scope: 'user', installPath: 'C:\\Users\\Dayle Frost\\.claude\\plugins\\cache\\doole\\blockdesigner\\abc' },
      { scope: 'user', installPath: 'C:\\Users\\Dayle Frost\\.claude\\plugins\\cache\\doole\\blockdesigner\\abc' },
    ],
    'only-here@m': [{ scope: 'project', projectPath: 'F:\\Code\\App', installPath: 'C:/p/only-here' }],
    'elsewhere@m': [{ scope: 'project', projectPath: 'F:\\Other', installPath: 'C:/p/elsewhere' }],
    'empty@m': [],
  },
})

const TREE: Record<string, string> = {
  [`${HOME}/.claude/skills/accessibility/SKILL.md`]: skillMd('accessibility', 'Review designs'),
  [`${HOME}/.claude/skills/linked-one/SKILL.md`]: skillMd('linked-one', 'Behind a symlink'),
  [`${HOME}/.claude/skills/media/DESCRIPTION.md`]: 'category',
  [`${HOME}/.claude/skills/media/spotify/SKILL.md`]: skillMd('spotify', 'Play music'),
  [`${HOME}/.claude/skills/content-gen-meta/SKILL.md`]: '# Content Gen: Meta Stage\n',
  [`${HOME}/.claude/skills/not-a-skill/README.md`]: 'nothing',
  [`${HOME}/.claude/skills/.hidden/SKILL.md`]: skillMd('hidden', 'skip me'),
  [`${HOME}/.claude/operant-hub/skills/team-work/SKILL.md`]: skillMd('team-work', 'Split jobs'),
  [`${HOME}/.claude/operant-hub/skills/accessibility/SKILL.md`]: skillMd('accessibility', 'Operant copy'),
  'F:/Code/App/.claude/skills/local-one/SKILL.md': skillMd('local-one', 'Project skill'),
  [`${HOME}/.claude/plugins/installed_plugins.json`]: INSTALLED,
  [`${HOME}/.claude/plugins/cache/official/superpowers/6.4.1/skills/brainstorming/SKILL.md`]: skillMd('brainstorming', 'Explore first'),
  [`${HOME}/.claude/plugins/cache/official/superpowers/6.4.1/skills/tdd/SKILL.md`]: '---\ndescription: Tests first\n---\n',
  [`${HOME}/.claude/plugins/cache/doole/blockdesigner/abc/skills/blockdesigner-release/SKILL.md`]: skillMd('blockdesigner-release', 'Ship it'),
  'C:/p/only-here/skills/mine/SKILL.md': skillMd('mine', 'Project plugin skill'),
  'C:/p/elsewhere/skills/theirs/SKILL.md': skillMd('theirs', 'Other project'),
}

const env = { USERPROFILE: 'C:\\Users\\Dayle Frost' }

describe('listSkills', () => {
  test('collects every source with names, descriptions, paths and sources', async () => {
    const { io } = fakeIo({ files: TREE, links: [`${HOME}/.claude/skills/linked-one`], env })
    const { skills, errors } = await listSkills(io, 'F:\\Code\\App')
    expect(errors).toEqual([])
    const by = (source: string) => skills.filter(s => s.source === source).map(s => s.name).sort()
    expect(by('user')).toEqual(['accessibility', 'content-gen-meta', 'linked-one', 'spotify'])
    expect(by('operant-hub')).toEqual(['accessibility', 'team-work'])
    expect(by('project')).toEqual(['local-one'])
    expect(by('plugin:superpowers')).toEqual(['superpowers:brainstorming', 'superpowers:tdd'])
    expect(by('plugin:blockdesigner')).toEqual(['blockdesigner:blockdesigner-release'])
    expect(by('plugin:only-here')).toEqual(['only-here:mine'])
    expect(skills.some(s => s.source === 'plugin:elsewhere')).toBe(false)

    const one = skills.find(s => s.name === 'accessibility' && s.source === 'user')
    expect(one).toEqual({
      name: 'accessibility',
      description: 'Review designs',
      path: `${HOME}/.claude/skills/accessibility/SKILL.md`,
      source: 'user',
    })
    expect(skills.find(s => s.name === 'content-gen-meta')?.description).toBe('')
    expect(skills.find(s => s.name === 'superpowers:tdd')?.description).toBe('Tests first')
  })

  test('the same name in two sources is kept twice, the same plugin install once', async () => {
    const { io } = fakeIo({ files: TREE, env })
    const { skills } = await listSkills(io, 'F:/Code/App')
    expect(skills.filter(s => s.name === 'accessibility').length).toBe(2)
    expect(skills.filter(s => s.name === 'blockdesigner:blockdesigner-release').length).toBe(1)
  })

  test('a project skill needs a cwd, and a subfolder keeps project plugins', async () => {
    const { io } = fakeIo({ files: TREE, env })
    const none = await listSkills(io, null)
    expect(none.skills.some(s => s.source === 'project' || s.source === 'plugin:only-here')).toBe(false)
    const sub = await listSkills(io, 'f:\\code\\app\\src')
    expect(sub.skills.some(s => s.source === 'plugin:only-here')).toBe(true)
  })

  test('an unreadable file is reported and the rest carry on', async () => {
    const bad = `${HOME}/.claude/skills/accessibility/SKILL.md`
    const { io } = fakeIo({ files: TREE, unreadable: { [bad]: 'EACCES: permission denied' }, env })
    const { skills, errors } = await listSkills(io, 'F:/Code/App')
    expect(errors).toEqual([{ path: bad, reason: 'EACCES: permission denied' }])
    expect(skills.some(s => s.name === 'spotify')).toBe(true)
    expect(skills.some(s => s.name === 'superpowers:brainstorming')).toBe(true)
  })

  test('a broken installed_plugins.json is one error, user skills still list', async () => {
    const files = { ...TREE, [`${HOME}/.claude/plugins/installed_plugins.json`]: '{ nope' }
    const { io } = fakeIo({ files, env })
    const { skills, errors } = await listSkills(io, 'F:/Code/App')
    expect(errors.length).toBe(1)
    expect(errors[0]!.path).toBe(`${HOME}/.claude/plugins/installed_plugins.json`)
    expect(skills.some(s => s.source === 'user')).toBe(true)
    expect(skills.some(s => s.source.startsWith('plugin:'))).toBe(false)
  })

  test('missing folders and no plugin file are not errors; no home folder is', async () => {
    const empty = await listSkills(fakeIo({ env: { USERPROFILE: 'C:/Users/none' } }).io, 'F:/x')
    expect(empty).toEqual({ skills: [], errors: [] })
    const noHome = await listSkills(fakeIo().io, 'F:/x')
    expect(noHome.errors.length).toBe(1)
  })
})

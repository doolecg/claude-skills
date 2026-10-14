import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, StateWrite } from 'claude-code'

import type { Editing } from '../types'
import { ageOf, cleanIdea, ideaKey, isIdea, newId, parseEdit, shelfPrefix } from './shelf'
import { SIDEBAR_COLUMNS, isSidebarTab, sbActions, sbAsker, sbButton, sbCard, sbFrame, sbKit, sbPaneMove, sbPalette, sbRows, sbSplit, sbTitle } from './sidebar-kit'
import type { SbStrip } from './sidebar-kit'

type Row = { id: string; text: string; at: number }

const editing = atom({ plugin: 'idea-shelf', key: 'editing' } as const, null as Editing | null)
const badge = atom({ plugin: 'idea-shelf', key: 'sidebarBadge' } as const, 0)
const askAtom = atom({ plugin: 'idea-shelf', key: 'sidebarAsk' } as const, { args: '', n: 0 })

/** Asks the Sidebar to do what `/sidebar <args>` does, through this mod's own state: no command is run. */
const askSidebar = ($: EngineInterface, args: string) => update($, askAtom, v => ({ args, n: (v?.n ?? 0) + 1 }))

async function listIdeas($: EngineInterface, cwd: string): Promise<Row[]> {
  const prefix = shelfPrefix(cwd)
  const keys = (await $.store.keys()).filter(key => key.startsWith(prefix))
  const rows = await Promise.all(keys.map(async key => {
    const value = await $.store.get(key)
    return isIdea(value) ? { id: key.slice(prefix.length), text: value.text, at: value.at } : null
  }))
  return rows.filter((row): row is Row => row !== null).sort((a, b) => a.at - b.at)
}

/** The Sidebar's strip, or undefined when the Sidebar is not installed. */
async function readStrip($: EngineInterface): Promise<SbStrip | undefined> {
  try {
    return (await $.state.get({ plugin: 'sidebar', key: 'strip' } as const)).value
  } catch {
    return undefined
  }
}

/** Tells the Sidebar how many ideas this project has, for its tab badge. */
async function publishBadge($: EngineInterface): Promise<void> {
  try {
    const count = (await listIdeas($, await $.session.cwd())).length
    await update($, badge, () => count)
  } catch {}
}

const openPane = ($: EngineInterface) => $.ui.open({ id: 'ideas', title: 'Idea Shelf', closeOnEscape: true, columns: SIDEBAR_COLUMNS })

async function closePane($: EngineInterface): Promise<void> {
  if ((await $.ui.panes()).some(p => p.id === 'ideas')) await $.ui.close({ id: 'ideas' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'idea',
        description: "Park an idea on this project's shelf; /idea edit <n> <text> changes one",
        argumentHint: '<text>',
        immediate: true,
      })
      await $.command.register({
        name: 'ideas',
        description: 'Open the Idea Shelf to send, edit or delete parked ideas',
        argumentHint: '[open|close]',
        immediate: true,
      })
    } catch {
      $.ui.toast('Idea Shelf: could not register its commands')
    }
    await publishBadge($)
    return next(e)
  })

  on('command.run', { command: 'idea' }, async ($, e) => {
    const cwd = await $.session.cwd()
    const edit = parseEdit(e.args)
    if (edit !== null) {
      const text = cleanIdea(edit.text)
      const row = (await listIdeas($, cwd))[edit.n - 1]
      if (row === undefined) $.ui.toast(`No idea number ${edit.n} on this shelf`)
      else if (text === null) $.ui.toast('An idea cannot be empty')
      else {
        await $.store.set(ideaKey(cwd, row.id), { text, at: row.at })
        $.ui.toast(`Idea ${edit.n} updated`)
        $.ui.invalidate('ui.render')
      }
      return {}
    }
    const text = cleanIdea(e.args)
    if (text === null) {
      $.ui.toast('Usage: /idea <text>, or /idea edit <n> <text>')
      return {}
    }
    try {
      const at = await $.clock.now()
      await $.store.set(ideaKey(cwd, newId(at, Math.random())), { text, at })
      $.ui.toast('Idea parked on this project\'s shelf (/ideas to review)')
      await publishBadge($)
      $.ui.invalidate('ui.render')
    } catch {
      $.ui.toast('Idea Shelf: could not save the idea')
    }
    return {}
  })

  on('command.run', { command: 'ideas' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'close') {
      await $.ui.close({ id: 'ideas' })
      return {}
    }
    const strip = await readStrip($)
    await $.ui.open({ id: 'ideas', title: 'Idea Shelf', closeOnEscape: true, ...(strip?.isOn ? { columns: SIDEBAR_COLUMNS } : {}) })
    return {}
  })

  // The Sidebar's strip names this tab, or moves on from it: the pane opens or closes with it.
  on('state.set', { key: 'strip' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = e as unknown as StateWrite
    const move = w.plugin === 'sidebar' ? sbPaneMove('idea-shelf', w.value, w.previous) : undefined
    try {
      if (move === 'open') await openPane($)
      else if (move === 'close') await closePane($)
    } catch {}
    return ran
  }).catch(($, e, next) => next(e))

  // The person closing the tab pane takes the sidebar down with it.
  on('ui.close', async ($, e, next) => {
    const ran = await next(e)
    if (e.id === 'ideas' && e.origin.kind === 'person') {
      const strip = await readStrip($)
      if (strip?.isOn && strip.active === 'idea-shelf') {
        try {
          await askSidebar($, 'closed idea-shelf')
        } catch {}
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: 'ideas' }, async ($, e) => {
    const els = $.ui.resolve(e) as unknown as Record<string, any>
    const { Box, Button, Text } = els
    const cwd = await $.session.cwd()
    const ideas = await listIdeas($, cwd)
    const current = await read($, editing)
    const folder = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
    const strip = await readStrip($)
    const now = await $.clock.now()

    const send = async (idea: Row) => {
      try {
        await $.prompt.submit({ text: idea.text, asUser: true })
      } catch {
        $.ui.toast('Idea Shelf: could not send the idea; it stays on the shelf')
        return
      }
      await $.store.delete(ideaKey(cwd, idea.id))
      await publishBadge($)
      $.ui.invalidate('ui.render')
    }

    const add = async (value: string) => {
      const text = cleanIdea(value)
      if (text === null) return
      try {
        const at = await $.clock.now()
        await $.store.set(ideaKey(cwd, newId(at, Math.random())), { text, at })
      } catch {
        $.ui.toast('Idea Shelf: could not save the idea')
        return
      }
      await publishBadge($)
      $.ui.invalidate('ui.render')
    }

    const remove = async (idea: Row) => {
      await $.store.delete(ideaKey(cwd, idea.id))
      if ((await read($, editing))?.id === idea.id) await update($, editing, () => null)
      await publishBadge($)
      $.ui.invalidate('ui.render')
    }

    const startEdit = async (idea: Row) => {
      await update($, editing, () => ({ id: idea.id, draft: idea.text }))
      $.ui.invalidate('ui.render')
    }

    const finishEdit = async (idea: Row, value: string | undefined) => {
      const text = cleanIdea(value ?? (await read($, editing))?.draft ?? '')
      if (text === null) {
        $.ui.toast('An idea cannot be empty; it was not saved')
        return
      }
      await $.store.set(ideaKey(cwd, idea.id), { text, at: idea.at })
      await update($, editing, () => null)
      $.ui.invalidate('ui.render')
    }

    const cancelEdit = async () => {
      await update($, editing, () => null)
      $.ui.invalidate('ui.render')
    }

    const editor = (idea: Row, index: number) => {
      if (e.surface === 'mobile') return <Text dimColor>Editing needs the terminal or desktop window.</Text>
      const { Input } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Input
            key={`draft:${idea.id}`}
            value={idea.text}
            label={`Idea ${index + 1}`}
            submitLabel="Save"
            onInput={(value: string) => { void update($, editing, state => (state ? { ...state, draft: value } : state)) }}
            onSubmit={(value: string) => finishEdit(idea, value)}
          />
          <Box>
            <Button key={`save:${idea.id}`} label="Save" variant="primary" onPress={() => finishEdit(idea, undefined)} />
            <Button key={`cancel:${idea.id}`} label="Cancel" role="dismiss" onPress={cancelEdit} />
          </Box>
        </Box>
      )
    }

    if (strip !== undefined && isSidebarTab(strip, 'idea-shelf')) {
      const k = sbKit(els, e.surface, sbPalette(strip.theme, strip.colour), e.props.bodyColumns, 0, sbRows(e.props))
      const ask = sbAsker(args => askSidebar($, args), 'idea-shelf', () => closePane($))
      const body: unknown[] = [
        sbTitle(k, { icon: '◇', name: 'Idea Shelf', status: `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'} · ${folder}` }),
      ]
      if (e.surface !== 'mobile') {
        const { Input } = els
        body.push(sbCard(k, 'sb-add', <Input key="add" value="" placeholder="Park an idea" submitLabel="Add" onSubmit={(value: string) => add(value)} />))
      }
      if (ideas.length === 0) body.push(<Text key="sb-empty" color={k.pal.dim}>The shelf is empty.</Text>)
      ideas.forEach((idea, index) => {
        body.push(
          sbCard(
            k,
            `sb-idea:${idea.id}`,
            current?.id === idea.id
              ? editor(idea, index)
              : [
                  sbSplit(k, `sb-text:${idea.id}`, <Text color={k.pal.text}>{idea.text}</Text>, <Text color={k.pal.dim}>{ageOf(now, idea.at)}</Text>),
                  <Box key={`sb-btns:${idea.id}`} columnGap={1}>
                    {sbButton(k, `send:${idea.id}`, 'Send', () => send(idea), true)}
                    {sbButton(k, `edit:${idea.id}`, 'Edit', () => startEdit(idea))}
                    {sbButton(k, `delete:${idea.id}`, e.surface === 'terminal' ? '✕' : 'Delete', () => remove(idea))}
                  </Box>,
                ],
          ),
        )
      })
      return sbFrame(k, strip, sbActions(ask), body)
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>{folder}: {ideas.length} idea(s) on the shelf</Text>
        {ideas.length === 0 && <Text dimColor>{'The shelf is empty. Park an idea with /idea <text>.'}</Text>}
        {ideas.map((idea, index) => (
          <Box key={idea.id} flexDirection="column">
            {current?.id === idea.id ? editor(idea, index) : (
              <Box flexDirection="column">
                <Text>{`${index + 1}. ${idea.text}`}</Text>
                <Box>
                  <Button key={`send:${idea.id}`} label="Send" variant="primary" onPress={() => send(idea)} />
                  <Button key={`edit:${idea.id}`} label="Edit" onPress={() => startEdit(idea)} />
                  <Button key={`delete:${idea.id}`} label="Delete" onPress={() => remove(idea)} />
                </Box>
              </Box>
            )}
          </Box>
        ))}
      </Box>
    )
  })
}

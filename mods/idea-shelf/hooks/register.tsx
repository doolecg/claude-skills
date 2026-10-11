import type { EngineInterface, Register } from 'claude-code'

import type { Board, Idea } from '../types'
import {
  USAGE,
  addIdea,
  checkIdeaText,
  describeCount,
  editIdeaAt,
  editIdeaById,
  newId,
  parseIdeaArgs,
  parseShelf,
  removeIdea,
  shelfKey,
} from './logic'

const PANE = 'ideas'
const board = { plugin: 'idea-shelf', key: 'board' } as const

const EMPTY: Board = { shelf: [], folder: '', editing: null, draft: '', notice: null, sending: [] }

async function getBoard($: EngineInterface): Promise<Board> {
  const { value } = await $.state.get(board)
  return value ?? EMPTY
}

async function patchBoard($: EngineInterface, patch: Partial<Board>): Promise<Board> {
  const next = { ...(await getBoard($)), ...patch }
  await $.state.set(board, next)
  return next
}

async function folderOf($: EngineInterface): Promise<string> {
  try {
    return await $.session.root()
  } catch {
    return await $.session.cwd()
  }
}

async function loadShelf($: EngineInterface, folder: string): Promise<Idea[]> {
  return parseShelf(await $.store.get(shelfKey(folder)))
}

async function saveShelf($: EngineInterface, folder: string, shelf: Idea[]): Promise<void> {
  await $.store.set(shelfKey(folder), shelf)
  await patchBoard($, { shelf, folder })
}

/** Reads the current folder's shelf from the store into the state the pane draws. */
async function refresh($: EngineInterface): Promise<{ folder: string; shelf: Idea[] }> {
  const folder = await folderOf($)
  const shelf = await loadShelf($, folder)
  await patchBoard($, { shelf, folder })
  return { folder, shelf }
}

async function sendIdea($: EngineInterface, id: string): Promise<void> {
  const state = await getBoard($)
  if (state.sending.includes(id)) return
  const { folder, shelf } = await refresh($)
  const idea = shelf.find(one => one.id === id)
  if (!idea) return

  await patchBoard($, { sending: [...state.sending, id], notice: null })
  let failure: string | null = null
  try {
    const result = await $.prompt.submit({ text: idea.text, asUser: true })
    if (result.drop !== undefined) failure = result.drop
  } catch (error) {
    failure = error instanceof Error ? error.message : 'the prompt was not accepted'
  }

  if (failure === null) {
    await saveShelf($, folder, removeIdea(await loadShelf($, folder), id))
  } else {
    $.ui.toast(`Idea not sent: ${failure}`)
  }
  const after = await getBoard($)
  await patchBoard($, { sending: after.sending.filter(one => one !== id) })
}

async function deleteIdea($: EngineInterface, id: string): Promise<void> {
  const { folder, shelf } = await refresh($)
  await saveShelf($, folder, removeIdea(shelf, id))
  const state = await getBoard($)
  if (state.editing === id) await patchBoard($, { editing: null, draft: '', notice: null })
}

async function startEdit($: EngineInterface, id: string): Promise<void> {
  const { shelf } = await refresh($)
  const idea = shelf.find(one => one.id === id)
  if (idea) await patchBoard($, { editing: id, draft: idea.text, notice: null })
}

async function cancelEdit($: EngineInterface): Promise<void> {
  await patchBoard($, { editing: null, draft: '', notice: null })
}

async function saveEdit($: EngineInterface, id: string, text: string): Promise<void> {
  const problem = checkIdeaText(text)
  if (problem) {
    await patchBoard($, { notice: problem })
    return
  }
  const { folder, shelf } = await refresh($)
  const next = editIdeaById(shelf, id, text)
  if (next === null) {
    await patchBoard($, { editing: null, draft: '', notice: 'That idea is no longer on the shelf.' })
    return
  }
  await saveShelf($, folder, next)
  await patchBoard($, { editing: null, draft: '', notice: null })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'idea',
      description: "Park an idea on this project's shelf (no turn starts)",
      argumentHint: '<text> | edit <n> <text>',
      immediate: true,
    })
    await $.command.register({
      name: 'ideas',
      description: "Open this project's idea shelf",
      immediate: true,
    })
    await refresh($)

    return next(e)
  })

  on('command.run', { command: 'idea' }, async ($, e) => {
    const parsed = parseIdeaArgs(e.args)
    if (parsed.kind === 'usage') {
      const { shelf } = await refresh($)
      return { text: `${USAGE} This shelf has ${describeCount(shelf.length)}.` }
    }
    if (parsed.kind === 'error') return { text: parsed.message }

    const problem = checkIdeaText(parsed.text)
    if (problem) return { text: problem }

    const { folder, shelf } = await refresh($)
    if (parsed.kind === 'add') {
      const now = await $.clock.now()
      const next = addIdea(shelf, parsed.text, newId(now, Math.random()), now)
      await saveShelf($, folder, next)
      return { text: `Idea ${next.length} parked. ${describeCount(next.length)} on this shelf. /ideas opens it.` }
    }

    const next = editIdeaAt(shelf, parsed.n, parsed.text)
    if (next === null) {
      return { text: `There is no idea ${parsed.n}. This shelf has ${describeCount(shelf.length)}.` }
    }
    await saveShelf($, folder, next)
    return { text: `Idea ${parsed.n} updated.` }
  })

  on('command.run', { command: 'ideas' }, async $ => {
    const { shelf } = await refresh($)
    const opened = await $.ui.open({ id: PANE, title: 'Idea shelf', focus: true })
    if (opened.isPlaced) return { text: `Idea shelf opened (${describeCount(shelf.length)}).` }

    const lines = shelf.map((idea, i) => `${i + 1}. ${idea.text}`)
    return { text: [`Idea shelf (${describeCount(shelf.length)}):`, ...lines].join('\n') }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const state = await getBoard($)
    const canEdit = e.surface !== 'mobile' && Input !== undefined

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{`Idea shelf: ${describeCount(state.shelf.length)}`}</Text>
        {state.shelf.length === 0 && (
          <Text dimColor>No ideas parked yet. Type /idea followed by your idea to add one.</Text>
        )}
        {state.shelf.map((idea, i) => {
          const isEditing = canEdit && state.editing === idea.id
          const isSending = state.sending.includes(idea.id)

          return (
            <Box key={`idea:${idea.id}`} flexDirection="column">
              {!isEditing && <Text wrap="wrap">{`${i + 1}. ${idea.text}`}</Text>}
              {isEditing && Input && (
                <Box flexDirection="column">
                  <Input
                    key="edit-input"
                    label={`${i + 1}.`}
                    value={state.draft}
                    submitLabel="save"
                    autoFocus
                    onInput={value => {
                      void patchBoard($, { draft: value })
                    }}
                    onSubmit={value => {
                      void saveEdit($, idea.id, value)
                    }}
                  />
                  {state.notice !== null && <Text color="error">{state.notice}</Text>}
                  <Box gap={1}>
                    <Button
                      key="save"
                      label="Save"
                      variant="primary"
                      onPress={async () => {
                        await saveEdit($, idea.id, (await getBoard($)).draft)
                      }}
                    />
                    <Button key="cancel" label="Cancel" onPress={() => cancelEdit($)} />
                  </Box>
                </Box>
              )}
              {!isEditing && isSending && <Text dimColor>Sending...</Text>}
              {!isEditing && !isSending && (
                <Box gap={1}>
                  <Button
                    key={`send:${idea.id}`}
                    label="Send"
                    variant="primary"
                    onPress={() => sendIdea($, idea.id)}
                  />
                  {canEdit ? (
                    <Button key={`edit:${idea.id}`} label="Edit" onPress={() => startEdit($, idea.id)} />
                  ) : (
                    <Text dimColor>{`To edit, type /idea edit ${i + 1} <new text>`}</Text>
                  )}
                  <Button key={`delete:${idea.id}`} label="Delete" onPress={() => deleteIdea($, idea.id)} />
                </Box>
              )}
            </Box>
          )
        })}
        {state.notice !== null && state.editing === null && <Text color="error">{state.notice}</Text>}
        <Text dimColor>/idea adds an idea. /idea edit 1 new text replaces idea 1.</Text>
      </Box>
    )
  })
}

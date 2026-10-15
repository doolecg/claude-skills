// Mod Settings: one side panel in the desktop app with every installed mod's settings, changed in place.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MsRow } from '../types'
import { groupRows, parseValue, pluginRows, shown } from './logic'

const PANE = 'mod-settings'
const TITLE = 'Mod Settings'
const COMMAND = 'doole_settings'
const COLUMNS = 44
const ACCENT = '#D97757'
const DIM = '#8C877E'
const GOOD = '#7FB685'
const WARN = '#D9A54A'

// Text that can hold a path or a command is cut in code to the panel: the app does not always clip a long
// word without spaces, so it would run past the card's edge.
const cut = (text: string, n: number) => (text.length > Math.max(8, n) ? `${text.slice(0, Math.max(8, n) - 1)}…` : text)
const fit = (text: string, n: number) => text.split(/(\s+)/).map(w => cut(w, n)).join('')

const rowsAtom = atom({ plugin: 'mod-settings', key: 'rows' } as const, [] as MsRow[])
const noteAtom = atom({ plugin: 'mod-settings', key: 'note' } as const, '')
const openAtom = atom({ plugin: 'mod-settings', key: 'open' } as const, '')

async function loadRows($: EngineInterface): Promise<void> {
  try {
    const rows = pluginRows(await $.config.list())
    await update($, rowsAtom, () => rows)
  } catch (err) {
    await update($, noteAtom, () => `Could not read the settings: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function change($: EngineInterface, row: MsRow, value: string | number | boolean): Promise<void> {
  try {
    const r = (await $.config.set({ key: row.key, value })) as { deny?: string }
    await update($, noteAtom, () => (r.deny ? `${row.label}: not changed (${r.deny})` : `${row.label} is now ${shown(value)}`))
  } catch (err) {
    await update($, noteAtom, () => `${row.label}: not changed (${err instanceof Error ? err.message : String(err)})`)
  }
  await loadRows($)
}

async function openPane($: EngineInterface): Promise<void> {
  await update($, noteAtom, () => '')
  await loadRows($)
  await $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true, columns: COLUMNS })
}

/** One setting: its name, its help, and the control its kind takes (a locked one only shows its value). */
function control($: EngineInterface, els: Record<string, any>, row: MsRow, hasFields: boolean, room: number) {
  const { Box, Text, Button, Input, Select } = els
  const head = (
    <Box key={`${row.key}:h`} flexDirection="column">
      <Text bold>{fit(row.label, room)}</Text>
      {row.description ? (
        <Text color={DIM} wrap="wrap">
          {fit(row.description, room)}
        </Text>
      ) : null}
    </Box>
  )
  let field
  if (row.isLocked) field = <Text color={DIM}>{fit(`${shown(row.value)} · locked by a managed setting`, room)}</Text>
  else if (row.kind === 'boolean')
    field = (
      <Box flexDirection="row" columnGap={1}>
        <Button key={`${row.key}:on`} label="On" variant={row.value === true ? 'primary' : undefined} onPress={() => void (row.value === true ? null : change($, row, true))} />
        <Button key={`${row.key}:off`} label="Off" variant={row.value === true ? undefined : 'primary'} onPress={() => void (row.value === true ? change($, row, false) : null)} />
      </Box>
    )
  else if (!hasFields) field = <Text color={DIM}>{cut(shown(row.value), room)}</Text>
  else if (row.kind === 'choice')
    field = (
      <Select
        key={`${row.key}:select`}
        value={String(row.value)}
        options={row.options.map(o => ({ value: o, label: o }))}
        onSelect={(v: string) => void (v === String(row.value) ? null : change($, row, v))}
      />
    )
  else
    field = (
      <Input
        key={`${row.key}:input`}
        value={String(row.value)}
        submitLabel="Save"
        onSubmit={(v: string) => {
          const parsed = parseValue(row.kind, v)
          if ('error' in parsed) void update($, noteAtom, () => `${row.label}: ${parsed.error}`)
          else void change($, row, parsed.value)
        }}
      />
    )
  return (
    <Box key={row.key} flexDirection="column" rowGap={1}>
      {head}
      {field}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({ name: COMMAND, description: "Mod Settings: every installed mod's settings in one side panel (desktop app)" })
    return ran
  })

  on('command.run', { command: COMMAND }, async $ => {
    await openPane($)
    return { text: 'Mod Settings is open.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e) as Record<string, any>
    const { Box, Text, Button } = els
    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          <Text color={ACCENT} bold>
            {TITLE}
          </Text>
          <Text color={DIM}>Mod Settings is for the desktop app. In the terminal, type /config.</Text>
        </Box>
      )
    }
    const rows = await read($, rowsAtom)
    const note = await read($, noteAtom)
    const open = await read($, openAtom)
    const groups = groupRows(rows)
    const room = Math.max(16, (e.props.bodyColumns ?? COLUMNS) - 10)
    const hasFields = 'Input' in els && 'Select' in els
    return (
      <Box flexDirection="column" rowGap={1} paddingX={1}>
        <Box key="head" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
          <Box flexDirection="column">
            <Text color={ACCENT} bold>
              {TITLE}
            </Text>
            <Text color={DIM}>{`${groups.length} mod${groups.length === 1 ? '' : 's'} · ${rows.length} setting${rows.length === 1 ? '' : 's'}`}</Text>
          </Box>
          <Button key="refresh" label="Refresh" onPress={() => void loadRows($)} />
        </Box>
        {note ? (
          <Text key="note" color={note.includes('not changed') || note.includes('Could not') || note.includes('Enter a') ? WARN : GOOD} wrap="wrap">
            {fit(note, room)}
          </Text>
        ) : null}
        {groups.length === 0 ? (
          <Text key="empty" color={DIM} wrap="wrap">
            No installed mod has settings yet.
          </Text>
        ) : null}
        {groups.map(g => {
          const isOpen = open === g.plugin
          return (
            <Box key={`mod:${g.plugin}`} flexDirection="column" borderStyle="round" borderColor={isOpen ? ACCENT : DIM} paddingX={1} rowGap={1}>
              <Box key={`mod:${g.plugin}:head`} flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
                <Box flexShrink={1} minWidth={0}>
                  <Button key={`mod:${g.plugin}:toggle`} plain onPress={() => void update($, openAtom, () => (isOpen ? '' : g.plugin))}>
                    <Text bold color={isOpen ? ACCENT : undefined}>{`${isOpen ? '▾' : '▸'} ${cut(g.title, room - 14)}`}</Text>
                  </Button>
                </Box>
                <Box flexShrink={0}>
                  <Text color={DIM}>{`${g.rows.length} setting${g.rows.length === 1 ? '' : 's'}`}</Text>
                </Box>
              </Box>
              {isOpen ? g.rows.map(r => control($, els, r, hasFields, room)) : null}
            </Box>
          )
        })}
      </Box>
    )
  })
}

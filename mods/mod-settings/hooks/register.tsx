// Mod Settings: one side panel in the desktop app with every installed mod's settings, changed in place.
// It is also the last tab of the Main Menu (the Sidebar mod): when the menu's strip names this tab, the pane opens at
// the menu's width and draws the strip above its own content.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, StateWrite } from 'claude-code'

import type { MsRow } from '../types'
import { groupRows, parseValue, pluginRows, shown } from './logic'
import { SIDEBAR_COLUMNS, isSidebarTab, sbActions, sbAsker, sbButton, sbFrame, sbKit, sbPaneMove, sbPalette, sbRows, sbTitle } from './sidebar-kit'
import type { SbStrip } from './sidebar-kit'

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
const askAtom = atom({ plugin: 'mod-settings', key: 'sidebarAsk' } as const, { args: '', n: 0 })

/** Asks the Main Menu to do what `/sidebar <args>` does, through this mod's own state: no command is run. */
const askSidebar = ($: EngineInterface, args: string) => update($, askAtom, v => ({ args, n: (v?.n ?? 0) + 1 }))

/** The Main Menu's strip, or undefined when the Sidebar mod is not installed. */
async function readStrip($: EngineInterface): Promise<SbStrip | undefined> {
  try {
    return (await $.state.get({ plugin: 'sidebar', key: 'strip' } as const)).value
  } catch {
    return undefined
  }
}

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

async function openPane($: EngineInterface, columns = COLUMNS): Promise<void> {
  await update($, noteAtom, () => '')
  await loadRows($)
  await $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true, columns })
}

async function closePane($: EngineInterface): Promise<void> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.close({ id: PANE })
}

/** One setting: its name, its help, and the control its kind takes (a locked one only shows its value). */
function control($: EngineInterface, els: Record<string, any>, row: MsRow, hasFields: boolean, room: number, dim = DIM) {
  const { Box, Text, Button, Input, Select } = els
  const head = (
    <Box key={`${row.key}:h`} flexDirection="column">
      <Text bold>{fit(row.label, room)}</Text>
      {row.description ? (
        <Text color={dim} wrap="wrap">
          {fit(row.description, room)}
        </Text>
      ) : null}
    </Box>
  )
  let field
  if (row.isLocked) field = <Text color={dim}>{fit(`${shown(row.value)} · locked by a managed setting`, room)}</Text>
  else if (row.kind === 'boolean')
    field = (
      <Box flexDirection="row" columnGap={1}>
        <Button key={`${row.key}:on`} label="On" variant={row.value === true ? 'primary' : undefined} onPress={() => void (row.value === true ? null : change($, row, true))} />
        <Button key={`${row.key}:off`} label="Off" variant={row.value === true ? undefined : 'primary'} onPress={() => void (row.value === true ? change($, row, false) : null)} />
      </Box>
    )
  else if (!hasFields) field = <Text color={dim}>{cut(shown(row.value), room)}</Text>
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
    // With the Main Menu up, Mod Settings is its last tab: ask for that tab, and the pane follows the strip.
    const strip = await readStrip($)
    if (strip?.isOn) {
      if (strip.active !== PANE) await askSidebar($, `tab ${PANE}`)
      else await openPane($, SIDEBAR_COLUMNS)
    } else await openPane($)
    return { text: 'Mod Settings is open.' }
  })

  // The Main Menu's strip names this tab, or moves on from it: the pane opens or closes with it.
  on('state.set', { key: 'strip' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = e as unknown as StateWrite
    const move = w.plugin === 'sidebar' ? sbPaneMove(PANE, w.value, w.previous) : undefined
    try {
      if (move === 'open') await openPane($, SIDEBAR_COLUMNS)
      else if (move === 'close') await closePane($)
    } catch {}
    return ran
  }).catch(($, e, next) => next(e))

  // The person closing the tab pane takes the Main Menu down with it.
  on('ui.close', async ($, e, next) => {
    const ran = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') {
      const strip = await readStrip($)
      if (strip?.isOn && strip.active === PANE) {
        try {
          await askSidebar($, `closed ${PANE}`)
        } catch {}
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e) as Record<string, any>
    const { Box, Text, Button } = els
    const strip = await readStrip($)
    const isTab = isSidebarTab(strip, PANE)
    const k = isTab ? sbKit(els, e.surface, sbPalette(strip!.theme, strip!.colour), e.props.bodyColumns, 0, sbRows(e.props)) : undefined
    const accent = k?.pal.accent ?? ACCENT
    const dim = k?.pal.dim ?? DIM
    const good = k?.pal.good ?? GOOD
    const warn = k?.pal.warn ?? WARN
    if (e.surface === 'terminal') {
      const note = 'Mod Settings is for the desktop app. In the terminal, type /config.'
      if (k && strip) {
        const ask = sbAsker(args => askSidebar($, args), PANE, () => closePane($))
        return sbFrame(k, strip, sbActions(ask), [
          sbTitle(k, { icon: '⚙', name: TITLE }),
          <Text key="terminal-note" color={dim} wrap="wrap">
            {note}
          </Text>,
        ])
      }
      return (
        <Box flexDirection="column">
          <Text color={accent} bold>
            {TITLE}
          </Text>
          <Text color={dim}>{note}</Text>
        </Box>
      )
    }
    const rows = await read($, rowsAtom)
    const noteText = await read($, noteAtom)
    const open = await read($, openAtom)
    const groups = groupRows(rows)
    const room = Math.max(16, (e.props.bodyColumns ?? COLUMNS) - 10)
    const hasFields = 'Input' in els && 'Select' in els
    const counts = `${groups.length} mod${groups.length === 1 ? '' : 's'} · ${rows.length} setting${rows.length === 1 ? '' : 's'}`
    const body = [
      !k ? (
        <Box key="head" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
          <Box flexDirection="column">
            <Text color={accent} bold>
              {TITLE}
            </Text>
            <Text color={dim}>{counts}</Text>
          </Box>
          <Button key="refresh" label="Refresh" onPress={() => void loadRows($)} />
        </Box>
      ) : (
        sbTitle(k, { icon: '⚙', name: TITLE, status: counts })
      ),
      noteText ? (
        <Text key="note" color={noteText.includes('not changed') || noteText.includes('Could not') || noteText.includes('Enter a') ? warn : good} wrap="wrap">
          {fit(noteText, room)}
        </Text>
      ) : null,
      groups.length === 0 ? (
        <Text key="empty" color={dim} wrap="wrap">
          No installed mod has settings yet.
        </Text>
      ) : null,
      ...groups.map(g => {
        const isOpen = open === g.plugin
        return (
          <Box key={`mod:${g.plugin}`} flexDirection="column" borderStyle="round" borderColor={isOpen ? accent : dim} paddingX={1} rowGap={1}>
            <Box key={`mod:${g.plugin}:head`} flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
              <Box flexShrink={1} minWidth={0}>
                <Button key={`mod:${g.plugin}:toggle`} plain onPress={() => void update($, openAtom, () => (isOpen ? '' : g.plugin))}>
                  <Text bold color={isOpen ? accent : undefined}>{`${isOpen ? '▾' : '▸'} ${cut(g.title, room - 14)}`}</Text>
                </Button>
              </Box>
              <Box flexShrink={0}>
                <Text color={dim}>{`${g.rows.length} setting${g.rows.length === 1 ? '' : 's'}`}</Text>
              </Box>
            </Box>
            {isOpen ? g.rows.map(r => control($, els, r, hasFields, room, dim)) : null}
          </Box>
        )
      }),
    ]
    if (k && strip) {
      const ask = sbAsker(args => askSidebar($, args), PANE, () => closePane($))
      body.push(
        <Box key="refresh-row" marginTop={1}>
          {sbButton(k, 'refresh', 'Refresh', () => void loadRows($))}
        </Box>,
      )
      return sbFrame(k, strip, sbActions(ask), body)
    }
    return (
      <Box flexDirection="column" rowGap={1} paddingX={1}>
        {body}
      </Box>
    )
  })
}

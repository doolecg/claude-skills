// The /learn pane: Lessons, Drafts, Skills, Changes, Runs and Soul tabs, drawn from the surface's own elements.

import type { Elements } from 'claude-code'

import type { PaneUi } from '../types'
import { unifiedDiff } from './core/diff'
import type { HindsightState } from './core/hindsight'
import { folderKey } from './core/paths'
import type { Settings } from './core/settings'
import { afterChange, cardStats, correctionRate, trend } from './core/skills'
import { parseSoul, SECTION_ORDER, SECTION_TITLES } from './core/soul'
import { LESSON_KINDS, runLine, type Lesson, type State } from './core/state'
import { similarity } from './core/text'
import { sbActions, sbButton, sbCard, sbFrame, sbKit, sbTitle, type SbPalette, type SbStrip } from './sidebar-kit'

export type PaneActions = {
  set: (patch: Partial<PaneUi>) => Promise<unknown>
  approveLesson: (id: number) => Promise<void>
  rejectLesson: (id: number) => Promise<void>
  editLesson: (id: number, text: string) => Promise<void>
  mergeLessons: (keep: number, ids: number[]) => Promise<void>
  moveLesson: (id: number, to: 'user' | 'project') => Promise<void>
  deleteLessons: (ids: number[]) => Promise<void>
  approveDraft: (id: number) => Promise<void>
  rejectDraft: (id: number) => Promise<void>
  reloadDraft: (id: number) => Promise<void>
  rollback: (id: number) => Promise<void>
  soulAdd: (section: string, text: string) => Promise<void>
  soulEdit: (before: string, after: string) => Promise<void>
  soulRemove: (text: string) => Promise<void>
  soulPending: (id: string, take: boolean) => Promise<void>
  soulSync: () => Promise<void>
  test: () => Promise<void>
}

export type PaneData = {
  state: State
  soulText: string | null
  ui: PaneUi
  settings: Settings
  loads: Record<string, number>
  folder: string
  soulFile: string
  draftsDir: string
  hindsight: HindsightState | null
  actions: PaneActions
  /** Set when the pane is drawn as the Sidebar's Self Improve tab. */
  sb?: { strip: SbStrip; pal: SbPalette; columns: number; surface: string; ask: (args: string) => void }
}

// The surface's element table; Input and Select are drawn only where the surface has them (not on mobile).
export type Els = Elements['desktop']

const TABS: { id: PaneUi['tab']; label: string }[] = [
  { id: 'lessons', label: 'Lessons' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'skills', label: 'Skills' },
  { id: 'changes', label: 'Changes' },
  { id: 'runs', label: 'Runs' },
  { id: 'soul', label: 'Soul' },
]

const when = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 16)
const cut = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const storeOf = (l: Lesson): string =>
  l.status !== 'active' ? l.status : l.scope === 'user' ? 'soul' : l.hindsightPending ? 'waiting for Hindsight' : l.stores.join(', ') || 'none'

export function filterLessons(lessons: readonly Lesson[], ui: Pick<PaneUi, 'kind' | 'store' | 'query'>, folder: string): Lesson[] {
  const q = ui.query.trim().toLowerCase()
  return lessons
    .filter(l => l.status !== 'deleted' && l.status !== 'rejected')
    .filter(l => l.scope === 'user' || !folder || (l.folder ? folderKey(l.folder) === folderKey(folder) : true))
    .filter(l => ui.kind === 'all' || l.kind === ui.kind)
    .filter(l => {
      switch (ui.store) {
        case 'pending': return l.status === 'pending'
        case 'project': return l.status === 'active' && l.scope === 'project'
        case 'soul': return l.scope === 'user'
        case 'hindsight': return l.stores.includes('hindsight')
        case 'waiting': return l.hindsightPending
        case 'stale': return l.status === 'stale'
        default: return true
      }
    })
    .filter(l => !q || l.text.toLowerCase().includes(q) || l.files.some(f => f.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.updatedAt - a.updatedAt)
}

export function drawPane(els: Els, surface: string, d: PaneData) {
  const { Box, Text, Button, Code, Input, Select } = els
  const hasInput = surface !== 'mobile'
  const { state, ui, actions: a } = d
  const pendingLessons = state.lessons.filter(l => l.status === 'pending').length
  const pendingDrafts = state.drafts.filter(x => x.status === 'pending').length
  const flagged = Object.entries(state.skills).filter(([, c]) => c.flagged)

  const k = d.sb ? sbKit(els, d.sb.surface, d.sb.pal, d.sb.columns, 0) : null

  // Buttons and item cards take the sidebar's look when the pane is a tab there.
  const btn = (key: string, label: string, onPress: () => void, primary = false) =>
    k ? sbButton(k, key, label, onPress, primary) : <Button key={key} label={label} variant={primary ? 'primary' : undefined} onPress={onPress} />
  const card = (key: string, children: unknown) =>
    k ? sbCard(k, key, children) : (
      <Box key={key} flexDirection="column" marginTop={1}>
        {children}
      </Box>
    )

  const input = (key: string, value: string, label: string, onSubmit: (v: string) => void) => {
    if (!hasInput) return <Text dimColor>Editing needs the terminal or the desktop app.</Text>
    return <Input key={key} value={value} label={label} submitLabel="Save" onSubmit={(v: string) => onSubmit(v)} />
  }

  const select = (key: string, value: string, label: string, options: { value: string; label: string }[], onSelect: (v: string) => void) => {
    if (!hasInput) return null
    return <Select key={key} value={value} label={label} options={options} onSelect={(v: string) => onSelect(v)} />
  }

  const confirmRow = () =>
    ui.confirm ? (
      <Box key="confirm">
        <Text color="yellow">{ui.confirm.label} </Text>
        <Button
          key="confirm-yes"
          label="Confirm"
          variant="primary"
          onPress={() => {
            const c = ui.confirm!
            if (c.action === 'rollback') void a.rollback(c.ids[0]!)
            else void a.deleteLessons(c.ids)
          }}
        />
        <Button key="confirm-no" label="Cancel" onPress={() => void a.set({ confirm: null })} />
      </Box>
    ) : null

  const lessonsTab = () => {
    const list = filterLessons(state.lessons, ui, d.folder)
    const stale = state.lessons.filter(l => l.status === 'stale')
    return (
      <Box flexDirection="column">
        <Box>
          {select('kind', ui.kind, 'Kind', [{ value: 'all', label: 'All kinds' }, ...LESSON_KINDS.map(k => ({ value: k, label: k }))], v => void a.set({ kind: v }))}
          {select('store', ui.store, 'Store', [
            { value: 'all', label: 'All' },
            { value: 'pending', label: 'Waiting for review' },
            { value: 'project', label: 'Project memory' },
            { value: 'soul', label: 'soul.md' },
            { value: 'hindsight', label: 'In Hindsight' },
            { value: 'waiting', label: 'Waiting for Hindsight' },
            { value: 'stale', label: 'Stale' },
          ], v => void a.set({ store: v }))}
        </Box>
        {input('search', ui.query, 'Search', v => void a.set({ query: v }))}
        {stale.length > 0 && (
          <Button key="delete-stale" label={`Delete stale (${stale.length})`} onPress={() => void a.set({ confirm: { action: 'delete-stale', ids: stale.map(l => l.id), label: `Delete ${stale.length} stale lesson${stale.length === 1 ? '' : 's'}?` } })} />
        )}
        {list.length === 0 && <Text dimColor>No lessons match.</Text>}
        {list.slice(0, 30).map(l => {
          const editKey = `lesson:${l.id}`
          const similar = list.filter(o => o.id !== l.id && o.scope === l.scope && o.status === l.status && similarity(o.text, l.text) >= 0.4)
          return (
            card(`l${l.id}`, [
              <Text key="text">
                <Text bold>#{l.id}</Text> <Text color="cyan">[{l.kind}]</Text> {l.text}
              </Text>,
              <Text key="meta" dimColor>
                {l.scope === 'user' ? 'about you' : l.folder ? 'this project' : `project ${l.project}`} · {storeOf(l)}
                {l.reviewReason ? ` · waits: ${l.reviewReason}` : ''}
                {l.files.length ? ` · ${cut(l.files.join(', '), 60)}` : ''} · seen {l.hits}x
              </Text>,
              ui.editing?.key === editKey ? (
                <Box key="editing" flexDirection="column">
                  {input(`edit-${l.id}`, ui.editing.value, `Lesson ${l.id}`, v => void a.editLesson(l.id, v))}
                  {btn(`edit-cancel-${l.id}`, 'Cancel', () => void a.set({ editing: null }))}
                </Box>
              ) : (
                <Box key="actions" flexWrap="wrap">
                  {l.status === 'pending' && btn(`approve-${l.id}`, 'Approve', () => void a.approveLesson(l.id), true)}
                  {l.status === 'pending' && btn(`reject-${l.id}`, 'Reject', () => void a.rejectLesson(l.id))}
                  {btn(`edit-${l.id}`, 'Edit', () => void a.set({ editing: { key: editKey, value: l.text } }))}
                  {btn(`move-${l.id}`, l.scope === 'user' ? 'Move to project' : 'Move to soul.md', () => void a.moveLesson(l.id, l.scope === 'user' ? 'project' : 'user'))}
                  {similar.length > 0 && btn(`merge-${l.id}`, `Merge ${similar.length} similar`, () => void a.mergeLessons(l.id, similar.map(o => o.id)))}
                  {btn(`delete-${l.id}`, 'Delete', () => void a.set({ confirm: { action: 'delete-lessons', ids: [l.id], label: `Delete lesson #${l.id} (1 lesson)?` } }))}
                </Box>
              ),
            ])
          )
        })}
        {list.length > 30 && <Text dimColor>+{list.length - 30} more; narrow the filter.</Text>}
      </Box>
    )
  }

  const draftsTab = () => {
    const list = state.drafts.filter(x => x.status === 'pending' || x.status === 'approved').slice(-20).reverse()
    return (
      <Box flexDirection="column">
        <Text dimColor>Edit a draft in its file under {d.draftsDir}, then press Reload. Approve installs it.</Text>
        {list.length === 0 && <Text dimColor>No skill drafts yet. Procedures seen in two or more sessions, and corrections that name a skill, become drafts.</Text>}
        {list.map(x =>
          card(`d${x.id}`, [
            <Text key="name">
              <Text bold>{x.name}</Text> <Text dimColor>({x.kind}{x.isOverride ? ', local override of a plugin skill' : ''}, {x.status})</Text>
            </Text>,
            <Text key="valid" color={x.validation ? 'yellow' : 'green'}>{x.validation ? `Fails validation: ${x.validation}` : 'Passes validation'}</Text>,
            <Code key={`diff-${x.id}`} source={unifiedDiff(x.previousBody ?? (x.kind === 'new' ? '' : x.previousBody ?? ''), x.body)} format="diff" />,
            x.status === 'pending' && (
              <Box key="actions">
                {btn(`dapprove-${x.id}`, 'Approve', () => void a.approveDraft(x.id), true)}
                {btn(`dreload-${x.id}`, 'Reload (after edit)', () => void a.reloadDraft(x.id))}
                {btn(`dreject-${x.id}`, 'Reject', () => void a.rejectDraft(x.id))}
              </Box>
            ),
          ]),
        )}
      </Box>
    )
  }

  const skillsTab = () => {
    const names = [...new Set([...Object.keys(state.skills), ...Object.keys(d.loads)])].sort()
    return (
      <Box flexDirection="column">
        {flagged.map(([name]) => {
          const change = [...state.changes].reverse().find(c => c.kind === 'skill' && c.status === 'applied' && c.title.endsWith(name))
          return (
            <Box key={`flag-${name}`}>
              <Text color="yellow">Skill {name} got worse after the change — roll back? </Text>
              {change && <Button key={`flag-roll-${name}`} label="Roll back" onPress={() => void a.set({ confirm: { action: 'rollback', ids: [change.id], label: `Roll back "${change.title}"?` } })} />}
            </Box>
          )
        })}
        {names.length === 0 && <Text dimColor>No skill loads seen yet.</Text>}
        {names.map(name => {
          const card = state.skills[name] ?? { loads: 0, uses: [], changedAt: null, flagged: false }
          const st = cardStats(card)
          const rate = Math.round(correctionRate(card.uses) * 100)
          const after = afterChange(card)
          return (
            <Box key={`s-${name}`} flexDirection="column" marginTop={1}>
              <Text bold>{name}</Text>
              <Text dimColor>
                loaded {d.loads[name] ?? 0}x · {st.sessions} sessions learned from · corrected in {st.corrected} ({rate}% of the last 5) · {st.interrupts} interrupts · {st.failures} tool failures in the loading turn
                {st.avgTurnsToEnd !== null ? ` · ${st.avgTurnsToEnd} turns from load to the end` : ''} · trend: {trend(card)}
                {after === 'waiting' ? ' · changed, waiting for 5 sessions to compare' : after === 'ok' ? ' · the change held up' : ''}
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  }

  const changesTab = () => {
    const list = [...state.changes].reverse().slice(0, 40)
    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No changes yet.</Text>}
        {list.map(c => (
          <Box key={`c${c.id}`} flexDirection="column" marginTop={1}>
            <Text>
              <Text dimColor>{when(c.at)} </Text>
              {cut(c.title, 140)} <Text dimColor>({c.auto ? 'automatic' : 'approved'}{c.status === 'rolledBack' ? ', rolled back' : ''})</Text>
            </Text>
            {c.before && <Text color="red">- {cut(c.before.replace(/\s+/g, ' '), 200)}</Text>}
            {c.after && <Text color="green">+ {cut(c.after.replace(/\s+/g, ' '), 200)}</Text>}
            {c.status === 'applied' && <Button key={`roll-${c.id}`} label="Roll back" onPress={() => void a.set({ confirm: { action: 'rollback', ids: [c.id], label: `Roll back "${cut(c.title, 60)}"?` } })} />}
          </Box>
        ))}
      </Box>
    )
  }

  const runsTab = () => {
    const list = [...state.runs].reverse().slice(0, 25)
    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No runs yet. /done, /learn-now, or closing a session with edits starts one.</Text>}
        {list.map(r => (
          <Text key={`r${r.id}`} color={r.error && !r.error.startsWith('Skipped') ? 'yellow' : undefined}>
            {runLine(r).slice(2)}
          </Text>
        ))}
      </Box>
    )
  }

  const soulTab = () => {
    const doc = parseSoul(d.soulText)
    const sections = SECTION_ORDER.map(k => SECTION_TITLES[k])
    for (const sec of doc.sections) if (!sections.includes(sec.title)) sections.push(sec.title)
    const hs = d.hindsight
    return (
      <Box flexDirection="column">
        <Text dimColor>
          {d.soulFile} · Soul Bank: {d.settings.soulBank} · {hs ? (hs.on ? 'Hindsight connected' : `Hindsight ${hs.reason}`) : 'Hindsight not checked yet'}
          {state.soul.lastSync ? ` · last sync ${when(state.soul.lastSync)}` : ''}
          {state.soul.lastError ? ` · ${state.soul.lastError}` : ''}
        </Text>
        <Button key="soul-sync" label="Sync with the Soul Bank" onPress={() => void a.soulSync()} />
        {state.soul.pending.length > 0 && <Text bold>From the Soul Bank, waiting for you ({state.soul.pending.length})</Text>}
        {state.soul.pending.slice(0, 15).map(p => (
          <Box key={`sp-${p.id}`}>
            <Text>
              {cut(p.text, 160)} <Text dimColor>({p.section})</Text>{' '}
            </Text>
            <Button key={`sp-add-${p.id}`} label="Add" onPress={() => void a.soulPending(p.id, true)} />
            <Button key={`sp-skip-${p.id}`} label="Skip" onPress={() => void a.soulPending(p.id, false)} />
          </Box>
        ))}
        {doc.sections.map(sec => (
          <Box key={`sec-${sec.title}`} flexDirection="column" marginTop={1}>
            <Text bold>{sec.title}</Text>
            {sec.lines
              .map(line => /^\s*[-*]\s+(.*\S)\s*$/.exec(line)?.[1])
              .filter((x): x is string => !!x)
              .map((fact, i) => {
                const key = `soul:${sec.title}:${i}`
                return ui.editing?.key === key ? (
                  <Box key={key} flexDirection="column">
                    {input(`soul-edit-${sec.title}-${i}`, fact, 'Fact', v => void a.soulEdit(fact, v))}
                    <Button key={`soul-cancel-${sec.title}-${i}`} label="Cancel" onPress={() => void a.set({ editing: null })} />
                  </Box>
                ) : (
                  <Box key={key}>
                    <Text>- {fact} </Text>
                    <Button key={`soul-e-${sec.title}-${i}`} label="Edit" plain onPress={() => void a.set({ editing: { key, value: fact } })} />
                    <Button key={`soul-r-${sec.title}-${i}`} label="Remove" plain onPress={() => void a.soulRemove(fact)} />
                  </Box>
                )
              })}
          </Box>
        ))}
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Add a fact</Text>
          {select('soul-section', ui.section, 'Section', sections.map(t => ({ value: t, label: t })), v => void a.set({ section: v }))}
          {input('soul-new', '', 'New fact', v => void a.soulAdd(ui.section, v))}
        </Box>
      </Box>
    )
  }

  const body = { lessons: lessonsTab, drafts: draftsTab, skills: skillsTab, changes: changesTab, runs: runsTab, soul: soulTab }[ui.tab]

  const tabLabel = (t: (typeof TABS)[number]) =>
    t.id === 'lessons' && pendingLessons ? `${t.label} (${pendingLessons})` : t.id === 'drafts' && pendingDrafts ? `${t.label} (${pendingDrafts})` : t.id === 'skills' && flagged.length ? `${t.label} (!)` : t.id === 'soul' && state.soul.pending.length ? `${t.label} (${state.soul.pending.length})` : t.label
  const modeLine = <Text dimColor>Mode: {d.settings.mode}{d.settings.mode === 'suggest' ? ' (everything waits for you)' : ''} · learn model: {d.settings.learnModel}</Text>

  if (k && d.sb) {
    const { pal } = k
    const waiting = pendingLessons + pendingDrafts
    const chip = (key: string, label: string, isActive: boolean, onPress: () => void) => (
      <Button key={key} plain onPress={onPress}>
        <Text backgroundColor={isActive ? pal.pillBg : undefined} color={isActive ? pal.pillFg : pal.dim} bold={isActive}>{` ${label} `}</Text>
      </Button>
    )
    return sbFrame(k, d.sb.strip, sbActions(d.sb.ask), [
      sbTitle(k, { icon: '✺', name: 'Self Improve', status: waiting ? `${waiting} to review` : `mode ${d.settings.mode}` }, { label: 'Settings', onPress: () => d.sb!.ask('settings self-improve') }),
      <Box key="tabs" flexWrap="wrap">
        {TABS.map(t => chip(`tab-${t.id}`, tabLabel(t), ui.tab === t.id, () => void a.set({ tab: t.id, editing: null, confirm: null })))}
        {chip('test', 'Test', false, () => void a.test())}
      </Box>,
      <Box key="mode">{modeLine}</Box>,
      ui.message ? <Text key="message" color="cyan">{ui.message}</Text> : null,
      confirmRow(),
      <Box key="body" flexDirection="column">
        {body()}
      </Box>,
    ])
  }

  return (
    <Box flexDirection="column">
      <Box flexWrap="wrap">
        {TABS.map(t => (
          <Button
            key={`tab-${t.id}`}
            label={tabLabel(t)}
            variant={ui.tab === t.id ? 'primary' : undefined}
            onPress={() => void a.set({ tab: t.id, editing: null, confirm: null })}
          />
        ))}
        <Button key="test" label="Test" onPress={() => void a.test()} />
      </Box>
      {modeLine}
      {ui.message ? <Text color="cyan">{ui.message}</Text> : null}
      {confirmRow()}
      {body()}
    </Box>
  )
}

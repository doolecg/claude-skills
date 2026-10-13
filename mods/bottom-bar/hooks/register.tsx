import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BarFigures, BarTool } from '../types'
import {
  EFFORTS,
  EMPTY_FIGURES,
  SEPARATOR,
  clip,
  effortLabel,
  modelChoiceLabel,
  modelChoices,
  modelName,
  paletteFor,
  pillPad,
  stateFromReply,
  pickerSections,
  sameFigures,
  segmentOffset,
  segments,
  toolLabel,
} from './bar-logic'

const LABEL = "Doole's Tools"
const PICKER = 'bottom-bar-tools'

const figures = atom({ plugin: 'bottom-bar', key: 'figures' } as const, EMPTY_FIGURES)
const theme = atom({ plugin: 'bottom-bar', key: 'theme' } as const, 'dark')
const menu = atom({ plugin: 'bottom-bar', key: 'menu' } as const, '')
const isWorking = atom({ plugin: 'bottom-bar', key: 'isWorking' } as const, false)
const models = atom({ plugin: 'bottom-bar', key: 'models' } as const, [])
const tools = atom({ plugin: 'bottom-bar', key: 'tools' } as const, [])
const toolStates = atom({ plugin: 'bottom-bar', key: 'toolStates' } as const, {})
const choices = atom({ plugin: 'bottom-bar', key: 'choices' } as const, [])
const filter = atom({ plugin: 'bottom-bar', key: 'filter' } as const, '')

type Dollar = EngineInterface

async function setFigures($: Dollar, change: (f: BarFigures) => BarFigures): Promise<void> {
  const now = await read($, figures)
  const next = change(now)
  if (!sameFigures(now, next)) await update($, figures, () => next)
}

async function fromSettings($: Dollar, modelId: string): Promise<void> {
  const s = (await $.settings.read()) as Record<string, any>
  const effort = effortLabel(s.modelSettings?.[modelId.replace(/\[[^\]]*\]$/, '')]?.effortLevel ?? s.effortLevel)
  if (typeof s.theme === 'string' && s.theme !== (await read($, theme))) {
    await update($, theme, () => s.theme)
  }
  if (effort) await setFigures($, f => ({ ...f, effort }))
}

async function refresh($: Dollar, opts: { settings?: boolean } = {}): Promise<void> {
  try {
    const [usage, modelId, agents] = await Promise.all([
      $.session.usage(),
      $.session.model(),
      $.agent.list(),
    ])
    if (opts.settings) await fromSettings($, modelId)
    const five = usage.rateLimits.find(r => r.kind === 'five_hour')
    await setFigures($, f => ({
      ...f,
      model: modelName(modelId),
      window: usage.context.window,
      ctx: usage.context.percent ?? f.ctx,
      fiveHour: five ? five.percentUsed : f.fiveHour,
      agents: agents.filter(a => a.status === 'running' || a.status === 'pending' || a.status === 'waiting').length,
    }))
  } catch {}
}

async function loadChoices($: Dollar): Promise<void> {
  const list = await $.command.list()
  const all: BarTool[] = list
    .filter(c => c.plugin !== 'bottom-bar')
    .map(c => ({ name: c.name, description: c.description, plugin: c.plugin ?? c.source, source: c.source }))
  await update($, choices, () => all)
}

async function loadModels($: Dollar): Promise<void> {
  const row = (await $.config.list()).find(r => r.key === 'model')
  const list = modelChoices(row?.options)
  await update($, models, () => list)
}

async function pickModel($: Dollar, alias: string): Promise<void> {
  await update($, menu, () => '')
  const set = await $.config.set({ key: 'model', value: alias })
  if (set.deny !== undefined) $.ui.toast(`Could not change the model: ${set.deny}`)
  await refresh($, { settings: true })
}

async function pickEffort($: Dollar, level: string): Promise<void> {
  await update($, menu, () => '')
  try {
    await $.command.run({ command: 'effort', args: level })
    await setFigures($, f => ({ ...f, effort: level }))
  } catch {
    $.ui.toast(`Could not set effort to ${level}`)
  }
}

async function noteReply($: Dollar, command: string, ran: unknown): Promise<void> {
  const text = (ran as { text?: unknown } | undefined)?.text
  const state = typeof text === 'string' ? stateFromReply(text) : undefined
  if (state) await update($, toolStates, all => ({ ...all, [command]: state }))
}

async function saveTools($: Dollar, list: string[]): Promise<void> {
  await update($, tools, () => list)
  await $.store.set('tools', list)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    const saved = await $.store.get('tools')
    if (Array.isArray(saved)) {
      await update($, tools, () => saved.filter((x): x is string => typeof x === 'string'))
    }
    await refresh($, { settings: true })
    try {
      await loadModels($)
    } catch {}
    $.clock.every(4000, () => void refresh($))
    return ran
  })

  on('session.measure', async ($, e, next) => {
    const five = e.rateLimits.find(r => r.kind === 'five_hour')
    await setFigures($, f => ({
      ...f,
      window: e.context.window || f.window,
      ctx: e.context.percent ?? f.ctx,
      fiveHour: five ? five.percentUsed : f.fiveHour,
    }))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) {
      const effort = effortLabel(e.effort)
      void setFigures($, f => ({ ...f, effort })).catch(() => {})
    }
    return yield* next(e)
  })

  // The spinner repaints its rows every frame, over a box floated onto them.
  on('turn.start', async ($, e, next) => {
    await update($, isWorking, () => true)
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isWorking, () => false)
    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    const ran = await next(e)
    void refresh($, { settings: true })
    return ran
  })

  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (['model', 'effort', 'config', 'theme'].includes(e.command)) void refresh($, { settings: true })
    if ((await read($, tools)).includes(e.command)) await noteReply($, e.command, ran)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const pal = paletteFor(await read($, theme))
    const f = await read($, figures)
    const chosen = await read($, tools)
    const shown = await read($, menu)
    const loaded = await read($, models)
    const modelList = loaded.length > 0 ? loaded : modelChoices(undefined)

    const modes = e.props.modes.length > 0 ? `${e.props.modes.join(' & ')}  ` : ''
    const toggleMenu = (which: string) => update($, menu, now => (now === which ? '' : which))

    // One row that clips: a segment with no room wraps onto the hidden second row.
    const segs = segments(f, pal)
    const row = segs.map((seg, i) => (
      <Box flexShrink={0}>
        {i > 0 ? <Text color={pal.sep}>{SEPARATOR}</Text> : null}
        {seg.parts.map(p => {
          const text = (
            <Text color={p.color} bold={p.bold}>
              {p.text}
            </Text>
          )
          return p.isPress ? (
            <Button key={seg.key} plain onPress={() => void toggleMenu(seg.key)}>
              {text}
            </Button>
          ) : (
            text
          )
        })}
      </Box>
    ))

    const runTool = async (name: string) => {
      await update($, menu, () => '')
      try {
        await noteReply($, name, await $.command.run({ command: name, args: '' }))
      } catch {
        $.ui.toast(`/${name} is not available. Is its mod still installed?`)
      }
    }
    const openPicker = async () => {
      await update($, menu, () => '')
      await update($, filter, () => '')
      await loadChoices($)
      await $.ui.open({ id: PICKER, title: LABEL, focus: true, closeOnEscape: true })
    }

    const states = await read($, toolStates)
    const pill = (key: string, label: string, onPress: () => void, opts: { mark?: string; state?: string } = {}) => {
      const lead = opts.mark ?? (opts.state === 'on' ? '✓' : '')
      const [left, right] = pillPad([...label].length + (lead ? 2 : 0))
      const leadColor = opts.mark ? pal.accent : pal.good
      return (
        <Button key={key} plain onPress={onPress}>
          <Text color={pal.pillBg}>◖</Text>
          <Text backgroundColor={pal.pillBg}>{left}</Text>
          {lead ? (
            <Text color={leadColor} backgroundColor={pal.pillBg}>
              {`${lead} `}
            </Text>
          ) : null}
          <Text color={opts.state === 'off' ? pal.dim : pal.pillFg} backgroundColor={pal.pillBg}>
            {label}
          </Text>
          <Text backgroundColor={pal.pillBg}>{right}</Text>
          <Text color={pal.pillBg}>◗</Text>
        </Button>
      )
    }

    const choice = (key: string, label: string, isCurrent: boolean, pick: () => Promise<void>) => (
      <Button key={key} plain onPress={() => void pick()}>
        <Text color={isCurrent ? pal.accent : pal.sep}>{isCurrent ? '● ' : '○ '}</Text>
        <Text color={isCurrent ? pal.text : pal.dim} bold={isCurrent}>
          {label}
        </Text>
      </Button>
    )
    const options =
      shown === 'model'
        ? modelList.map(alias =>
            choice(`set-model:${alias}`, modelChoiceLabel(alias, f.model), f.model.toLowerCase().startsWith(alias), () =>
              pickModel($, alias),
            ),
          )
        : shown === 'effort'
          ? EFFORTS.map(level => choice(`set-effort:${level}`, level, f.effort === level, () => pickEffort($, level)))
          : shown === 'tools'
            ? [
                <Button key="choose" plain onPress={() => void openPicker()}>
                  <Text color={pal.accent}>{'✎ '}</Text>
                  <Text color={pal.text}>choose pills</Text>
                </Button>,
              ]
            : []

    // Fullscreen paints the box over the rows above the bar; the main screen clips
    // a placed box to the site, so there it sits in the flow and pushes the bar down.
    const floats = e.viewport?.isFullscreen === true && !(await read($, isWorking))
    const atRight = shown === 'tools'
    const offset = atRight ? 0 : segmentOffset(segs, shown)
    const box = (
      <Box
        position={floats ? 'absolute' : 'relative'}
        top={floats ? -(options.length + 2) : undefined}
        left={floats && !atRight ? offset : undefined}
        right={floats && atRight ? 0 : undefined}
        marginLeft={floats || atRight ? undefined : offset}
        alignSelf={atRight ? 'flex-end' : 'flex-start'}
        flexDirection="column"
        borderStyle="round"
        borderColor={pal.border}
        backgroundColor={pal.panel}
        paddingX={1}
      >
        {options}
      </Box>
    )

    return (
      <Box flexDirection="column" width="100%">
        {options.length > 0 && !floats && box}
        <Box borderStyle="round" borderColor={pal.border} paddingX={1}>
          <Box flexGrow={1} flexShrink={1} flexWrap="wrap" height={1} overflow="hidden">
            {row}
          </Box>
          <Box flexShrink={0} marginLeft={1} columnGap={1}>
            {modes ? <Text color={pal.dim}>{modes}</Text> : null}
            {chosen.map(name => pill(`tool:${name}`, toolLabel(name), () => void runTool(name), { state: states[name] }))}
            {pill('pill', `${LABEL} ${shown === 'tools' ? '▼' : '▲'}`, () => void toggleMenu('tools'), { mark: '✻' })}
          </Box>
        </Box>
        {options.length > 0 && floats && box}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PICKER }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const pal = paletteFor(await read($, theme))
    const all = await read($, choices)
    const chosen = await read($, tools)
    const query = await read($, filter)
    const { inPill, mods, others } = pickerSections(all, chosen, query)
    const width = e.props.bodyColumns ?? e.viewport?.columns ?? 60

    const toggle = (name: string) =>
      saveTools($, chosen.includes(name) ? chosen.filter(n => n !== name) : [...chosen, name])

    const item = (c: BarTool, isIn: boolean) => (
      <Button key={`pick:${c.name}`} plain onPress={() => void toggle(c.name)}>
        <Text color={isIn ? pal.good : pal.dim}>{isIn ? '● ' : '○ '}</Text>
        <Text color={pal.text}>{`/${c.name}`}</Text>
        <Text color={pal.dim}>{clip(c.description ? `  ${c.description}` : '', width - c.name.length - 6)}</Text>
      </Button>
    )
    const heading = (text: string) => (
      <Box marginTop={1}>
        <Text color={pal.accent} bold>
          {text}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text color={pal.dim}>Click a command to add it as a pill in the bar, or to take it out.</Text>
        {Input && (
          <Input
            key="filter"
            placeholder="Search every command"
            value={query}
            onInput={(value: string) => void update($, filter, () => value)}
            onSubmit={(value: string) => void update($, filter, () => value)}
          />
        )}
        {heading('In the pill')}
        {inPill.length === 0 ? <Text color={pal.dim}>Nothing yet.</Text> : inPill.map(c => item(c, true))}
        {heading('Mods')}
        {mods.length === 0 ? (
          <Text color={pal.dim}>{query ? 'No mods match.' : 'No other mod has a command.'}</Text>
        ) : (
          mods.map(c => item(c, false))
        )}
        {query ? heading('Other commands') : null}
        {query && others.length === 0 ? <Text color={pal.dim}>None match.</Text> : null}
        {others.map(c => item(c, false))}
        <Box marginTop={1}>
          <Button key="done" variant="primary" onPress={() => void $.ui.close({ id: PICKER })}>
            Done
          </Button>
        </Box>
      </Box>
    )
  })
}

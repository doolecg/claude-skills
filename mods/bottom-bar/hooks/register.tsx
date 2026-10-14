import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, StateWrite } from 'claude-code'

import type { BarFigures, BarMod, BarTool } from '../types'
import {
  ACCENTS,
  EFFORTS,
  EMPTY_FIGURES,
  SEPARATOR,
  clip,
  mergeModes,
  mergeSegments,
  effortLabel,
  publishedSegments,
  splitCommand,
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
  footerSummary,
  toolLabel,
  EMPTY_TODO,
  showsTodo,
  todoFrom,
} from './bar-logic'
import { desktopBar, desktopToolbox } from './desktop'
import type { AppEls } from './desktop'
import { toolboxRows, toolboxWidth } from './toolbox'
import { pickInstalls } from './toolbox-logic'
import type { Install } from './toolbox-logic'

const LABEL = "Doole's Tools"
const PICKER = 'bottom-bar-tools'
const TOOLBOX = 'bottom-bar-toolbox'
const CHOOSE = 'choose-pills'

const figures = atom({ plugin: 'bottom-bar', key: 'figures' } as const, EMPTY_FIGURES)
const theme = atom({ plugin: 'bottom-bar', key: 'theme' } as const, 'dark')
const menu = atom({ plugin: 'bottom-bar', key: 'menu' } as const, '')
const isWorking = atom({ plugin: 'bottom-bar', key: 'isWorking' } as const, false)
const models = atom({ plugin: 'bottom-bar', key: 'models' } as const, [])
const tools = atom({ plugin: 'bottom-bar', key: 'tools' } as const, [])
const toolStates = atom({ plugin: 'bottom-bar', key: 'toolStates' } as const, {})
const modeStates = atom({ plugin: 'bottom-bar', key: 'modeStates' } as const, {})
const choices = atom({ plugin: 'bottom-bar', key: 'choices' } as const, [])
const filter = atom({ plugin: 'bottom-bar', key: 'filter' } as const, '')
const label = atom({ plugin: 'bottom-bar', key: 'label' } as const, LABEL)
const mods = atom({ plugin: 'bottom-bar', key: 'mods' } as const, [])
const published = atom({ plugin: 'bottom-bar', key: 'published' } as const, {})
const todo = atom({ plugin: 'bottom-bar', key: 'todo' } as const, EMPTY_TODO)
const todoTick = atom({ plugin: 'bottom-bar', key: 'todoTick' } as const, 0)

/**
 * `segments` writes the bar could not hook as they landed: a publisher's command the bar itself ran
 * writes under the bar's own call, where no hook of the bar's runs. Applied once that call returns.
 */
const missed: Array<{ plugin: string; value: unknown }> = []

async function applyMissed($: Dollar): Promise<void> {
  if (missed.length === 0) return
  const writes = missed.splice(0)
  await update($, published, all => writes.reduce((acc, w) => mergeSegments(acc, w.plugin, w.value), all ?? {}))
}

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
    const seven = usage.rateLimits.find(r => r.kind === 'seven_day')
    await setFigures($, f => ({
      ...f,
      model: modelName(modelId),
      window: usage.context.window,
      ctx: usage.context.percent ?? f.ctx,
      tokens: usage.context.tokens ?? f.tokens,
      fiveHour: five ? five.percentUsed : f.fiveHour,
      sevenDay: seven ? seven.percentUsed : f.sevenDay,
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

/** `keepOpen`: the toolbox stays up after a pick; the small pickers close. */
async function pickModel($: Dollar, alias: string, keepOpen = false): Promise<void> {
  if (!keepOpen) await update($, menu, () => '')
  const set = await $.config.set({ key: 'model', value: alias })
  if (set.deny !== undefined) $.ui.toast(`Could not change the model: ${set.deny}`)
  await refresh($, { settings: true })
}

async function pickEffort($: Dollar, level: string, keepOpen = false): Promise<void> {
  if (!keepOpen) await update($, menu, () => '')
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
  if (!state) return
  await update($, toolStates, all => ({ ...all, [command]: state }))
  // The mod's own `modes` write lands under this call, where the bar's state.set hook is not run.
  const mode = (await read($, modeStates))[command]
  if (mode && mode.isOn !== (state === 'on')) {
    await update($, modeStates, all => ({ ...all, [command]: { ...mode, isOn: state === 'on' } }))
  }
}

async function saveTools($: Dollar, list: string[]): Promise<void> {
  await update($, tools, () => list)
  await $.store.set('tools', list)
}

/** The installed mods, read off `claude plugin list`: plugins whose `hooks.json` names a module. */
async function loadMods($: Dollar): Promise<void> {
  const ran = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 30000 })
  if (ran.exitCode !== 0) return
  const list = JSON.parse(ran.stdout) as Install[]
  const out: BarMod[] = []
  for (const p of pickInstalls(list, await $.session.root())) {
    const name = p.id.split('@')[0]!
    if (name === 'bottom-bar') continue
    try {
      const hooks = JSON.parse(await $.fs.read(`${p.installPath}/hooks/hooks.json`)) as { modules?: unknown }
      if (!Array.isArray(hooks.modules) || hooks.modules.length === 0) continue
    } catch {
      continue
    }
    let description = ''
    try {
      const manifest = JSON.parse(await $.fs.read(`${p.installPath}/.claude-plugin/plugin.json`)) as { description?: unknown }
      if (typeof manifest.description === 'string') description = manifest.description
    } catch {}
    out.push({ id: p.id, name, label: toolLabel(name), description, scope: p.scope, isEnabled: p.enabled === true })
  }
  await update($, mods, () => out)
}

async function toggleMod($: Dollar, mod: BarMod): Promise<void> {
  const verb = mod.isEnabled ? 'disable' : 'enable'
  try {
    const ran = await $.process.run(['claude', 'plugin', verb, mod.id, '--scope', mod.scope], { timeoutMs: 60000 })
    if (ran.exitCode !== 0) {
      $.ui.toast(`Could not ${verb} ${mod.label}: ${(ran.stderr || ran.stdout).trim().split('\n')[0]}`)
      return
    }
  } catch {
    $.ui.toast(`Could not ${verb} ${mod.label}`)
    return
  }
  await update($, mods, list => list.map(m => (m.id === mod.id ? { ...m, isEnabled: !mod.isEnabled } : m)))
  try {
    await $.command.run({ command: 'reload-plugins', args: '' })
  } catch {
    $.ui.toast(`${mod.label} is ${verb}d. Run /reload-plugins to apply it.`)
  }
}

async function runCommand($: Dollar, text: string): Promise<void> {
  const { command: name, args } = splitCommand(text)
  try {
    await noteReply($, name, await $.command.run({ command: name, args }))
  } catch {
    $.ui.toast(`/${name} is not available. Is its mod still installed?`)
  }
  await applyMissed($)
}

async function openPicker($: Dollar): Promise<void> {
  await update($, menu, () => '')
  await update($, filter, () => '')
  await loadChoices($)
  await $.ui.open({ id: PICKER, title: await read($, label), focus: true, closeOnEscape: true })
}

async function closeTools($: Dollar): Promise<void> {
  if ((await read($, menu)) === 'tools') await update($, menu, () => '')
  try {
    await $.ui.close({ id: TOOLBOX })
  } catch {}
}

/** Opens the toolbox as a pane in the app, its lists fresh. */
async function openAppToolbox($: Dollar): Promise<void> {
  void loadMods($).catch(() => {})
  try {
    await loadChoices($)
  } catch {}
  await update($, menu, () => 'tools')
  await $.ui.open({ id: TOOLBOX, title: await read($, label), focus: true, closeOnEscape: true })
}

/** The toolbox's rows, for the box in the bar or the docked pane. */
async function toolboxTree(
  $: Dollar,
  els: Elements['terminal'],
  width: number,
  colour: string,
  hasClose = true,
): Promise<JSX.Element[]> {
  const loaded = await read($, models)
  const title = await read($, label)
  return toolboxRows({
    els,
    pal: paletteFor(await read($, theme), colour),
    width,
    title,
    figures: await read($, figures),
    models: loaded.length > 0 ? loaded : modelChoices(undefined),
    modes: await read($, modeStates),
    mods: await read($, mods),
    choices: await read($, choices),
    chosen: await read($, tools),
    pickModel: alias => void pickModel($, alias, true),
    pickEffort: level => void pickEffort($, level, true),
    flip: command => void runCommand($, command),
    toggleMod: mod => void toggleMod($, mod),
    close: () => void closeTools($),
    hasClose,
    launch: command => void closeTools($).then(() => runCommand($, command)),
    choosePills: () => void openPicker($),
  })
}

export const register: Register = (on, options) => {
  const name = typeof options.name === 'string' && options.name.trim() ? options.name.trim() : LABEL
  const colour = typeof options.colour === 'string' && ACCENTS[options.colour] ? options.colour : 'Coral'

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    if ((await read($, label)) !== name) await update($, label, () => name)
    const saved = await $.store.get('tools')
    if (Array.isArray(saved)) {
      await update($, tools, () => saved.filter((x): x is string => typeof x === 'string'))
    }
    await refresh($, { settings: true })
    try {
      await loadModels($)
    } catch {}
    void loadMods($).catch(() => {})
    $.clock.every(4000, () => void refresh($))
    await $.command.register({ name: CHOOSE, description: 'Choose which commands are in Quick Launch in the toolbox' })
    return ran
  })

  on('session.measure', async ($, e, next) => {
    const five = e.rateLimits.find(r => r.kind === 'five_hour')
    const seven = e.rateLimits.find(r => r.kind === 'seven_day')
    await setFigures($, f => ({
      ...f,
      window: e.context.window || f.window,
      ctx: e.context.percent ?? f.ctx,
      tokens: e.context.tokens ?? f.tokens,
      fiveHour: five ? five.percentUsed : f.fiveHour,
      sevenDay: seven ? seven.percentUsed : f.sevenDay,
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

  // A mod with an on/off mode publishes it as its `modes` state; the pill follows it live.
  // Another mod's key, which this contract does not declare: the write is read untyped.
  on('state.set', { key: 'modes' } as never, async ($, e, next) => {
    const ran = await next(e)
    const write = e as unknown as StateWrite
    if (write.plugin !== 'bottom-bar') await update($, modeStates, all => mergeModes(all ?? {}, write.plugin, write.value))
    return ran
  }).catch(($, e, next) => next(e))

  // A mod's published segments: `{ [id]: { label, detail?, command, state?, actions? } }` in its own
  // `segments` state, drawn first on the left of the bar and followed live.
  on('state.set', { key: 'segments' } as never, async ($, e, next) => {
    const ran = await next(e)
    const write = e as unknown as StateWrite
    if (write.plugin !== 'bottom-bar') await update($, published, all => mergeSegments(all ?? {}, write.plugin, write.value))
    return ran
  }).catch(($, e, next) => {
    const write = e as unknown as StateWrite
    if (next.error?.kind === 're-entry' && write.plugin !== 'bottom-bar') missed.push({ plugin: write.plugin, value: write.value })
    return next(e)
  })

  // Task View's to-do list, drawn above the bar in the app while Claude works.
  on('state.set', { key: 'checklist' } as never, async ($, e, next) => {
    const ran = await next(e)
    const write = e as unknown as StateWrite
    if (write.plugin === 'clean-view') await update($, todo, () => todoFrom(write.value))
    return ran
  }).catch(($, e, next) => next(e))

  // Task View's frame clock: each tick redraws the list so its pixels flicker.
  on('state.set', { key: 'tick' } as never, async ($, e, next) => {
    const ran = await next(e)
    const write = e as unknown as StateWrite
    if (write.plugin === 'clean-view' && typeof write.value === 'number') await update($, todoTick, () => write.value as number)
    return ran
  }).catch(($, e, next) => next(e))

  on('command.run', { command: CHOOSE }, async $ => {
    await openPicker($)
    return {}
  })

  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (['model', 'effort', 'config', 'theme'].includes(e.command)) void refresh($, { settings: true })
    // A mode's own write lands under this hook too (the toolbox runs it), so its reply is read here.
    if ((await read($, tools)).includes(e.command) || (await read($, modeStates))[e.command]) {
      await noteReply($, e.command, ran)
    }
    return ran
  }).catch(($, e, next) => next(e))

  // In the app the bar is the band above the prompt: the footer slot below it holds about two items.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
    const openToolbox = async () => {
      void loadMods($).catch(() => {})
      try {
        await loadChoices($)
      } catch {}
      await update($, menu, () => 'tools')
      await $.ui.open({ id: TOOLBOX, title: await read($, label), focus: true, closeOnEscape: true })
    }
    const pal = paletteFor(await read($, theme), colour)
    const list = await read($, todo)
    return desktopBar({
      els: $.ui.resolve(e) as AppEls,
      pal,
      title: await read($, label),
      figures: await read($, figures),
      published: publishedSegments(await read($, published), pal),
      runCommand: command => void runCommand($, command),
      openToolbox: () => void openToolbox(),
      todo: showsTodo(list, await $.clock.now()) ? list : undefined,
      todoTick: await read($, todoTick),
    })
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    // The app keeps its own footer labels. It shows the band above the prompt only while Claude works, so
    // only then does the key tell a mod with a fallback button (Enhance Prompt) that the bar hosts it;
    // the rest of the time that mod draws its own button here.
    if (e.surface === 'desktop') {
      const { Box: AppBox, Text: AppText, Button: AppButton } = $.ui.resolve(e)
      if (await read($, isWorking)) return <AppBox key="bottom-bar-segments">{await next(e)}</AppBox>
      // Idle: the app hides the band above the prompt, so the bar stays in view here as one short line.
      const pal = paletteFor(await read($, theme), colour)
      const f = await read($, figures)
      return (
        <AppButton key="pill" plain onPress={() => void openAppToolbox($)}>
          <AppText color={pal.dim}>{footerSummary(f)}</AppText>
        </AppButton>
      )
    }
    if (e.surface !== 'terminal') return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const pal = paletteFor(await read($, theme), colour)
    const f = await read($, figures)
    const shown = await read($, menu)
    const loaded = await read($, models)
    const modelList = loaded.length > 0 ? loaded : modelChoices(undefined)

    const modes = e.props.modes.length > 0 ? `${e.props.modes.join(' & ')}  ` : ''
    // Fullscreen docks the toolbox as a pane beside the transcript, so the prompt and bar stay put;
    // the main screen has no dock, so there it opens in the bar.
    const docks = e.viewport?.isFullscreen === true
    const toggleMenu = async (which: string) => {
      if ((await read($, menu)) === 'tools') await closeTools($)
      await update($, menu, now => (now === which ? '' : which))
    }

    // One row that clips: a segment with no room wraps onto the hidden second row.
    const segs = segments(f, pal)
    // Other mods' published segments come first, on the left, in a box of their own that gives way
    // first: it shrinks and clips before the bar's own segments give way, and the pills never do.
    const extra = publishedSegments(await read($, published), pal)
    // Each one's name is a filled chip, coloured by how its run is going; its detail and actions follow.
    const shared = extra.map(seg => (
      <Box flexShrink={0}>
        <Button key={seg.key} plain onPress={() => void runTool(seg.command!)}>
          {seg.parts.map((p, i) =>
            i === 0 ? (
              <Text backgroundColor={p.color === pal.text ? pal.accent : p.color} color={pal.ink} bold>
                {` ✦ ${p.text} `}
              </Text>
            ) : (
              <Text color={p.color} bold={p.bold}>
                {p.text}
              </Text>
            ),
          )}
        </Button>
        {(seg.actions ?? []).map(a => [
          <Text color={pal.dim}>{' · '}</Text>,
          <Button key={a.key} plain onPress={() => void runTool(a.command)}>
            <Text color={pal.accent}>{a.label}</Text>
          </Button>,
        ])}
        <Text color={pal.sep}>{SEPARATOR}</Text>
      </Box>
    ))
    const sharedWidth = extra.reduce(
      (n, seg) =>
        n +
        seg.parts.reduce((m, p, i) => m + [...p.text].length + (i === 0 ? 4 : 0), 0) +
        (seg.actions ?? []).reduce((m, a) => m + 3 + [...a.label].length, 0) +
        SEPARATOR.length,
      0,
    )
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
      await runCommand($, name)
    }
    const openTools = async () => {
      if ((await read($, menu)) !== 'tools') {
        void loadMods($).catch(() => {})
        try {
          await loadChoices($)
        } catch {}
      }
      if ((await read($, menu)) === 'tools') return closeTools($)
      await update($, menu, () => 'tools')
      if (docks) await $.ui.open({ id: TOOLBOX, title: await read($, label), closeOnEscape: true, columns: 66 })
    }
    const title = await read($, label)

    const pill = (key: string, label: string, onPress: () => void, mark: string) => {
      const [left, right] = pillPad([...label].length + 2)
      return (
        <Button key={key} plain onPress={onPress}>
          <Text color={pal.pillBg}>◖</Text>
          <Text backgroundColor={pal.pillBg}>{left}</Text>
          <Text color={pal.accent} backgroundColor={pal.pillBg}>
            {`${mark} `}
          </Text>
          <Text color={pal.pillFg} backgroundColor={pal.pillBg}>
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
          : shown === 'tools' && !docks
            ? await toolboxTree($, $.ui.resolve(e), toolboxWidth(e.viewport?.columns ?? 80) - 4, colour)
            : []

    // Fullscreen paints a small box over the rows above the bar; the main screen clips
    // a placed box to the site, so there it sits in the flow and pushes the bar down.
    const atRight = shown === 'tools'
    const floats = !atRight && docks && !(await read($, isWorking))
    const offset = atRight ? 0 : sharedWidth + segmentOffset(segs, shown)
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
        width={atRight ? toolboxWidth(e.viewport?.columns ?? 80) : undefined}
      >
        {options}
      </Box>
    )

    return (
      <Box flexDirection="column" width="100%">
        {options.length > 0 && !floats && box}
        <Box borderStyle="round" borderColor={pal.border} paddingX={1}>
          <Box key="bottom-bar-published" flexShrink={100} height={1} overflow="hidden">
            {shared}
          </Box>
          <Box key="bottom-bar-segments" flexShrink={1} flexWrap="wrap" height={1} overflow="hidden">
            {row}
          </Box>
          <Box flexGrow={1} />
          <Box flexShrink={0} marginLeft={1} columnGap={1}>
            {modes ? <Text color={pal.dim}>{modes}</Text> : null}
            {pill('pill', `${title} ${shown === 'tools' ? '▼' : '▲'}`, () => void openTools(), '✻')}
          </Box>
        </Box>
        {options.length > 0 && floats && box}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: TOOLBOX }, async ($, e) => {
    if (e.surface === 'desktop' || e.surface === 'mobile') {
      const loaded = await read($, models)
      return desktopToolbox({
        els: $.ui.resolve(e) as AppEls,
        pal: paletteFor(await read($, theme), colour),
        title: await read($, label),
        figures: await read($, figures),
        models: loaded.length > 0 ? loaded : modelChoices(undefined),
        modes: await read($, modeStates),
        mods: await read($, mods),
        choices: await read($, choices),
        chosen: await read($, tools),
        pickModel: alias => void pickModel($, alias, true),
        pickEffort: level => void pickEffort($, level, true),
        flip: command => void runCommand($, command),
        toggleMod: mod => void toggleMod($, mod),
        launch: command => void closeTools($).then(() => runCommand($, command)),
        choosePills: () => void openPicker($),
      })
    }
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text>The toolbox opens from the bar in the terminal.</Text>
    }
    const els = $.ui.resolve(e)
    const { Box } = els
    const pal = paletteFor(await read($, theme), colour)
    const rows = await toolboxTree($, els, e.props.bodyColumns - 4, colour, false)
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={pal.border}
        backgroundColor={pal.panel}
        paddingX={1}
        width={e.props.bodyColumns}
      >
        {rows}
      </Box>
    )
  })

  // The person's own close of the docked toolbox (Escape, its close mark) closes it in the bar too.
  on('ui.close', async ($, e, next) => {
    const ran = await next(e)
    if (e.id === TOOLBOX && e.origin.kind !== 'plugin' && (await read($, menu)) === 'tools') await update($, menu, () => '')
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PICKER }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const pal = paletteFor(await read($, theme), colour)
    const all = await read($, choices)
    const chosen = await read($, tools)
    const query = await read($, filter)
    const { inPill, mods, others } = pickerSections(all, chosen, query)
    const width = e.props.bodyColumns ?? e.viewport?.columns ?? 60

    const toggle = (name: string) =>
      saveTools($, chosen.includes(name) ? chosen.filter(n => n !== name) : [...chosen, name])

    const onOff = await read($, modeStates)
    const isApp = e.surface === 'desktop' || e.surface === 'mobile'
    const item = (c: BarTool, isIn: boolean) => {
      const mode = onOff[c.name]
      const about = mode ? `  ${mode.label} on/off button, now ${mode.isOn ? 'on' : 'off'}` : c.description ? `  ${c.description}` : ''
      if (isApp) {
        return (
          <Button key={`pick:${c.name}`} variant={isIn ? 'primary' : undefined} onPress={() => void toggle(c.name)}>
            {`/${c.name}${about.trim() ? ` - ${about.trim()}` : ''}`}
          </Button>
        )
      }
      return (
        <Button key={`pick:${c.name}`} plain onPress={() => void toggle(c.name)}>
          <Text color={isIn ? pal.good : pal.dim}>{isIn ? '● ' : '○ '}</Text>
          <Text color={pal.text}>{`/${c.name}`}</Text>
          <Text color={pal.dim}>{clip(about, width - c.name.length - 6)}</Text>
        </Button>
      )
    }
    const heading = (text: string) => (
      <Box marginTop={1}>
        <Text color={pal.accent} bold>
          {text}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text color={pal.dim}>Click a command to add it to Quick Launch in the toolbox, or to take it out.</Text>
        {Input && (
          <Input
            key="filter"
            placeholder="Search every command"
            value={query}
            onInput={(value: string) => void update($, filter, () => value)}
            onSubmit={(value: string) => void update($, filter, () => value)}
          />
        )}
        {heading('In Quick Launch')}
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

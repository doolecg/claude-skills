import type { EngineInterface, On } from 'claude-code'

import { DEFAULT_PALETTE, RETRO_PALETTE, skinPalette } from './road-trip-art'
import type { Palette } from './road-trip-art'
import {
  TICK_MS,
  act,
  addSteps,
  arrive,
  encodeFrame,
  garageStatus,
  newGame,
  renderFrame,
  resize,
  resume,
  sanitizeProfile,
  step,
  tooSmall,
} from './road-trip-game'
import type { Action, Game } from './road-trip-game'

type Dollar = EngineInterface

const PANE = 'road-trip'
const VIEW = { plugin: 'road-trip', key: 'view' } as const
const CLEAN = { plugin: 'clean-view', key: 'checklist' } as const
const SKIN = { plugin: 'brand-skin', key: 'skin' } as const

const viewKey = (g: Game): string =>
  g.mode === 'garage' ? `garage:${garageStatus(g, g.garageIdx).label}` : g.mode

let game: Game | null = null
let isOpen = false
let enabled = true
let flagsLoaded = false
let retroFlag = false
let timer: { cancel: () => void } | null = null
let busy = false
let frame = 0
let gridW = 0
let gridH = 0
let lastView = ''
let skin: Palette | undefined
let cvDone = 0
let cvActive = false
let todoSeen = false
let todoDone = 0

const palette = (g: Game): Palette => (g.retro ? RETRO_PALETTE : skin ?? DEFAULT_PALETTE)

const loadFlags = async ($: Dollar): Promise<void> => {
  if (flagsLoaded) return
  try {
    enabled = (await $.store.get('enabled')) !== false
    retroFlag = (await $.store.get('retro')) === true
  } catch {
    /* keep defaults */
  }
  flagsLoaded = true
}

const ensureGame = async ($: Dollar): Promise<Game> => {
  if (game) return game
  let raw: unknown
  try {
    raw = await $.store.get('profile')
  } catch {
    raw = undefined
  }
  await loadFlags($)
  if (!game) game = newGame(sanitizeProfile(raw), Math.floor(Math.random() * 2147483647), retroFlag)
  return game
}

const save = async ($: Dollar): Promise<void> => {
  if (!game) return
  game.saveDirty = false
  try {
    await $.store.set('profile', game.profile)
  } catch {
    /* a failed save is retried at the next change */
    game.saveDirty = true
  }
}

const hint = ($: Dollar): void => {
  try {
    $.ui.status(enabled && !isOpen ? '▶ Road Trip  ·  type /roadtrip' : undefined)
  } catch {
    /* no status line */
  }
}

const syncView = async ($: Dollar): Promise<void> => {
  if (!game) return
  const key = viewKey(game)
  if (key === lastView) return
  lastView = key
  try {
    await $.state.set(VIEW, key)
  } catch {
    /* the next change tries again */
  }
}

const blit = async ($: Dollar): Promise<void> => {
  if (!game || gridW === 0) return
  try {
    await $.ui.blit({
      requestId: PANE,
      key: 'view',
      cells: encodeFrame(renderFrame(game, palette(game))),
    })
  } catch {
    /* not mounted right now */
  }
}

const syncShared = async ($: Dollar): Promise<void> => {
  try {
    const { value } = await $.state.get(SKIN)
    skin = value?.palette ? skinPalette(DEFAULT_PALETTE, value.palette) : undefined
  } catch {
    skin = undefined
  }
  try {
    const { value } = await $.state.get(CLEAN)
    const tasks = value?.tasks
    if (Array.isArray(tasks) && tasks.length > 0) {
      cvActive = true
      const done = tasks.filter(t => t.status === 'done').length
      if (done > cvDone && game) addSteps(game, done - cvDone)
      cvDone = done
    }
  } catch {
    /* Clean View is not installed */
  }
}

const tickOnce = async ($: Dollar): Promise<void> => {
  if (!isOpen || !game || busy) return
  busy = true
  try {
    frame++
    if (frame % 12 === 0) await syncShared($)
    step(game)
    if (frame % 12 === 0 && game.saveDirty) await save($)
    await syncView($)
    if (game.dirty) {
      game.dirty = false
      await blit($)
    }
  } catch {
    /* a bad frame must not stop the game */
  } finally {
    busy = false
  }
}

const startClock = ($: Dollar): void => {
  if (timer) return
  timer = $.clock.every(TICK_MS, () => {
    void tickOnce($)
  })
}

const stopClock = (): void => {
  if (timer) timer.cancel()
  timer = null
}

const closed = async ($: Dollar): Promise<void> => {
  isOpen = false
  stopClock()
  await save($)
  hint($)
}

const openPane = async ($: Dollar): Promise<boolean> => {
  await ensureGame($)
  isOpen = true
  const placed = await $.ui.open({ id: PANE, title: 'Road Trip', focus: true, columns: 110, rows: 30 })
  if (!placed.isPlaced) {
    isOpen = false
    try {
      await $.ui.close({ id: PANE })
    } catch {
      /* already gone */
    }
    $.ui.toast('Road Trip needs a little more room: widen the window')
    return false
  }
  game!.dirty = true
  startClock($)
  hint($)
  return true
}

const press = async ($: Dollar, a: Action): Promise<void> => {
  if (!game) return
  act(game, a)
  await syncView($)
  await blit($)
}

const closePane = async ($: Dollar): Promise<void> => {
  await $.ui.close({ id: PANE })
}

export const registerRoadTrip = (on: On): void => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'roadtrip',
        description: 'Play Road Trip while Claude works. Use on, off, or retro on/off.',
      })
      await loadFlags($)
      const panes = await $.ui.panes()
      if (panes.some(p => p.id === PANE)) {
        await ensureGame($)
        isOpen = true
        startClock($)
      }
      hint($)
    } catch {
      /* the command still works without the hint */
    }
    return next(e)
  })

  on('command.run', { command: 'roadtrip' }, async ($, e) => {
    try {
      await loadFlags($)
      const words = (e.args ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
      const first = words[0] ?? 'play'
      if (first === 'retro') {
        const value = words[1] === 'on' ? true : words[1] === 'off' ? false : !retroFlag
        retroFlag = value
        if (game) {
          game.retro = value
          game.dirty = true
        }
        void $.store.set('retro', value).catch(() => undefined)
        return { text: `Retro look is ${value ? 'on' : 'off'}.` }
      }
      if (first === 'off') {
        enabled = false
        void $.store.set('enabled', false).catch(() => undefined)
        if (isOpen) await closePane($)
        else hint($)
        return { text: 'Road Trip is off. Type /roadtrip on to turn it back on.' }
      }
      if (first === 'on') {
        enabled = true
        void $.store.set('enabled', true).catch(() => undefined)
        const placed = await openPane($)
        return { text: placed ? 'Road Trip is on.' : 'Road Trip is on, but needs a little more room.' }
      }
      if (first === 'play') {
        if (!enabled) return { text: 'Road Trip is off. Type /roadtrip on to turn it back on.' }
        const placed = await openPane($)
        return { text: placed ? 'Road Trip is open. A and D change lanes.' : 'Road Trip needs a little more room: widen the window.' }
      }
      return { text: 'Use /roadtrip, /roadtrip on, /roadtrip off, or /roadtrip retro on|off.' }
    } catch {
      return { text: 'Road Trip hit a snag. Try again.' }
    }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const out = await next(e)
    await closed($)
    return out
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      if (!isOpen || !game || e.agentId) return ran
      if (e.tool === 'TodoWrite') {
        todoSeen = true
        const done = e.todos.filter(t => t.status === 'completed').length
        if (done > todoDone) addSteps(game, done - todoDone)
        todoDone = done
      } else if (e.tool === 'TaskUpdate') {
        todoSeen = true
        if (e.status === 'completed') addSteps(game, 1)
      } else if (e.tool === 'TaskCreate') {
        todoSeen = true
      } else if (!todoSeen && !cvActive) {
        addSteps(game, 1)
      }
    } catch {
      /* counting is best effort */
    }
    return ran
  })

  on('turn.start', async ($, e, next) => {
    todoSeen = false
    todoDone = 0
    cvActive = false
    try {
      if (isOpen && game) {
        resume(game)
        await syncView($)
        await blit($)
      }
    } catch {
      /* resuming is best effort */
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    try {
      if (isOpen && game && !e.agentId && e.reason === 'answer') {
        arrive(game)
        await syncView($)
        await blit($)
        await save($)
      }
    } catch {
      /* the card is a nicety */
    }
    return out
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text>Road Trip plays in the terminal.</Text>
    }
    const { Box, Text, Button, Raster } = $.ui.resolve(e)
    const g = await ensureGame($)
    await $.state.get(VIEW)
    const cols = Math.min(512, e.props.bodyColumns)
    const rows = Math.min(257, e.props.scroll.bodyRows)
    gridW = 0
    gridH = 0
    resize(g, cols, Math.max(0, rows - 1))
    if (cols < 36 || rows < 8 || tooSmall(g)) {
      return <Text>Make this panel a little bigger to drive</Text>
    }
    gridW = cols
    gridH = rows - 1
    const small = cols < 62
    const status = g.mode === 'garage' ? garageStatus(g, g.garageIdx) : null
    const bar = (
      <Box flexDirection="row">
        {g.mode === 'arrived' ? (
          <Button key="keep" hotkey="k" variant="primary" onPress={() => press($, 'keep')}>
            Keep Driving
          </Button>
        ) : (
          <Box flexDirection="row">
            <Button key="left" hotkey="a" onPress={() => press($, 'left')}>
              ◀ A
            </Button>
            <Text> </Text>
            <Button key="right" hotkey="d" onPress={() => press($, 'right')}>
              D ▶
            </Button>
            {g.mode !== 'garage' && (
              <Box flexDirection="row">
                <Text> </Text>
                <Button key="pause" hotkey="p" onPress={() => press($, 'pause')}>
                  {g.mode === 'paused' ? (small ? 'P' : 'P resume') : small ? 'P' : 'P pause'}
                </Button>
              </Box>
            )}
            {status && (
              <Box flexDirection="row">
                <Text> </Text>
                <Button key="buy" hotkey="b" variant="primary" onPress={() => press($, 'buy')}>
                  {`B ${status.label.toLowerCase()}`}
                </Button>
              </Box>
            )}
          </Box>
        )}
        <Text> </Text>
        <Button key="garage" hotkey="g" onPress={() => press($, 'garage')}>
          {g.mode === 'garage' ? (small ? 'G' : 'G back') : small ? 'G' : 'G garage'}
        </Button>
        {g.mode === 'arrived' && (
          <Box flexDirection="row">
            <Text> </Text>
            <Button key="close" hotkey="c" onPress={() => closePane($)}>
              Close
            </Button>
          </Box>
        )}
      </Box>
    )
    return (
      <Box flexDirection="column">
        <Raster
          key="view"
          columns={cols}
          rows={rows - 1}
          cells={encodeFrame(renderFrame(g, palette(g)))}
        />
        {bar}
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DesignPickerBand, DesignPickerQuestion } from '../types'

import { detectLooks } from './detect'
import { buildGalleryHtml } from './gallery'
import { chooseTempDir, detectPlatform, openArgv, pagePath } from './platform'
import type { LookQuestion } from './detect'

const band = atom({ plugin: 'design-picker', key: 'band' } as const, null as DesignPickerBand | null)

type Outcome = 'ready' | 'unavailable'

function setStatus($: EngineInterface, id: string, status: DesignPickerBand['status']): Promise<unknown> {
  return update($, band, current => (current !== null && current.id === id ? { ...current, status } : current))
}

// Writes the gallery page to the temp folder and opens it. Every failure
// becomes a toast; nothing here can touch the question.
async function publish($: EngineInterface, questions: readonly LookQuestion[], isLive: () => boolean): Promise<Outcome> {
  try {
    const os = await $.env.get('OS')
    const temp = await $.env.get('TEMP')
    const tmp = await $.env.get('TMP')
    const tmpdir = await $.env.get('TMPDIR')
    const guess = detectPlatform({ os, temp: temp ?? tmp ?? tmpdir })
    const platform =
      guess === 'linux' && (await $.fs.exists('/System/Library/CoreServices'))
        ? detectPlatform({ os, temp: temp ?? tmp ?? tmpdir, hasMacRoot: true })
        : guess
    const tmpExists = platform === 'windows' ? false : await $.fs.exists('/tmp')
    const dir = chooseTempDir(platform, { TEMP: temp, TMP: tmp, TMPDIR: tmpdir }, tmpExists)

    if (dir === undefined) {
      $.ui.toast('Design Picker: no temp folder was found, so there is no preview. Pick from the options in the question.')
      return 'unavailable'
    }

    const path = pagePath(platform, dir)
    try {
      await $.fs.write(path, buildGalleryHtml(questions))
    } catch {
      $.ui.toast(`Design Picker: could not write the preview to ${path}.`)
      return 'unavailable'
    }

    if (!isLive()) return 'ready'

    let opened = false
    try {
      const ran = await $.process.run(openArgv(platform, path), { timeoutMs: 10000 })
      opened = ran.exitCode === 0
    } catch {
      opened = false
    }
    if (!opened) $.ui.toast(`Design Picker: the preview did not open. It is saved at ${path}`, { timeoutMs: 10000 })

    return 'ready'
  } catch {
    $.ui.toast('Design Picker: could not make the preview. Pick from the options in the question.')
    return 'unavailable'
  }
}

export const register: Register = on => {
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    let looks: LookQuestion[] = []
    try {
      looks = detectLooks(e.questions)
    } catch {
      looks = []
    }
    if (looks.length === 0) return next(e)

    const id = e.tool_use_id ?? 'design-picker'
    let isLive = true
    const shown = Promise.resolve(update($, band, () => ({ id, status: 'working' as const, questions: looks as DesignPickerQuestion[] }))).catch(() => undefined)
    // The page is made beside the question, never before it.
    void shown
      .then(() => publish($, looks, () => isLive))
      .then(outcome => (isLive ? setStatus($, id, outcome) : undefined))
      .catch(() => undefined)

    try {
      return await next(e)
    } finally {
      isLive = false
      await shown
      await Promise.resolve(update($, band, current => (current !== null && current.id === id ? null : current))).catch(() => undefined)
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const current = await read($, band)
    if (current === null) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const note =
      current.status === 'working'
        ? 'Preview: opening in your browser.'
        : current.status === 'ready'
          ? 'Preview: open in your browser. Pick in the question below.'
          : 'Preview: not available. Pick from the options in the question.'

    const mine = (
      <Box key="design-picker" flexDirection="column">
        {current.questions.map((question, index) => (
          <Text key={`q${index}`}>
            {`${question.header === '' ? 'Design' : question.header}: ${question.options.map(option => option.label).join(' | ')}`}
          </Text>
        ))}
        <Box>
          <Text dimColor>{`${note} `}</Text>
          {current.status === 'ready' && (
            <Button
              key="reopen"
              label="Reopen preview"
              onPress={() => {
                void publish($, current.questions as LookQuestion[], () => true)
              }}
            />
          )}
        </Box>
      </Box>
    )

    return below ? (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    ) : (
      mine
    )
  })
}

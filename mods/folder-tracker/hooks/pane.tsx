import type { SbKit, SbStrip } from './sidebar-kit'
import { isSidebarTab, sbActions, sbCard, sbClip, sbCommand, sbFrame, sbSplit, sbTitle } from './sidebar-kit'
import { agoOf, relativeTo, sharedFiles } from './tracker'
import type { Tracker } from '../types'

type Run = (c: { command: string; args: string }) => Promise<unknown>

const FILES_SHOWN = 4

export function drawFolders(k: SbKit, strip: SbStrip | undefined, run: Run, cwd: string, now: number, mine: Tracker | undefined, others: Tracker[]) {
  const { Box, Text } = k.els
  const { pal } = k
  const status = others.length === 0 ? 'no other sessions here' : `${others.length} other session${others.length === 1 ? '' : 's'} here`
  const body: unknown[] = [sbTitle(k, { icon: '⇄', name: 'Folder Tracker', status }, { label: 'Settings', onPress: () => sbCommand(run, 'settings folder-tracker') })]

  if (others.length === 0) {
    body.push(sbCard(k, 'ft-empty', <Text color={pal.dim}>No other sessions in this folder</Text>))
  }
  for (const other of others) {
    const colour = other.phase === 'working' ? pal.good : other.phase === 'waiting' ? pal.warn : pal.dim
    const shown = other.files.slice(0, FILES_SHOWN)
    const more = other.files.length - shown.length
    const clash = mine ? sharedFiles(mine.files, other.files) : []
    body.push(
      sbCard(k, `ft:${other.id}`, [
        sbSplit(
          k,
          `ft-head:${other.id}`,
          <Text color={pal.text} bold>
            {sbClip(other.id, 8)}
          </Text>,
          <Text>
            <Text color={colour}>{other.phase}</Text>
            <Text color={pal.dim}>{` · ${agoOf(now - other.at)}`}</Text>
          </Text>,
        ),
        ...shown.map(f => (
          <Text key={`ft-file:${other.id}:${f.path}`} color={pal.dim} wrap="truncate-end">
            {relativeTo(cwd, f.path)}
          </Text>
        )),
        more > 0 ? (
          <Text key={`ft-more:${other.id}`} color={pal.dim}>{`+${more} more`}</Text>
        ) : null,
      ]),
    )
    if (clash.length > 0) {
      body.push(
        sbCard(
          k,
          `ft-clash:${other.id}`,
          [
            <Text key="ft-clash-head" color={pal.bad} bold>{`⚠ Both sessions touched ${clash.length} file${clash.length === 1 ? '' : 's'}`}</Text>,
            ...clash.slice(0, FILES_SHOWN).map(p => (
              <Text key={`ft-clash:${other.id}:${p}`} color={pal.dim} wrap="truncate-end">
                {relativeTo(cwd, p)}
              </Text>
            )),
          ],
          { border: pal.bad },
        ),
      )
    }
  }

  return isSidebarTab(strip, 'folder-tracker') ? (
    sbFrame(k, strip!, sbActions(run), body)
  ) : (
        <Box flexDirection="column" width="100%">
          {body}
        </Box>
      )
}

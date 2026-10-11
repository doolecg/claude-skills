// Finds the questions in an AskUserQuestion call that are about looks.

import { matchStyle } from './styles'
import type { StyleId } from './styles'

export type LookOption = {
  label: string
  description: string
  style: StyleId | null
}

export type LookQuestion = {
  header: string
  question: string
  why: 'words' | 'styles'
  options: LookOption[]
}

const LOOK_WORDS =
  /\b(?:designs?|styles?|styling|themes?|theming|aesthetics?|look(?:\s+and\s+|\s*&\s*|-and-)feel|colou?r\s+schemes?|layouts?)\b/i

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readOptions(raw: unknown): LookOption[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((option): LookOption[] => {
    if (typeof option !== 'object' || option === null) return []
    const { label, description } = option as Record<string, unknown>
    const name = text(label).trim()
    if (name === '') return []

    return [{ label: name, description: text(description).trim(), style: matchStyle(name) }]
  })
}

export function isLookWords(header: unknown, question: unknown): boolean {
  return LOOK_WORDS.test(`${text(header)}\n${text(question)}`)
}

// The questions that are about looks, with their options read safely.
// A question counts when its header or text uses a look word, or when two
// or more of its option labels name a known style. It needs an option to show.
export function detectLooks(input: unknown): LookQuestion[] {
  if (!Array.isArray(input)) return []

  return input.flatMap((raw): LookQuestion[] => {
    if (typeof raw !== 'object' || raw === null) return []
    const { header, question, options } = raw as Record<string, unknown>
    const read = readOptions(options)
    if (read.length === 0) return []

    const why = isLookWords(header, question)
      ? 'words'
      : read.filter(option => option.style !== null).length >= 2
        ? 'styles'
        : null
    if (why === null) return []

    return [{ header: text(header).trim(), question: text(question).trim(), why, options: read }]
  })
}

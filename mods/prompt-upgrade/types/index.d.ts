export type Question = { q: string; options: string[] }

export type Step =
  | 'input'
  | 'reading'
  | 'questions'
  | 'rewrite'
  | 'review'
  | 'error'
  | 'history'

export type QuestionStatus = 'open' | 'answered' | 'skipped'

export type Run = {
  id: string
  step: Step
  original: string
  questions: Question[]
  status: QuestionStatus[]
  answers: string[]
  otherFor: number | null
  rewrite: string
  added: string[]
  draft: string
  isEditing: boolean
  isCopied: boolean
  error: string
  failedStep: 'reading' | 'rewrite'
}

export type HistoryItem = {
  id: string
  at: number
  original: string
  upgraded: string
  added: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-upgrade': { run: Run | null }
  }
}

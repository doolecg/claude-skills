/** Builds transcript JSONL the way Claude Code writes it. */

type Row = Record<string, unknown>

let n = 0
const uuid = () => `u${++n}`

export const user = (text: string, extra: Row = {}): Row => ({ type: 'user', uuid: uuid(), message: { role: 'user', content: text }, ...extra })
export const userBlocks = (text: string): Row => ({ type: 'user', uuid: uuid(), message: { role: 'user', content: [{ type: 'text', text }] } })
export const assistant = (text: string): Row => ({ type: 'assistant', uuid: uuid(), message: { role: 'assistant', content: [{ type: 'text', text }] } })
export const toolUse = (name: string, input: Row, id = uuid()): Row => ({ type: 'assistant', uuid: uuid(), message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } })
export const toolResult = (id: string, text: string, isError = false): Row => ({
  type: 'user',
  uuid: uuid(),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] },
})
export const interrupt = (): Row => userBlocks('[Request interrupted by user for tool use]')

export const jsonl = (rows: Row[]): string => rows.map(r => JSON.stringify(r)).join('\n') + '\n'

const filler = 'The change keeps the parser small and the tests fast; it reads each line once and skips the ones that fail. '.repeat(40)

/** A real-looking session: an edit, a correction, a skill load, a failure. About 3000 tokens. */
export function sampleSession(): string {
  return jsonl([
    { type: 'queue-operation', operation: 'enqueue' },
    user('Add a retry to fetchUser in src/api.ts'),
    toolUse('Skill', { skill: 'api-helpers' }, 's1'),
    toolResult('s1', 'loaded'),
    toolUse('Edit', { file_path: 'C:\\work\\proj\\src\\api.ts', old_string: 'a', new_string: 'b' }, 'e1'),
    toolResult('e1', 'ok'),
    toolUse('Bash', { command: 'npm test' }, 'b1'),
    toolResult('b1', 'Exit code 1\nFAIL api.test.ts', true),
    assistant(`I added a retry loop to fetchUser. ${filler}`),
    user("No, don't use a loop: use the withRetry helper in src/retry.ts instead."),
    toolUse('Edit', { file_path: 'C:\\work\\proj\\src\\api.ts', old_string: 'b', new_string: 'c' }, 'e2'),
    toolResult('e2', 'ok'),
    assistant(`Switched fetchUser to withRetry. ${filler}`),
    user('<command-name>/done</command-name>'),
    user('thanks, that works', { isMeta: true }),
    { type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: 'subagent text' }] } },
  ])
}

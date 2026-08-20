import type { OpenAIToolCall } from './types.ts'

const BLOCK_START = '<dsh_tool_calls>'
const BLOCK_END = '</dsh_tool_calls>'

/**
 * Pull a JSON tool-call array out of model text. Returns the parsed calls and
 * the assistant text with the block removed.
 */
export function parseToolCallBlock(text: string): { content: string; toolCalls: OpenAIToolCall[] } {
  const start = text.indexOf(BLOCK_START)
  const end = text.indexOf(BLOCK_END)
  if (start < 0 || end < 0 || end <= start) {
    return { content: text.trim(), toolCalls: [] }
  }
  const jsonText = text.slice(start + BLOCK_START.length, end).trim()
  const content = `${text.slice(0, start)}${text.slice(end + BLOCK_END.length)}`.trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText) as unknown
  } catch {
    return { content: text.trim(), toolCalls: [] }
  }
  const toolCalls = normalizeToolCalls(parsed)
  return { content, toolCalls }
}

function normalizeToolCalls(parsed: unknown): OpenAIToolCall[] {
  if (!Array.isArray(parsed)) return []
  const calls: OpenAIToolCall[] = []
  let index = 0
  for (const row of parsed) {
    if (row === null || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (name.length === 0) continue
    const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : `call_${String(index + 1)}`
    const argumentsValue = record.arguments
    let argumentText: string
    if (typeof argumentsValue === 'string') argumentText = argumentsValue
    else if (argumentsValue === undefined) argumentText = '{}'
    else argumentText = JSON.stringify(argumentsValue)
    calls.push({
      id,
      type: 'function',
      function: { name, arguments: argumentText },
    })
    index += 1
  }
  return calls
}

export { BLOCK_END, BLOCK_START }

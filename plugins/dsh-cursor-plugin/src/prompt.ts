import { BLOCK_END, BLOCK_START } from './tool-calls.ts'
import type { ChatMessage, OpenAIFunctionTool } from './types.ts'

/**
 * Flatten an OpenAI messages array into one Cursor SDK prompt.
 */
export function serializeMessages(messages: ChatMessage[]): string {
  const parts: string[] = []
  for (const message of messages) {
    const role = message.role.length > 0 ? message.role : 'user'
    if (role === 'tool') {
      const id = message.tool_call_id ?? ''
      parts.push(`Tool result${id.length > 0 ? ` (${id})` : ''}:\n${textContent(message.content)}`)
      continue
    }
    if (role === 'assistant' && message.tool_calls !== undefined && message.tool_calls.length > 0) {
      const names = message.tool_calls.map((call) => call.function.name).join(', ')
      parts.push(`Assistant requested tools: ${names}`)
      const extra = textContent(message.content)
      if (extra.length > 0) parts.push(extra)
      continue
    }
    const body = textContent(message.content)
    if (body.length === 0) continue
    parts.push(`${capitalize(role)}:\n${body}`)
  }
  return parts.join('\n\n')
}

/**
 * Instruct the model to emit DSH tool calls as a tagged JSON block.
 */
export function buildToolLoopPrompt(messages: ChatMessage[], tools: OpenAIFunctionTool[]): string {
  const catalog = tools
    .filter((tool) => tool.type === 'function' && tool.function.name.length > 0)
    .map((tool) => {
      const description = tool.function.description ?? ''
      const parameters = tool.function.parameters === undefined
        ? '{}'
        : JSON.stringify(tool.function.parameters)
      return `- ${tool.function.name}: ${description}\n  parameters: ${parameters}`
    })
    .join('\n')
  const history = serializeMessages(messages)
  return [
    'You are the model backend for DeepSeek Harness.',
    'You have no file, shell, or network tools of your own. DeepSeek Harness will execute tools.',
    'When you need a tool, reply with this block and nothing else:',
    BLOCK_START,
    '[{"name":"TOOL_NAME","arguments":{}}]',
    BLOCK_END,
    'Use only the tool names listed below. arguments must be a JSON object.',
    'If you do not need a tool, reply with assistant text and do not emit the block.',
    'Available tools:',
    catalog.length > 0 ? catalog : '(none)',
    '',
    'Conversation:',
    history,
  ].join('\n')
}

function textContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part !== null && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .join('')
  }
  if (content === undefined || content === null) return ''
  return typeof content === 'object' ? JSON.stringify(content) : String(content)
}

function capitalize(value: string): string {
  if (value.length === 0) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

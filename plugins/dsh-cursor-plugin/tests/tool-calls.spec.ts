import { describe, expect, it } from 'vitest'
import { BLOCK_END, BLOCK_START, parseToolCallBlock } from '../src/tool-calls.ts'
import { buildToolLoopPrompt, serializeMessages } from '../src/prompt.ts'

describe('parseToolCallBlock', () => {
  it('returns plain text when no block is present', () => {
    const result = parseToolCallBlock('Hello from Composer')
    expect(result.content).toBe('Hello from Composer')
    expect(result.toolCalls).toEqual([])
  })

  it('extracts a JSON tool-call array and strips the block', () => {
    const text = [
      'I will read the file.',
      BLOCK_START,
      '[{"name":"read_file","arguments":{"path":"src/index.ts"}}]',
      BLOCK_END,
    ].join('\n')
    const result = parseToolCallBlock(text)
    expect(result.content).toBe('I will read the file.')
    expect(result.toolCalls).toEqual([{
      id: 'call_1',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"src/index.ts"}' },
    }])
  })

  it('keeps string arguments and generated ids', () => {
    const text = `${BLOCK_START}[{"id":"call_abc","name":"bash","arguments":"{\\"cmd\\":\\"ls\\"}"}]${BLOCK_END}`
    const result = parseToolCallBlock(text)
    expect(result.toolCalls[0]?.id).toBe('call_abc')
    expect(result.toolCalls[0]?.function.arguments).toBe('{"cmd":"ls"}')
  })

  it('ignores malformed JSON and returns the original text', () => {
    const text = `${BLOCK_START}{not-json${BLOCK_END}`
    const result = parseToolCallBlock(text)
    expect(result.toolCalls).toEqual([])
    expect(result.content).toBe(text)
  })
})

describe('serializeMessages', () => {
  it('flattens user, assistant, and tool rows', () => {
    const prompt = serializeMessages([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'List files' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'bash', arguments: '{}' },
        }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'a.ts\nb.ts' },
    ])
    expect(prompt).toContain('System:\nBe brief.')
    expect(prompt).toContain('User:\nList files')
    expect(prompt).toContain('Assistant requested tools: bash')
    expect(prompt).toContain('Tool result (call_1):\na.ts\nb.ts')
  })

  it('mentions image parts so the SDK prompt is not empty', () => {
    const prompt = serializeMessages([{
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this picture?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ],
    }])
    expect(prompt).toContain('What is in this picture?')
    expect(prompt).toContain('[image attached]')
  })
})

describe('buildToolLoopPrompt', () => {
  it('lists function tools and asks for the tagged JSON block', () => {
    const prompt = buildToolLoopPrompt(
      [{ role: 'user', content: 'Read package.json' }],
      [{
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: { type: 'object' },
        },
      }],
    )
    expect(prompt).toContain(BLOCK_START)
    expect(prompt).toContain('- read_file: Read a file')
    expect(prompt).toContain('User:\nRead package.json')
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { listenCursorGateway, type CursorGateway } from '../src/gateway.ts'
import { BLOCK_END, BLOCK_START } from '../src/tool-calls.ts'
import type { CursorBackend } from '../src/types.ts'

let gateway: CursorGateway | undefined

afterEach(async () => {
  if (gateway !== undefined) {
    await gateway.close()
    gateway = undefined
  }
})

function backend(complete: string): CursorBackend {
  return {
    async listModels() {
      return [{ id: 'composer-2.5', name: 'Composer 2.5' }]
    },
    async complete() {
      return complete
    },
  }
}

async function boot(complete = 'Hello'): Promise<string> {
  gateway = await listenCursorGateway({
    listenHost: '127.0.0.1',
    listenPort: 0,
    backend: backend(complete),
    logger: { info() {}, warn() {} },
  })
  return `http://127.0.0.1:${String(gateway.port)}`
}

describe('listenCursorGateway', () => {
  it('rejects missing bearer tokens', async () => {
    const origin = await boot()
    const response = await fetch(`${origin}/v1/models`)
    expect(response.status).toBe(401)
  })

  it('lists models from the backend', async () => {
    const origin = await boot()
    const response = await fetch(`${origin}/v1/models`, {
      headers: { authorization: 'Bearer crsr_test' },
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { data: Array<{ id: string }> }
    expect(body.data[0]?.id).toBe('composer-2.5')
  })

  it('returns assistant text for a plain completion', async () => {
    const origin = await boot('Plain reply')
    const response = await fetch(`${origin}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer crsr_test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'composer-2.5',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>
    }
    expect(body.choices[0]?.message.content).toBe('Plain reply')
    expect(body.choices[0]?.finish_reason).toBe('stop')
  })

  it('parses a tool-call block when DSH sends tools', async () => {
    const origin = await boot(`${BLOCK_START}[{"name":"bash","arguments":{"command":"ls"}}]${BLOCK_END}`)
    const response = await fetch(`${origin}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer crsr_test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'composer-2.5',
        messages: [{ role: 'user', content: 'List files' }],
        tools: [{ type: 'function', function: { name: 'bash', description: 'Run a command' } }],
      }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      choices: Array<{
        finish_reason: string
        message: { tool_calls?: Array<{ function: { name: string } }> }
      }>
    }
    expect(body.choices[0]?.finish_reason).toBe('tool_calls')
    expect(body.choices[0]?.message.tool_calls?.[0]?.function.name).toBe('bash')
  })
})

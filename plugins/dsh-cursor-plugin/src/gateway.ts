import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { DEFAULT_MODEL } from './sdk-backend.ts'
import { buildToolLoopPrompt, serializeMessages } from './prompt.ts'
import { parseToolCallBlock } from './tool-calls.ts'
import type {
  ChatCompletionRequest,
  CursorBackend,
  OpenAIFunctionTool,
} from './types.ts'

export interface GatewayConfig {
  listenHost: string
  listenPort: number
  backend: CursorBackend
  logger: { info(message: string): void; warn(error: unknown): void }
}

export interface CursorGateway {
  port: number
  close(): Promise<void>
}

const MAX_BODY_BYTES = 10 * 1024 * 1024

/**
 * OpenAI-compatible loopback server for llm-pi-ai.
 */
export async function listenCursorGateway(config: GatewayConfig): Promise<CursorGateway> {
  const server = createServer((req, res) => {
    void handleRequest(config, req, res)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.listenPort, config.listenHost, () => { resolve() })
  })
  const address = server.address()
  const port = address !== null && typeof address === 'object' ? address.port : config.listenPort
  config.logger.info(`dsh-cursor-plugin: OpenAI gateway http://${config.listenHost}:${String(port)}/v1`)
  return {
    port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => { error === undefined ? resolve() : reject(error) })
    }),
  }
}

async function handleRequest(
  config: GatewayConfig,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'GET' && (url.pathname === '/healthz' || url.pathname === '/v1/health')) {
      json(res, 200, { status: 'ok' })
      return
    }
    const apiKey = bearerToken(req.headers.authorization)
    if (apiKey === undefined) {
      json(res, 401, openaiError('Missing Authorization Bearer token (CURSOR_API_KEY).'))
      return
    }
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      const models = await config.backend.listModels(apiKey)
      json(res, 200, {
        object: 'list',
        data: models.map((model) => ({
          id: model.id,
          object: 'model',
          owned_by: 'cursor',
          name: model.name,
        })),
      })
      return
    }
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      const body = await readJson(req) as ChatCompletionRequest
      await handleChatCompletions(config, apiKey, body, res)
      return
    }
    json(res, 404, openaiError('Not found'))
  } catch (error) {
    config.logger.warn(error)
    if (!res.headersSent) {
      json(res, 500, openaiError(error instanceof Error ? error.message : String(error)))
    }
  }
}

async function handleChatCompletions(
  config: GatewayConfig,
  apiKey: string,
  body: ChatCompletionRequest,
  res: ServerResponse,
): Promise<void> {
  const messages = Array.isArray(body.messages) ? body.messages : []
  const tools = functionTools(body.tools)
  const model = typeof body.model === 'string' && body.model.length > 0 ? body.model : DEFAULT_MODEL
  const prompt = tools.length > 0 && !toolChoiceNone(body.tool_choice)
    ? buildToolLoopPrompt(messages, tools)
    : serializeMessages(messages)
  const raw = await config.backend.complete(apiKey, model, prompt)
  const parsed = tools.length > 0 ? parseToolCallBlock(raw) : { content: raw.trim(), toolCalls: [] }
  const finishReason = parsed.toolCalls.length > 0 ? 'tool_calls' : 'stop'
  const id = `chatcmpl-dsh-cursor-${String(Date.now())}`
  if (body.stream === true) {
    res.writeHead(200, {
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
    })
    if (parsed.content.length > 0) {
      res.write(`data: ${JSON.stringify(chunk(id, model, { content: parsed.content }, null))}\n\n`)
    }
    if (parsed.toolCalls.length > 0) {
      res.write(`data: ${JSON.stringify(chunk(id, model, { tool_calls: parsed.toolCalls }, 'tool_calls'))}\n\n`)
    } else {
      res.write(`data: ${JSON.stringify(chunk(id, model, {}, finishReason))}\n\n`)
    }
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }
  json(res, 200, {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: parsed.toolCalls.length > 0 && parsed.content.length === 0 ? null : parsed.content,
        ...(parsed.toolCalls.length > 0 ? { tool_calls: parsed.toolCalls } : {}),
      },
      finish_reason: finishReason,
    }],
  })
}

function functionTools(tools: ChatCompletionRequest['tools']): OpenAIFunctionTool[] {
  if (!Array.isArray(tools)) return []
  return tools.filter((tool) => tool.type === 'function' && typeof tool.function?.name === 'string')
}

function toolChoiceNone(toolChoice: unknown): boolean {
  return toolChoice === 'none'
}

function chunk(
  id: string,
  model: string,
  delta: Record<string, unknown>,
  finishReason: string | null,
): Record<string, unknown> {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
}

function bearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header
  if (value === undefined) return undefined
  const match = /^Bearer\s+(\S+)/i.exec(value)
  const token = match?.[1]
  return token !== undefined && token.length > 0 ? token : undefined
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large')
    chunks.push(buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim().length === 0) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function openaiError(message: string): Record<string, unknown> {
  return { error: { message, type: 'invalid_request_error' } }
}

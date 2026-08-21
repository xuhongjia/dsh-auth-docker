/** OpenAI-compatible shapes used by the loopback gateway. */

export interface ChatMessage {
  role: string
  content?: unknown
  name?: string
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
}

export interface OpenAIFunctionTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: unknown
  }
}

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ChatCompletionRequest {
  model?: string
  messages?: ChatMessage[]
  tools?: OpenAIFunctionTool[]
  tool_choice?: unknown
  stream?: boolean
  reasoning_effort?: string
}

export interface CompletionResult {
  content: string
  toolCalls: OpenAIToolCall[]
}

export interface ModelInfo {
  id: string
  name?: string
}

export interface CursorBackend {
  listModels(apiKey: string): Promise<ModelInfo[]>
  complete(
    apiKey: string,
    model: string,
    prompt: string,
    onTextDelta?: (text: string) => void,
  ): Promise<string>
}

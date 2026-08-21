/** Cursor SDK model parameter passed to Agent.create / agent.send. */
export interface ModelParam {
  id: string
  value: string
}

/** Parsed OpenAI model id plus Cursor SDK selection params. */
export interface ModelSelection {
  /** SDK model id, without @context or :suffix qualifiers. */
  id: string
  params: ModelParam[]
}

const THINKING_SUFFIXES = new Set([
  'off',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'extra-high',
  'max',
])

const DEFAULT_MODEL = 'composer-2.5'

export interface ParseModelOptions {
  /** When the id has no `:fast`/`:slow`, send this as Cursor `fast` (Composer defaults to fast). */
  defaultFast?: boolean
}

/**
 * Parse an llm-pi-ai model id into a Cursor SDK selection.
 * Qualifiers follow pi-cursor-sdk: `gpt-5.5@1m:fast:high`.
 */
export function parseModelSelection(raw: string, options: ParseModelOptions = {}): ModelSelection {
  const trimmed = raw.trim()
  const source = trimmed.length === 0 || trimmed === 'auto' ? 'default' : trimmed
  const match = /^([^:@]+)(?:@([^:]+))?(?::(.*))?$/.exec(source)
  const id = match?.[1] ?? DEFAULT_MODEL
  const context = match?.[2]
  const suffixes = (match?.[3] ?? '')
    .split(':')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)

  const params: ModelParam[] = []
  if (context !== undefined && context.length > 0) {
    params.push({ id: 'context', value: context })
  }

  let fast: boolean | undefined
  let thinking: string | undefined
  for (const suffix of suffixes) {
    if (suffix === 'fast') {
      fast = true
      continue
    }
    if (suffix === 'slow') {
      fast = false
      continue
    }
    if (THINKING_SUFFIXES.has(suffix)) {
      thinking = suffix === 'extra-high' ? 'xhigh' : suffix
    }
  }
  if (fast === undefined && options.defaultFast !== undefined && id.startsWith('composer-')) {
    fast = options.defaultFast
  }
  if (fast !== undefined) {
    params.push({ id: 'fast', value: fast ? 'true' : 'false' })
  }
  if (thinking !== undefined) {
    applyThinking(params, thinking)
  }
  return { id, params }
}

/**
 * Append OpenAI `reasoning_effort` when the model id has no thinking suffix.
 */
export function withReasoningEffort(modelId: string, reasoningEffort: string | undefined): string {
  if (reasoningEffort === undefined) return modelId
  const effort = reasoningEffort.trim().toLowerCase()
  if (effort.length === 0 || !THINKING_SUFFIXES.has(effort)) return modelId
  const match = /^([^:@]+)(?:@([^:]+))?(?::(.*))?$/.exec(modelId.trim())
  const suffixes = (match?.[3] ?? '')
    .split(':')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
  if (suffixes.some((suffix) => THINKING_SUFFIXES.has(suffix))) return modelId
  return `${modelId}:${effort}`
}

function applyThinking(params: ModelParam[], level: string): void {
  if (level === 'off' || level === 'none') {
    setParam(params, 'thinking', 'false')
    setParam(params, 'reasoning', 'none')
    return
  }
  setParam(params, 'thinking', 'true')
  const value = level === 'xhigh' ? 'xhigh' : level
  setParam(params, 'effort', value)
  setParam(params, 'reasoning', value === 'xhigh' ? 'extra-high' : value)
}

function setParam(params: ModelParam[], id: string, value: string): void {
  const existing = params.find((param) => param.id === id)
  if (existing !== undefined) {
    existing.value = value
    return
  }
  params.push({ id, value })
}

export { DEFAULT_MODEL, THINKING_SUFFIXES }

import { mkdir } from 'node:fs/promises'
import {
  applyCatalogDefaults,
  expandModelCatalog,
  fallbackModels,
  findCatalogItem,
} from './catalog.ts'
import { FALLBACK_CURSOR_ITEMS } from './fallback-models.ts'
import { DEFAULT_MODEL, parseModelSelection, type ParseModelOptions } from './model-selection.ts'
import type { CursorBackend, CursorListItem, ModelInfo } from './types.ts'

interface SdkAgent {
  send(
    message: string,
    options?: {
      model?: { id: string; params?: Array<{ id: string; value: string }> }
      onDelta?: (args: { update: { type?: string; text?: string } }) => void
    },
  ): Promise<{ wait?: () => Promise<unknown>; cancel?: () => Promise<void> }>
}

interface SdkModule {
  Agent: {
    create(options: Record<string, unknown>): Promise<SdkAgent>
    delete?(agentId: string, options?: Record<string, unknown>): Promise<void>
  }
  Cursor: {
    models: {
      list(options?: { apiKey?: string }): Promise<unknown>
    }
  }
}

/**
 * Cursor Agent.create `disallowedTools` must use SDK names only.
 * Unknown ids (bash, terminal, write, apply_patch, web_search, browser) 500 the turn.
 * `mcp` stays allowed so DSH MCP / Cursor MCP is not blocked at Agent.create.
 */
const DISALLOWED_CURSOR_TOOLS = [
  'shell',
  'task',
  'computerUse',
  'applyAgentDiff',
  'writeShellStdin',
]

export interface SdkBackendOptions extends ParseModelOptions {}

/**
 * Cursor SDK backend. Built-in tools stay empty so DSH executes its own tools.
 * Picker ids are canonical Cursor models; qualifiers (`@context`, `:fast`, thinking) still parse.
 */
export function createSdkBackend(workspace: string, options: SdkBackendOptions = {}): CursorBackend {
  const parseOptions: ParseModelOptions = { defaultFast: options.defaultFast ?? false }
  let catalogItems: CursorListItem[] = FALLBACK_CURSOR_ITEMS
  return {
    async listModels(apiKey: string): Promise<ModelInfo[]> {
      try {
        const sdk = await loadSdk()
        const models = await sdk.Cursor.models.list({ apiKey })
        const items = Array.isArray(models) ? models as CursorListItem[] : []
        const catalog = expandModelCatalog(items)
        if (items.length > 0 && catalog.length > 0) catalogItems = items
        return catalog.length > 0 ? catalog : fallbackModels()
      } catch {
        return fallbackModels()
      }
    },
    async complete(apiKey, model, prompt, onTextDelta): Promise<string> {
      const sdk = await loadSdk()
      await mkdir(workspace, { recursive: true })
      const parsed = parseModelSelection(model, parseOptions)
      const item = findCatalogItem(catalogItems, parsed.id)
        ?? findCatalogItem(FALLBACK_CURSOR_ITEMS, parsed.id)
      const selection = applyCatalogDefaults(parsed, item, parseOptions)
      const modelOption = selection.params.length > 0
        ? { id: selection.id, params: selection.params }
        : { id: selection.id }
      const agent = await sdk.Agent.create({
        apiKey,
        model: modelOption,
        tools: [],
        disallowedTools: DISALLOWED_CURSOR_TOOLS,
        local: {
          cwd: workspace,
          settingSources: [],
        },
      })
      const chunks: string[] = []
      try {
        const run = await agent.send(prompt, {
          model: modelOption,
          onDelta: ({ update }) => {
            if (update.type === 'text-delta' && typeof update.text === 'string' && update.text.length > 0) {
              chunks.push(update.text)
              onTextDelta?.(update.text)
            }
          },
        })
        if (run.wait !== undefined) await run.wait()
      } finally {
        await disposeAgent(sdk, agent)
      }
      return chunks.join('')
    },
  }
}

async function loadSdk(): Promise<SdkModule> {
  try {
    return await import('@cursor/sdk') as unknown as SdkModule
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`dsh-cursor-plugin: failed to load @cursor/sdk (${detail})`)
  }
}

async function disposeAgent(sdk: SdkModule, agent: SdkAgent): Promise<void> {
  const record = agent as unknown as { agentId?: string; [Symbol.asyncDispose]?: () => Promise<void> }
  const dispose = record[Symbol.asyncDispose]
  try {
    if (typeof dispose === 'function') {
      await dispose.call(record)
      return
    }
    if (typeof sdk.Agent.delete === 'function' && typeof record.agentId === 'string') {
      await sdk.Agent.delete(record.agentId)
    }
  } catch {
    // Best-effort cleanup; the next request creates a new local agent.
  }
}

export { DEFAULT_MODEL, DISALLOWED_CURSOR_TOOLS }

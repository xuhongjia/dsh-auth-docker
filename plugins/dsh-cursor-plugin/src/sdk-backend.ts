import { mkdir } from 'node:fs/promises'
import type { CursorBackend, ModelInfo } from './types.ts'

const DEFAULT_MODEL = 'composer-2.5'

interface SdkAgent {
  send(
    message: string,
    options?: {
      model?: { id: string }
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
      list(options?: { apiKey?: string }): Promise<Array<{ id: string; displayName?: string }>>
    }
  }
}

/**
 * Cursor SDK backend. Built-in tools are empty so DSH executes its own tools.
 */
export function createSdkBackend(workspace: string): CursorBackend {
  return {
    async listModels(apiKey: string): Promise<ModelInfo[]> {
      const sdk = await loadSdk()
      const models = await sdk.Cursor.models.list({ apiKey })
      if (models.length === 0) return [{ id: DEFAULT_MODEL, name: 'Composer 2.5' }]
      return models
        .filter((model) => typeof model.id === 'string' && model.id.length > 0)
        .map((model) => ({
          id: model.id,
          name: model.displayName,
        }))
    },
    async complete(apiKey, model, prompt, onTextDelta): Promise<string> {
      const sdk = await loadSdk()
      await mkdir(workspace, { recursive: true })
      const agent = await sdk.Agent.create({
        apiKey,
        model: { id: model.length > 0 ? model : DEFAULT_MODEL },
        tools: [],
        disallowedTools: ['shell', 'task'],
        local: {
          cwd: workspace,
          settingSources: [],
        },
      })
      const chunks: string[] = []
      try {
        const run = await agent.send(prompt, {
          model: { id: model.length > 0 ? model : DEFAULT_MODEL },
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

export { DEFAULT_MODEL }

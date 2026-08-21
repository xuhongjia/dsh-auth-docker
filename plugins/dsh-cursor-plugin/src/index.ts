/**
 * Out-of-tree DeepSeek Harness bundle: loopback OpenAI gateway over the
 * official Cursor SDK so DSH tools and skills stay on the Harness agent loop.
 * @module dsh-cursor-plugin
 */

import { createSdkBackend } from './sdk-backend.ts'
import { listenCursorGateway } from './gateway.ts'

/** Cordis plugin name. */
export const name = 'dsh-cursor-plugin'

export interface CursorPluginConfig {
  listenHost?: string
  listenPort?: number
  workspace?: string
  /** Composer defaults to Cursor fast; false matches pi-cursor-sdk `--cursor-no-fast`. */
  defaultFast?: boolean
}

interface PluginContext {
  logger: { info(message: string): void; warn(error: unknown): void }
  effect(callback: () => (() => void) | Promise<() => void>, label?: string): void
}

/**
 * Bind the loopback OpenAI gateway. Failures are logged so /login still boots.
 */
export async function apply(ctx: PluginContext, config: CursorPluginConfig = {}): Promise<void> {
  const listenHost = config.listenHost ?? '127.0.0.1'
  const listenPort = config.listenPort ?? 3090
  const workspace = config.workspace ?? `${process.env.DSH_HOME ?? process.cwd()}/cursor-gateway`
  try {
    const gateway = await listenCursorGateway({
      listenHost,
      listenPort,
      backend: createSdkBackend(workspace, { defaultFast: config.defaultFast ?? false }),
      logger: ctx.logger,
    })
    ctx.effect(() => async () => {
      await gateway.close()
    }, 'dsh-cursor-plugin: openai gateway')
  } catch (error) {
    ctx.logger.warn(error)
    ctx.logger.warn('dsh-cursor-plugin: gateway failed to listen; Cursor provider will be unavailable')
  }
}

export type { CursorPluginConfig as Config }

/**
 * Out-of-tree DeepSeek Harness bundle: a Better Auth reverse proxy in front of
 * the official Web profile. Account passwords never enter DSH model RPC.
 * @module dsh-auth
 */

import { DatabaseSync } from 'node:sqlite'
import { createAuth, ensureDatabaseFile, migrateAuth, seedInitialUser } from './auth.ts'
import { resolveAuthConfig, type AuthPluginConfig } from './config.ts'
import { listenAuthGateway } from './gateway.ts'

/** Cordis plugin name. */
export const name = 'dsh-auth'

/** Wait for the official webserver so we can proxy to its bound port. */
export const inject = ['webServer']

/** Minimal ctx used by this plugin; filled by official DSH at runtime. */
interface PluginContext {
  webServer: { port: number }
  logger: { info(message: string): void; warn(error: unknown): void }
  effect(callback: () => (() => void) | Promise<() => void>, label?: string): void
}

/**
 * Bind the public auth gateway in front of official `dsh --profile web`.
 * @param ctx - Cordis context after `webServer` has listened.
 * @param config - bundle patch values.
 */
export async function apply(ctx: PluginContext, config: AuthPluginConfig = {}): Promise<void> {
  const resolved = resolveAuthConfig(config)
  await ensureDatabaseFile(resolved.path)
  const db = new DatabaseSync(resolved.path)
  const auth = createAuth(resolved, db)
  await migrateAuth(auth)
  await seedInitialUser(auth, db, resolved)
  const gateway = await listenAuthGateway(resolved, auth, ctx.webServer.port)
  ctx.logger.info(
    `dsh-auth: public http://${resolved.listenHost}:${String(gateway.port)} → 127.0.0.1:${String(ctx.webServer.port)}`,
  )
  ctx.effect(() => async () => {
    await new Promise<void>((resolve, reject) => {
      gateway.server.close((error) => { error === undefined ? resolve() : reject(error) })
    })
    db.close()
  }, 'dsh-auth: public server')
}

export type { AuthPluginConfig }

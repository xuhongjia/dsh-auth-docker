import { mkdir, open } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { admin, username } from 'better-auth/plugins'
import type { ResolvedAuthConfig } from './config.ts'

/** Create the concrete Better Auth type so plugin APIs remain visible. */
export function createAuth(config: ResolvedAuthConfig, database: DatabaseSync) {
  return betterAuth({
    appName: 'DeepSeek Harness',
    baseURL: config.baseURL,
    basePath: config.basePath,
    secret: config.secret,
    database,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: config.minPasswordLength,
      revokeSessionsOnPasswordReset: true,
    },
    plugins: [
      username({ displayUsername: false }),
      admin(),
    ],
    session: {
      expiresIn: config.sessionExpiresIn,
      updateAge: Math.min(86400, config.sessionExpiresIn),
    },
    trustedOrigins: config.trustedOrigins,
    advanced: {
      useSecureCookies: config.secureCookies,
    },
  })
}

export type AuthInstance = ReturnType<typeof createAuth>

/** Create the auth directory and an owner-only database file when absent. */
export async function ensureDatabaseFile(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  try {
    const handle = await open(path, 'wx', 0o600)
    await handle.close()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

/** Apply Better Auth's SQL migrations to the opened database. */
export async function migrateAuth(auth: AuthInstance): Promise<void> {
  const migrations = await getMigrations(auth.options)
  await migrations.runMigrations()
}

/**
 * Create the first administrator when the user table is empty.
 * Existing databases are never overwritten by bootstrap values.
 */
export async function seedInitialUser(auth: AuthInstance, db: DatabaseSync, config: ResolvedAuthConfig): Promise<void> {
  const count = db.prepare('SELECT COUNT(*) AS count FROM user').get() as { count: number }
  if (count.count > 0) return
  const password = process.env[config.bootstrapPasswordEnv]
  if (password === undefined || password.length === 0) {
    throw new Error(`dsh-auth: ${config.bootstrapPasswordEnv} is required when ${config.path} has no users`)
  }
  await auth.api.createUser({
    body: {
      email: config.bootstrapEmail,
      name: config.bootstrapName,
      password,
      role: 'admin',
      data: { username: config.bootstrapUsername },
    },
  })
}

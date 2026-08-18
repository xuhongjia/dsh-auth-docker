import { resolve } from 'node:path'

/** Plugin configuration accepted from the bundle patch and environment. */
export interface AuthPluginConfig {
  /** Better Auth SQLite database path. */
  path?: string
  /** Public origin used by Better Auth for redirects and origin checks. */
  baseURL?: string
  /** Better Auth route prefix; must not overlap Harness `/api`. */
  basePath?: string
  /** Additional browser origins accepted by Better Auth. */
  trustedOrigins?: string[]
  /** Public bind host of this reverse proxy. */
  listenHost?: string
  /** Public bind port of this reverse proxy. */
  listenPort?: number
  /** Initial username used only when the database has no user. */
  bootstrapUsername?: string
  /** Initial email required by Better Auth's user model. */
  bootstrapEmail?: string
  /** Initial display name used only when the database has no user. */
  bootstrapName?: string
  /** Environment variable containing the initial password. */
  bootstrapPasswordEnv?: string
  /** Environment variable containing the Better Auth signing secret. */
  secretEnv?: string
  /** Session lifetime in seconds. */
  sessionExpiresIn?: number
  /** Minimum accepted password length. */
  minPasswordLength?: number
  /** Whether Better Auth sets Secure on its cookies. */
  secureCookies?: boolean
}

/** Resolved values after defaults and environment overlays. */
export interface ResolvedAuthConfig {
  path: string
  baseURL: string
  basePath: string
  trustedOrigins: string[]
  listenHost: string
  listenPort: number
  bootstrapUsername: string
  bootstrapEmail: string
  bootstrapName: string
  bootstrapPasswordEnv: string
  secret: string
  sessionExpiresIn: number
  minPasswordLength: number
  secureCookies: boolean
}

/** Normalize and validate a route prefix so it cannot overlap `/api` or `/`. */
export function normalizeBasePath(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (!/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(normalized) || normalized === '/api') {
    throw new Error(`dsh-auth: basePath must be an absolute route prefix other than /api, got ${JSON.stringify(value)}`)
  }
  return normalized
}

/** Keep redirects inside the current Web origin. */
export function safeRedirect(value: string | null): string {
  if (value === null || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

/**
 * Resolve deployment defaults. Missing password/secret values fail later at seed
 * or immediately here for the signing secret, which every boot needs.
 * @param config - patch-supplied values.
 * @param listenPortFallback - public port when neither config nor PORT is set.
 */
export function resolveAuthConfig(config: AuthPluginConfig, listenPortFallback = 3080): ResolvedAuthConfig {
  const listenPort = Number(process.env.PORT ?? config.listenPort ?? listenPortFallback)
  if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) {
    throw new Error(`dsh-auth: listenPort must be an integer 0-65535, got ${JSON.stringify(listenPort)}`)
  }
  const basePath = normalizeBasePath(config.basePath ?? '/auth')
  const listenHost = config.listenHost ?? '0.0.0.0'
  const configuredBaseURL = config.baseURL || process.env.DSH_AUTH_BASE_URL
  const baseURL = configuredBaseURL || `http://127.0.0.1:${listenPort === 0 ? String(listenPortFallback) : String(listenPort)}`
  const extraOrigins = (process.env.DSH_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0)
  const secretEnv = config.secretEnv ?? 'DSH_AUTH_SECRET'
  const secret = process.env[secretEnv]
  if (secret === undefined || secret.length < 32) {
    throw new Error(`dsh-auth: ${secretEnv} must be set to a secret at least 32 characters long`)
  }
  if (config.path === undefined || config.path.trim() === '') {
    throw new Error('dsh-auth: path is required')
  }
  return {
    path: resolve(config.path),
    baseURL,
    basePath,
    trustedOrigins: [...new Set([baseURL, ...(config.trustedOrigins ?? []), ...extraOrigins])],
    listenHost,
    listenPort,
    bootstrapUsername: config.bootstrapUsername ?? 'admin',
    bootstrapEmail: config.bootstrapEmail ?? 'admin@dsh.local',
    bootstrapName: config.bootstrapName ?? 'Administrator',
    bootstrapPasswordEnv: config.bootstrapPasswordEnv ?? 'DSH_AUTH_PASSWORD',
    secret,
    sessionExpiresIn: config.sessionExpiresIn ?? 604800,
    minPasswordLength: config.minPasswordLength ?? 12,
    secureCookies: config.secureCookies ?? false,
  }
}

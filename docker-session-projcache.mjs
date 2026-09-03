/**
 * Move a stale DSH 0.1.2 session projection cache out of the way.
 *
 * Official discussion: https://github.com/deepseek-ai/deepseek-harness/discussions/5396
 * `checkpointIdentity` gained required `isSeeded` / `inheritedEventCount`.
 * Legacy bootstrap copies old `session_projcache.json` records, stamps the new
 * domain version, and does not migrate those fields. Zod then aborts the
 * whole plugin tree. The cache is derived; `$DSH_HOME/sessions/*.jsonl` is
 * the authority. Never touch sessions, workspace.json, or auth sqlite.
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_WALK_DEPTH = 8

/**
 * @param {unknown} identity
 * @returns {boolean}
 */
export function checkpointIdentityLooksStale(identity) {
  if (identity === null || typeof identity !== 'object' || Array.isArray(identity)) return false
  return identity.isSeeded === undefined || identity.inheritedEventCount === undefined
}

/**
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {boolean}
 */
export function jsonValueHasStaleCheckpointIdentity(value, depth = 0) {
  if (depth > MAX_WALK_DEPTH || value === null || typeof value !== 'object') return false
  if (!Array.isArray(value) && checkpointIdentityLooksStale(value.identity)) return true
  for (const child of Object.values(value)) {
    if (jsonValueHasStaleCheckpointIdentity(child, depth + 1)) return true
  }
  return false
}

/**
 * @param {string} dshHome
 * @returns {{ storages: string, legacyFile: string, cacheDir: string }}
 */
export function sessionProjcachePaths(dshHome) {
  const storages = join(dshHome, 'storages')
  return {
    storages,
    legacyFile: join(storages, 'session_projcache.json'),
    cacheDir: join(storages, 'session_projcache'),
  }
}

/**
 * @param {string} dir
 * @param {string[]} [found]
 * @returns {string[]}
 */
function walkJsonFiles(dir, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    // Unreadable directory (NAS EACCES); skip this branch.
    return found
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue
      walkJsonFiles(path, found)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.json')) found.push(path)
  }
  return found
}

/**
 * Unreadable or invalid JSON is treated as stale: one bad record aborts DSH boot.
 * @param {string} file
 * @returns {boolean}
 */
export function jsonFileHasStaleCheckpointIdentity(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return true
  }
  try {
    return jsonValueHasStaleCheckpointIdentity(JSON.parse(text))
  } catch {
    return true
  }
}

/**
 * @param {string} dshHome
 * @returns {boolean}
 */
export function sessionProjcacheLooksStale(dshHome) {
  const { legacyFile, cacheDir } = sessionProjcachePaths(dshHome)
  if (existsSync(legacyFile) && jsonFileHasStaleCheckpointIdentity(legacyFile)) return true
  if (!existsSync(cacheDir)) return false
  try {
    if (!statSync(cacheDir).isDirectory()) return false
  } catch {
    return false
  }
  for (const file of walkJsonFiles(cacheDir)) {
    if (jsonFileHasStaleCheckpointIdentity(file)) return true
  }
  return false
}

/**
 * @param {string} dshHome
 * @returns {string[]} destinations that received a renamed path
 */
export function resetStaleSessionProjcache(dshHome) {
  if (!sessionProjcacheLooksStale(dshHome)) return []
  const { legacyFile, cacheDir } = sessionProjcachePaths(dshHome)
  const stamp = Date.now()
  const moved = []
  for (const path of [legacyFile, cacheDir]) {
    if (!existsSync(path)) continue
    const dest = `${path}.bak-dsh-auth-${stamp}`
    renameSync(path, dest)
    moved.push(dest)
  }
  return moved
}

function main() {
  const home = process.env.DSH_HOME
  if (home === undefined || home.length === 0) process.exit(0)
  let moved
  try {
    moved = resetStaleSessionProjcache(home)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`dsh-auth: could not move stale session_projcache: ${message}\n`)
    process.exit(0)
  }
  if (moved.length === 0) return
  process.stderr.write(
    `dsh-auth: moved stale session projection cache (DSH 0.1.2 identity schema); sessions/*.jsonl kept: ${moved.join(', ')}\n`,
  )
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  main()
}

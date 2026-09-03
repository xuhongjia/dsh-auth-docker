/**
 * Move a stale DSH 0.1.2 session projection cache out of the way.
 *
 * Official discussion: https://github.com/deepseek-ai/deepseek-harness/discussions/5396
 * `checkpointIdentity` gained required `isSeeded` / `inheritedEventCount`.
 * Legacy bootstrap copies old `session_projcache.json` records, stamps the new
 * domain version, and does not migrate those fields. Zod then aborts the
 * whole plugin tree. The cache is derived; `$DSH_HOME/sessions/*.jsonl` is
 * the authority. Never touch sessions, workspace.json, or auth sqlite.
 *
 * NAS Dirent.isFile()/isDirectory() can be wrong on bind mounts, so the tree
 * walk uses statSync. The first boot also force-moves any existing cache when
 * the marker is missing, in case a scan still misses a bad record.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_WALK_DEPTH = 8

/** Written after a move (or an inspect of an empty home) so force-once does not repeat. */
export const PROJCACHE_MIGRATION_MARKER = '.dsh-auth-projcache-identity-v5'

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
 * @returns {{ storages: string, legacyFile: string, cacheDir: string, marker: string }}
 */
export function sessionProjcachePaths(dshHome) {
  const storages = join(dshHome, 'storages')
  return {
    storages,
    legacyFile: join(storages, 'session_projcache.json'),
    cacheDir: join(storages, 'session_projcache'),
    marker: join(storages, PROJCACHE_MIGRATION_MARKER),
  }
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * @param {string} dir
 * @param {string[]} [found]
 * @returns {string[]}
 */
export function walkJsonFiles(dir, found = []) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    // Unreadable directory (NAS EACCES); skip this branch.
    return found
  }
  for (const name of names) {
    if (name.startsWith('.')) continue
    const path = join(dir, name)
    if (isDirectory(path)) {
      walkJsonFiles(path, found)
      continue
    }
    if (name.endsWith('.json')) found.push(path)
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
  if (!existsSync(cacheDir) || !isDirectory(cacheDir)) return false
  for (const file of walkJsonFiles(cacheDir)) {
    if (jsonFileHasStaleCheckpointIdentity(file)) return true
  }
  return false
}

/**
 * @param {string} storages
 */
function writeMigrationMarker(storages) {
  mkdirSync(storages, { recursive: true })
  writeFileSync(join(storages, PROJCACHE_MIGRATION_MARKER), 'identity-v5\n')
}

/**
 * @param {string} dshHome
 * @returns {string[]}
 */
function renameSessionProjcache(dshHome) {
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

/**
 * @param {string} dshHome
 * @param {{ forceOnce?: boolean }} [options]
 * @returns {string[]} destinations that received a renamed path
 */
export function resetStaleSessionProjcache(dshHome, options = {}) {
  const forceOnce = options.forceOnce !== false
  const { storages, legacyFile, cacheDir, marker } = sessionProjcachePaths(dshHome)
  const stale = sessionProjcacheLooksStale(dshHome)
  const hasCache = existsSync(legacyFile) || (existsSync(cacheDir) && isDirectory(cacheDir))
  const force = forceOnce && !existsSync(marker) && hasCache
  if (!stale && !force) {
    if (forceOnce && !existsSync(marker) && existsSync(storages)) writeMigrationMarker(storages)
    return []
  }
  const moved = renameSessionProjcache(dshHome)
  writeMigrationMarker(storages)
  return moved
}

function main() {
  const home = process.env.DSH_HOME
  if (home === undefined || home.length === 0) process.exit(0)
  const { marker } = sessionProjcachePaths(home)
  const hadMarker = existsSync(marker)
  let moved
  try {
    moved = resetStaleSessionProjcache(home)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`dsh-auth: could not move stale session_projcache: ${message}\n`)
    process.exit(0)
  }
  if (moved.length === 0) return
  const reason = hadMarker
    ? 'stale 0.1.2 identity schema'
    : 'one-shot 0.1.2 identity migration'
  process.stderr.write(
    `dsh-auth: moved session projection cache (${reason}); sessions/*.jsonl kept: ${moved.join(', ')}\n`,
  )
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  main()
}

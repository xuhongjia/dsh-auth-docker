/**
 * Profile-bundle helpers for the Docker entrypoint.
 *
 * Official DSH resolves a bundle by finding a directory that contains
 * package.json (see packageDirFromAnchor). It does not use
 * require.resolve(`${name}/package.json`), which fails for marketplace
 * packages that omit "./package.json" from "exports" (for example
 * @openviking/dsh-memory-plugin).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * @param {string} profileDir
 * @param {string} packageName
 * @returns {string | undefined}
 */
export function packageDirFromProfile(profileDir, packageName) {
  const requireFromProfile = createRequire(join(profileDir, 'package.json'))
  for (const searchPath of requireFromProfile.resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName)
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return undefined
}

/**
 * @param {string} profileDir
 * @returns {Record<string, unknown> | undefined}
 */
export function readProfileManifest(profileDir) {
  const manifestPath = join(profileDir, 'package.json')
  if (!existsSync(manifestPath)) return undefined
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

/**
 * @param {unknown} manifest
 * @returns {string[]}
 */
export function bundleNames(manifest) {
  const bundles = manifest?.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) return []
  return bundles.filter((name) => typeof name === 'string' && name.length > 0)
}

/**
 * @param {string} packageDir
 * @returns {boolean}
 */
export function declaresBundlePatch(packageDir) {
  const manifestPath = join(packageDir, 'package.json')
  if (!existsSync(manifestPath)) return false
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return typeof manifest?.dsh?.bundle?.patch === 'string'
}

/**
 * @param {string} profileDir
 * @returns {string[]}
 */
export function listUnresolvableProfileBundles(profileDir) {
  const manifest = readProfileManifest(profileDir)
  if (manifest === undefined) return []
  return bundleNames(manifest).filter((name) => packageDirFromProfile(profileDir, name) === undefined)
}

/**
 * Put dependency-managed bundles back on the layer list. A previous boot that
 * used require.resolve(`${name}/package.json`) stripped rows whose files were
 * still on disk.
 *
 * @param {string} profileDir
 * @returns {string[]} restored package names
 */
export function restoreDependencyProfileBundles(profileDir) {
  const manifest = readProfileManifest(profileDir)
  if (manifest === undefined) return []
  const bundles = bundleNames(manifest)
  const kept = new Set(bundles)
  const restored = []
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (kept.has(name)) continue
    const dir = packageDirFromProfile(profileDir, name)
    if (dir === undefined || !declaresBundlePatch(dir)) continue
    bundles.push(name)
    kept.add(name)
    restored.push(name)
  }
  if (restored.length === 0) return []
  manifest.dsh = manifest.dsh ?? {}
  manifest.dsh.profile = manifest.dsh.profile ?? {}
  manifest.dsh.profile.bundles = bundles
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return restored
}

/**
 * @param {string} profileDir
 * @returns {string[]} dropped package names
 */
export function pruneUnresolvableProfileBundles(profileDir) {
  const manifest = readProfileManifest(profileDir)
  if (manifest === undefined) return []
  const kept = []
  const dropped = []
  for (const name of bundleNames(manifest)) {
    if (packageDirFromProfile(profileDir, name) === undefined) dropped.push(name)
    else kept.push(name)
  }
  if (dropped.length === 0) return []
  manifest.dsh = manifest.dsh ?? {}
  manifest.dsh.profile = manifest.dsh.profile ?? {}
  manifest.dsh.profile.bundles = kept
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return dropped
}

/** Package 0.1.2 CLI no longer ships; old @linxin666/dsh-remote-web-ui still imports it. */
export const DSH_HOST_APIPROXY = '@deepseek-ai/dsh-host-apiproxy'

/**
 * @param {unknown} exportsField
 * @returns {string[]}
 */
function exportEntryPaths(exportsField) {
  if (typeof exportsField === 'string') return [exportsField]
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) return []
  const dot = exportsField['.']
  if (typeof dot === 'string') return [dot]
  if (dot === null || typeof dot !== 'object' || Array.isArray(dot)) return []
  return [dot.import, dot.default, dot.require].filter((rel) => typeof rel === 'string')
}

/**
 * @param {string} packageDir
 * @returns {string[]}
 */
export function packageEntryFiles(packageDir) {
  const files = []
  const seen = new Set()
  const add = (rel) => {
    if (typeof rel !== 'string' || rel.length === 0) return
    const path = join(packageDir, rel)
    if (seen.has(path)) return
    seen.add(path)
    files.push(path)
  }
  if (!existsSync(join(packageDir, 'package.json'))) {
    add('lib/index.js')
    return files
  }
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  for (const rel of exportEntryPaths(manifest.exports)) add(rel)
  add(manifest.module)
  add(manifest.main)
  add('lib/index.js')
  add('index.js')
  return files
}

/**
 * @param {string} packageDir
 * @param {string} specifier
 * @returns {boolean}
 */
export function packageEntryImportsSpecifier(packageDir, specifier) {
  for (const file of packageEntryFiles(packageDir)) {
    if (!existsSync(file)) continue
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (text.includes(specifier)) return true
  }
  return false
}

/**
 * @param {string} profileDir
 * @param {string} fromPackageDir
 * @param {string} packageName
 * @returns {string | undefined}
 */
function resolveInstalledPackage(profileDir, fromPackageDir, packageName) {
  const hoisted = packageDirFromProfile(profileDir, packageName)
  if (hoisted !== undefined) return hoisted
  const nested = join(fromPackageDir, 'node_modules', packageName)
  if (existsSync(join(nested, 'package.json'))) return nested
  return undefined
}

/**
 * True when this profile bundle (or a nested plugin it loads) still imports a
 * specifier that is not installed in the profile — for example 0.1.1
 * `@deepseek-ai/dsh-host-apiproxy` from `@linxin666/dsh-remote-web-ui@0.3.6`.
 *
 * @param {string} profileDir
 * @param {string} bundleName
 * @param {string} specifier
 * @returns {boolean}
 */
export function bundleImportsUnresolvedSpecifier(profileDir, bundleName, specifier) {
  if (packageDirFromProfile(profileDir, specifier) !== undefined) return false
  const dir = packageDirFromProfile(profileDir, bundleName)
  if (dir === undefined) return false
  if (packageEntryImportsSpecifier(dir, specifier)) return true
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    return false
  }
  for (const dep of Object.keys(manifest.dependencies ?? {})) {
    const nested = resolveInstalledPackage(profileDir, dir, dep)
    if (nested !== undefined && packageEntryImportsSpecifier(nested, specifier)) return true
  }
  const patchRel = manifest?.dsh?.bundle?.patch
  if (typeof patchRel !== 'string') return false
  const patchPath = join(dir, patchRel)
  if (!existsSync(patchPath)) return false
  let patch
  try {
    patch = readFileSync(patchPath, 'utf8')
  } catch {
    return false
  }
  if (patch.includes(specifier)) return true
  for (const match of patch.matchAll(/@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/g)) {
    const name = match[0]
    if (name === bundleName || name === specifier) continue
    const nested = resolveInstalledPackage(profileDir, dir, name)
    if (nested !== undefined && packageEntryImportsSpecifier(nested, specifier)) return true
  }
  return false
}

/**
 * Drop profile bundles whose load would `ERR_MODULE_NOT_FOUND` on `specifier`.
 * Files stay on disk; restore + this command re-evaluate every boot so a later
 * upgrade (for example `@linxin666/dsh-remote-web-ui@0.3.12`) stays listed.
 *
 * @param {string} profileDir
 * @param {string} specifier
 * @returns {string[]} dropped package names
 */
export function quarantineBundlesImportingSpecifier(profileDir, specifier) {
  const manifest = readProfileManifest(profileDir)
  if (manifest === undefined) return []
  const kept = []
  const dropped = []
  for (const name of bundleNames(manifest)) {
    if (bundleImportsUnresolvedSpecifier(profileDir, name, specifier)) dropped.push(name)
    else kept.push(name)
  }
  if (dropped.length === 0) return []
  manifest.dsh = manifest.dsh ?? {}
  manifest.dsh.profile = manifest.dsh.profile ?? {}
  manifest.dsh.profile.bundles = kept
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return dropped
}

function main(argv) {
  const command = argv[2]
  const dir = process.env.PROFILE_DIR
  if (dir === undefined || dir.length === 0) process.exit(0)
  if (command === 'list') {
    for (const name of listUnresolvableProfileBundles(dir)) process.stdout.write(`${name}\n`)
    return
  }
  if (command === 'restore') {
    const restored = restoreDependencyProfileBundles(dir)
    if (restored.length > 0) {
      process.stderr.write(
        `dsh-auth: restored profile bundles from dependencies: ${restored.join(', ')}\n`,
      )
    }
    return
  }
  if (command === 'prune') {
    const dropped = pruneUnresolvableProfileBundles(dir)
    if (dropped.length > 0) {
      process.stderr.write(
        `dsh-auth: dropped unresolvable profile bundles: ${dropped.join(', ')} (re-add with dsh plugin add)\n`,
      )
    }
    return
  }
  if (command === 'quarantine') {
    const specifier = argv[3] ?? DSH_HOST_APIPROXY
    const dropped = quarantineBundlesImportingSpecifier(dir, specifier)
    if (dropped.length > 0) {
      process.stderr.write(
        `dsh-auth: dropped profile bundles that import missing ${specifier}: ${dropped.join(', ')} (upgrade with: dsh plugin add @linxin666/dsh-web-all)\n`,
      )
    }
    return
  }
  process.stderr.write(`dsh-auth: unknown profile-bundle command ${String(command)}\n`)
  process.exit(1)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  main(process.argv)
}

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
  process.stderr.write(`dsh-auth: unknown profile-bundle command ${String(command)}\n`)
  process.exit(1)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  main(process.argv)
}

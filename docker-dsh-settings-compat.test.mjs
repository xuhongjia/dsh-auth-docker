import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import {
  COMPAT_MARKER,
  findSettingsIndexFiles,
  patchSettingsCompat,
  patchSettingsIndex,
} from './docker-dsh-settings-compat.mjs'

const ALPHA_EXPORT = 'export function redactSecrets() { return null }\n'
const RC_EXPORT = 'export { SettingsConflictError, SettingsProvider, SettingsProvider as default, deepEqualJson, installSettingsSection, redactSecrets, settingsNamespace };\n'

let root

afterEach(async () => {
  if (root !== undefined) {
    await rm(root, { recursive: true, force: true })
    root = undefined
  }
})

describe('patchSettingsIndex', () => {
  it('appends the 0.1.1 wrappers onto a 0.1.2 index that dropped them', () => {
    const { source, changed } = patchSettingsIndex(ALPHA_EXPORT)
    assert.equal(changed, true)
    assert.ok(source.includes(COMPAT_MARKER))
    assert.ok(source.includes('export function installSettingsSection'))
    assert.ok(source.includes('export function settingsNamespace'))
  })

  it('does not append twice', () => {
    const once = patchSettingsIndex(ALPHA_EXPORT).source
    const twice = patchSettingsIndex(once)
    assert.equal(twice.changed, false)
    assert.equal(twice.source, once)
  })

  it('leaves a 0.1.1 index that already exports the wrappers', () => {
    const { changed, source } = patchSettingsIndex(RC_EXPORT)
    assert.equal(changed, false)
    assert.equal(source, RC_EXPORT)
  })
})

describe('findSettingsIndexFiles and patchSettingsCompat', () => {
  it('rewrites a nested @deepseek-ai/dsh-settings copy so the named exports exist', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-settings-compat-'))
    const index = join(
      root,
      'node_modules',
      '@deepseek-ai',
      'dsh',
      'node_modules',
      '@deepseek-ai',
      'dsh-settings',
      'lib',
      'index.js',
    )
    await mkdir(dirname(index), { recursive: true })
    await writeFile(index, `${ALPHA_EXPORT}`)
    assert.deepEqual(findSettingsIndexFiles(join(root, 'node_modules')), [index])
    const rewritten = patchSettingsCompat([join(root, 'node_modules')])
    assert.deepEqual(rewritten, [index])
    const loaded = await import(`${pathToFileURL(index).href}?t=${Date.now()}`)
    assert.equal(typeof loaded.redactSecrets, 'function')
    assert.equal(typeof loaded.installSettingsSection, 'function')
    assert.equal(typeof loaded.settingsNamespace, 'function')
    assert.equal(loaded.settingsNamespace('skin-background'), 'skin-background')
    assert.throws(() => loaded.settingsNamespace('NOPE'), /must match/)
    const text = await readFile(index, 'utf8')
    assert.ok(text.includes(COMPAT_MARKER))
    assert.deepEqual(patchSettingsCompat([join(root, 'node_modules')]), [])
  })
})

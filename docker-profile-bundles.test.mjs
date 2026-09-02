import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  listUnresolvableProfileBundles,
  packageDirFromProfile,
  pruneUnresolvableProfileBundles,
  restoreDependencyProfileBundles,
} from './docker-profile-bundles.mjs'

const PACKAGE = '@openviking/dsh-memory-plugin'
let root

afterEach(async () => {
  if (root !== undefined) {
    await rm(root, { recursive: true, force: true })
    root = undefined
  }
})

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function profileWithMarketplacePlugin(options = {}) {
  root = await mkdtemp(join(tmpdir(), 'dsh-profile-bundles-'))
  const pkgDir = join(root, 'node_modules', '@openviking', 'dsh-memory-plugin')
  if (options.install !== false) {
    await mkdir(pkgDir, { recursive: true })
    await writeJson(join(pkgDir, 'package.json'), {
      name: PACKAGE,
      type: 'module',
      exports: { '.': './index.mjs' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    })
    await writeFile(join(pkgDir, 'index.mjs'), 'export {}\n')
    await writeFile(join(pkgDir, 'cordis.patch.yml'), '[]\n')
  }
  await writeJson(join(root, 'package.json'), {
    name: 'dsh-profile-web',
    private: true,
    dependencies: options.inDependencies === false ? {} : { [PACKAGE]: '0.2.1' },
    dsh: {
      profile: {
        bundles: options.inBundles === false ? [] : [PACKAGE],
      },
    },
  })
  return root
}

describe('packageDirFromProfile', () => {
  it('finds a package that does not export ./package.json', async () => {
    const dir = await profileWithMarketplacePlugin()
    assert.equal(
      packageDirFromProfile(dir, PACKAGE),
      join(dir, 'node_modules', '@openviking', 'dsh-memory-plugin'),
    )
    assert.throws(
      () => createRequire(join(dir, 'package.json')).resolve(`${PACKAGE}/package.json`),
      /Package subpath '\.\/package\.json' is not defined by "exports"/,
    )
  })
})

describe('listUnresolvableProfileBundles', () => {
  it('does not treat an installed exports-limited bundle as missing', async () => {
    const dir = await profileWithMarketplacePlugin()
    assert.deepEqual(listUnresolvableProfileBundles(dir), [])
  })

  it('lists a bundle whose files are gone', async () => {
    const dir = await profileWithMarketplacePlugin({ install: false })
    assert.deepEqual(listUnresolvableProfileBundles(dir), [PACKAGE])
  })
})

describe('restoreDependencyProfileBundles', () => {
  it('puts a previously stripped marketplace bundle back on the layer list', async () => {
    const dir = await profileWithMarketplacePlugin({ inBundles: false })
    assert.deepEqual(restoreDependencyProfileBundles(dir), [PACKAGE])
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles, [PACKAGE])
  })

  it('does not restore a missing dependency', async () => {
    const dir = await profileWithMarketplacePlugin({ install: false, inBundles: false })
    assert.deepEqual(restoreDependencyProfileBundles(dir), [])
  })
})

describe('pruneUnresolvableProfileBundles', () => {
  it('keeps an installed exports-limited bundle', async () => {
    const dir = await profileWithMarketplacePlugin()
    assert.deepEqual(pruneUnresolvableProfileBundles(dir), [])
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles, [PACKAGE])
  })

  it('drops a bundle that is not on disk', async () => {
    const dir = await profileWithMarketplacePlugin({ install: false })
    assert.deepEqual(pruneUnresolvableProfileBundles(dir), [PACKAGE])
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles, [])
  })
})

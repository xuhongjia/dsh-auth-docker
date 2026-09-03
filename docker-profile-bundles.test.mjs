import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DSH_HOST_APIPROXY,
  listUnresolvableProfileBundles,
  packageDirFromProfile,
  pruneUnresolvableProfileBundles,
  quarantineBundlesImportingSpecifier,
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

const REMOTE_WEB_UI = '@linxin666/dsh-remote-web-ui'
const WEB_UI_ALL = '@linxin666/dsh-web-ui-all'

async function profileWithRemoteWebUi(options = {}) {
  root = await mkdtemp(join(tmpdir(), 'dsh-profile-apiproxy-'))
  const remoteDir = join(root, 'node_modules', '@linxin666', 'dsh-remote-web-ui')
  await mkdir(remoteDir, { recursive: true })
  await writeJson(join(remoteDir, 'package.json'), {
    name: REMOTE_WEB_UI,
    type: 'module',
    exports: { '.': './lib/index.js' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  })
  const importLine = options.importApiProxy
    ? `import '${DSH_HOST_APIPROXY}'\n`
    : "import '@deepseek-ai/cordis'\n"
  await mkdir(join(remoteDir, 'lib'), { recursive: true })
  await writeFile(join(remoteDir, 'lib', 'index.js'), `${importLine}export {}\n`)
  await writeFile(join(remoteDir, 'cordis.patch.yml'), '[]\n')

  const bundles = options.withParent ? [WEB_UI_ALL, REMOTE_WEB_UI] : [REMOTE_WEB_UI]
  const dependencies = { [REMOTE_WEB_UI]: '0.3.6' }
  if (options.withParent) {
    const parentDir = join(root, 'node_modules', '@linxin666', 'dsh-web-ui-all')
    await mkdir(parentDir, { recursive: true })
    await writeJson(join(parentDir, 'package.json'), {
      name: WEB_UI_ALL,
      type: 'module',
      exports: { '.': './index.mjs' },
      dependencies: { [REMOTE_WEB_UI]: '0.3.6' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    })
    await writeFile(join(parentDir, 'index.mjs'), 'export {}\n')
    await writeFile(join(parentDir, 'cordis.patch.yml'), `- name: ${REMOTE_WEB_UI}\n`)
    dependencies[WEB_UI_ALL] = '0.3.6'
  }
  if (options.installApiProxy) {
    const proxyDir = join(root, 'node_modules', '@deepseek-ai', 'dsh-host-apiproxy')
    await mkdir(proxyDir, { recursive: true })
    await writeJson(join(proxyDir, 'package.json'), { name: DSH_HOST_APIPROXY, type: 'module' })
  }
  await writeJson(join(root, 'package.json'), {
    name: 'dsh-profile-web',
    private: true,
    dependencies,
    dsh: { profile: { bundles } },
  })
  return root
}

describe('quarantineBundlesImportingSpecifier', () => {
  it('drops remote-web-ui when its entry still imports missing dsh-host-apiproxy', async () => {
    const dir = await profileWithRemoteWebUi({ importApiProxy: true })
    assert.deepEqual(quarantineBundlesImportingSpecifier(dir, DSH_HOST_APIPROXY), [REMOTE_WEB_UI])
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles, [])
  })

  it('drops the deprecated web-ui-all parent that nests the old remote-web-ui', async () => {
    const dir = await profileWithRemoteWebUi({ importApiProxy: true, withParent: true })
    const dropped = quarantineBundlesImportingSpecifier(dir, DSH_HOST_APIPROXY)
    assert.deepEqual(dropped.sort(), [REMOTE_WEB_UI, WEB_UI_ALL].sort())
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles, [])
  })

  it('keeps a remote-web-ui that no longer imports the missing package', async () => {
    const dir = await profileWithRemoteWebUi({ importApiProxy: false })
    assert.deepEqual(quarantineBundlesImportingSpecifier(dir, DSH_HOST_APIPROXY), [])
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles, [REMOTE_WEB_UI])
  })

  it('keeps the bundle when dsh-host-apiproxy is actually installed', async () => {
    const dir = await profileWithRemoteWebUi({ importApiProxy: true, installApiProxy: true })
    assert.deepEqual(quarantineBundlesImportingSpecifier(dir, DSH_HOST_APIPROXY), [])
  })
})

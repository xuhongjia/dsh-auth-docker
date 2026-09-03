import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  jsonValueHasStaleCheckpointIdentity,
  resetStaleSessionProjcache,
  sessionProjcacheLooksStale,
  sessionProjcachePaths,
} from './docker-session-projcache.mjs'

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

function staleRecord(id) {
  return {
    version: 5,
    value: {
      id,
      identity: { sessionId: id },
    },
  }
}

function freshRecord(id) {
  return {
    version: 5,
    value: {
      id,
      identity: { sessionId: id, isSeeded: true, inheritedEventCount: 0 },
    },
  }
}

describe('jsonValueHasStaleCheckpointIdentity', () => {
  it('detects a bootstrapped 0.1.2 record missing the new identity fields', () => {
    assert.equal(jsonValueHasStaleCheckpointIdentity(staleRecord('708dc391-adad-4212-ae86-e8bb4207877a')), true)
  })

  it('accepts a record that already has isSeeded and inheritedEventCount', () => {
    assert.equal(jsonValueHasStaleCheckpointIdentity(freshRecord('ok')), false)
  })
})

describe('resetStaleSessionProjcache', () => {
  it('renames a stale per-record tree and leaves sessions/*.jsonl in place', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-projcache-'))
    const { cacheDir } = sessionProjcachePaths(root)
    const sessionsDir = join(cacheDir, 'sessions')
    await mkdir(sessionsDir, { recursive: true })
    await writeJson(join(sessionsDir, '708dc391-adad-4212-ae86-e8bb4207877a.json'), staleRecord('708dc391-adad-4212-ae86-e8bb4207877a'))
    const jsonl = join(root, 'sessions', '708dc391-adad-4212-ae86-e8bb4207877a.jsonl')
    await mkdir(join(root, 'sessions'), { recursive: true })
    await writeFile(jsonl, '{"type":"user"}\n')
    const workspace = join(root, 'storages', 'workspace.json')
    await writeJson(workspace, { workspaces: [] })

    assert.equal(sessionProjcacheLooksStale(root), true)
    const moved = resetStaleSessionProjcache(root)
    assert.equal(moved.length, 1)
    assert.equal(sessionProjcacheLooksStale(root), false)
    assert.equal(await readFile(jsonl, 'utf8'), '{"type":"user"}\n')
    assert.deepEqual(JSON.parse(await readFile(workspace, 'utf8')), { workspaces: [] })
    const backups = (await readdir(join(root, 'storages'))).filter((name) => name.startsWith('session_projcache.bak-dsh-auth-'))
    assert.equal(backups.length, 1)
  })

  it('renames both the legacy whole-file cache and the per-record tree', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-projcache-'))
    const { legacyFile, cacheDir } = sessionProjcachePaths(root)
    await mkdir(join(cacheDir, 'sessions'), { recursive: true })
    await writeJson(legacyFile, { unit: { version: 3 }, sessions: { a: staleRecord('a').value } })
    await writeJson(join(cacheDir, 'sessions', 'a.json'), staleRecord('a'))

    const moved = resetStaleSessionProjcache(root)
    assert.equal(moved.length, 2)
    const names = (await readdir(join(root, 'storages'))).sort()
    assert.equal(names.some((name) => name.startsWith('session_projcache.json.bak-dsh-auth-')), true)
    assert.equal(names.some((name) => name.startsWith('session_projcache.bak-dsh-auth-')), true)
    assert.equal(names.includes('session_projcache.json'), false)
    assert.equal(names.includes('session_projcache'), false)
  })

  it('does not move a cache whose identity already matches 0.1.2 when force-once is off', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-projcache-'))
    const { cacheDir } = sessionProjcachePaths(root)
    await mkdir(join(cacheDir, 'sessions'), { recursive: true })
    await writeJson(join(cacheDir, 'sessions', 'ok.json'), freshRecord('ok'))
    assert.deepEqual(resetStaleSessionProjcache(root, { forceOnce: false }), [])
    assert.equal(sessionProjcacheLooksStale(root), false)
    JSON.parse(await readFile(join(cacheDir, 'sessions', 'ok.json'), 'utf8'))
  })

  it('force-moves an existing cache once when the identity-v5 marker is missing', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-projcache-'))
    const { cacheDir, marker, storages } = sessionProjcachePaths(root)
    await mkdir(join(cacheDir, 'sessions'), { recursive: true })
    await writeJson(join(cacheDir, 'sessions', 'ok.json'), freshRecord('ok'))
    const moved = resetStaleSessionProjcache(root)
    assert.equal(moved.length, 1)
    assert.equal(await readFile(marker, 'utf8'), 'identity-v5\n')
    const backups = (await readdir(storages)).filter((name) => name.startsWith('session_projcache.bak-dsh-auth-'))
    assert.equal(backups.length, 1)
    assert.deepEqual(resetStaleSessionProjcache(root), [])
  })

  it('does not force-move a fresh cache after the marker exists', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-projcache-'))
    const { cacheDir, marker, storages } = sessionProjcachePaths(root)
    await mkdir(join(cacheDir, 'sessions'), { recursive: true })
    await writeJson(join(cacheDir, 'sessions', 'ok.json'), freshRecord('ok'))
    await writeFile(marker, 'identity-v5\n')
    assert.deepEqual(resetStaleSessionProjcache(root), [])
    const names = await readdir(storages)
    assert.equal(names.includes('session_projcache'), true)
    assert.equal(names.some((name) => name.startsWith('session_projcache.bak-dsh-auth-')), false)
  })
})

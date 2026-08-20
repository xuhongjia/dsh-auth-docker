import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { connect } from 'node:net'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { createAuth, ensureDatabaseFile, migrateAuth, seedInitialUser } from '../src/auth.ts'
import { resolveAuthConfig, safeRedirect } from '../src/config.ts'
import { listenAuthGateway } from '../src/gateway.ts'
import { isUnpairedHeartbeatResponse, loopbackOrigin, upstreamHeaders } from '../src/proxy.ts'

const SECRET = 'dsh-auth-test-secret-value-32chars!'
const PASSWORD = 'correct-horse-battery-staple'

let root: string | undefined
let gateway: Awaited<ReturnType<typeof listenAuthGateway>> | undefined
let upstream: ReturnType<typeof createServer> | undefined
const previousEnv: Record<string, string | undefined> = {}

afterEach(async () => {
  if (gateway !== undefined) {
    await new Promise<void>((resolve) => { gateway!.server.close(() => { resolve() }) })
    gateway = undefined
  }
  if (upstream !== undefined) {
    await new Promise<void>((resolve) => { upstream!.close(() => { resolve() }) })
    upstream = undefined
  }
  if (root !== undefined) {
    await rm(root, { recursive: true, force: true })
    root = undefined
  }
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
    delete previousEnv[key]
  }
})

function setEnv(key: string, value: string): void {
  if (!(key in previousEnv)) previousEnv[key] = process.env[key]
  process.env[key] = value
}

async function boot(options?: {
  password?: string
  existingDb?: string
  onUpstream?: (req: IncomingMessage, res: ServerResponse) => boolean
  onUpgrade?: (req: IncomingMessage, socket: Duplex) => void
}): Promise<{ port: number; upstreamPort: number }> {
  setEnv('DSH_AUTH_SECRET', SECRET)
  if (options?.password !== undefined) setEnv('DSH_AUTH_PASSWORD', options.password)
  else setEnv('DSH_AUTH_PASSWORD', PASSWORD)
  root = await mkdtemp(join(tmpdir(), 'dsh-auth-'))
  const path = options?.existingDb ?? join(root, 'auth.sqlite')
  const config = resolveAuthConfig({
    path,
    listenHost: '127.0.0.1',
    listenPort: 0,
    baseURL: 'http://127.0.0.1',
  })
  await ensureDatabaseFile(config.path)
  const db = new DatabaseSync(config.path)
  const auth = createAuth(config, db)
  await migrateAuth(auth)
  await seedInitialUser(auth, db, config)

  let captured = ''
  upstream = createServer((req, res) => {
    captured = [
      `${req.method ?? ''} ${req.url ?? ''}`,
      `host=${String(req.headers.host)}`,
      `origin=${String(req.headers.origin)}`,
      `xff=${String(req.headers['x-forwarded-for'])}`,
      `xri=${String(req.headers['x-real-ip'])}`,
      `fwd=${String(req.headers.forwarded)}`,
      `sfs=${String(req.headers['sec-fetch-site'])}`,
    ].join(' ')
    if (options?.onUpstream?.(req, res) === true) return
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(captured)
  })
  if (options?.onUpgrade !== undefined) {
    upstream.on('upgrade', (req, socket) => {
      options.onUpgrade!(req, socket)
    })
  }
  await new Promise<void>((resolve) => { upstream!.listen(0, '127.0.0.1', () => { resolve() }) })
  const upstreamPort = (upstream.address() as AddressInfo).port
  gateway = await listenAuthGateway({ ...config, baseURL: `http://127.0.0.1` }, auth, upstreamPort)
  return { port: gateway.port, upstreamPort }
}

async function signInCookie(port: number): Promise<string> {
  const origin = 'http://127.0.0.1'
  const login = await fetch(`http://127.0.0.1:${String(port)}/auth/sign-in/username`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ username: 'admin', password: PASSWORD, callbackURL: '/' }),
  })
  expect(login.ok).toBe(true)
  const cookie = login.headers.getSetCookie().join('; ')
  expect(cookie.length).toBeGreaterThan(0)
  return cookie
}

describe('dsh-auth reverse proxy', () => {
  it('rejects a short signing secret at resolve time', () => {
    setEnv('DSH_AUTH_SECRET', 'too-short')
    expect(() => resolveAuthConfig({ path: '/tmp/x.sqlite' })).toThrow(/at least 32 characters/)
  })

  it('keeps redirects on the current origin', () => {
    expect(safeRedirect('/sessions')).toBe('/sessions')
    expect(safeRedirect('https://evil.example/')).toBe('/')
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect(null)).toBe('/')
  })

  it('serves healthz and login without a session, and sends the SPA to login', { timeout: 20_000 }, async () => {
    const { port } = await boot()
    const health = await fetch(`http://127.0.0.1:${String(port)}/healthz`)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })

    const login = await fetch(`http://127.0.0.1:${String(port)}/login`)
    expect(login.status).toBe(200)
    expect(login.headers.get('content-security-policy')).toContain("connect-src 'self'")
    expect(await login.text()).toContain('/sign-in/username')

    const home = await fetch(`http://127.0.0.1:${String(port)}/`, { redirect: 'manual' })
    expect(home.status).toBe(302)
    expect(home.headers.get('location')).toBe('/login?next=%2F')

    const api = await fetch(`http://127.0.0.1:${String(port)}/api`, { method: 'POST' })
    expect(api.status).toBe(401)
  })

  it('fails loud when the database is empty and the password env is missing', { timeout: 20_000 }, async () => {
    setEnv('DSH_AUTH_SECRET', SECRET)
    delete process.env.DSH_AUTH_PASSWORD
    root = await mkdtemp(join(tmpdir(), 'dsh-auth-'))
    const config = resolveAuthConfig({
      path: join(root, 'auth.sqlite'),
      listenHost: '127.0.0.1',
      listenPort: 0,
    })
    await ensureDatabaseFile(config.path)
    const db = new DatabaseSync(config.path)
    const auth = createAuth(config, db)
    await migrateAuth(auth)
    await expect(seedInitialUser(auth, db, config)).rejects.toThrow(/DSH_AUTH_PASSWORD is required/)
    db.close()
  })

  it('rewrites Host and Origin onto the loopback authority', () => {
    const headers = upstreamHeaders({
      host: 'dsh.example.com',
      origin: 'https://dsh.example.com',
      referer: 'https://dsh.example.com/settings',
      'sec-fetch-site': 'same-origin',
      'x-forwarded-for': '203.0.113.10',
      'x-real-ip': '203.0.113.10',
      forwarded: 'for=203.0.113.10',
      cookie: 'session=1',
    }, '127.0.0.1:43123')
    expect(headers.host).toBe('127.0.0.1:43123')
    expect(headers.origin).toBe(loopbackOrigin('127.0.0.1:43123'))
    expect(headers.cookie).toBe('session=1')
    expect(headers.referer).toBeUndefined()
    expect(headers['sec-fetch-site']).toBeUndefined()
    expect(headers['x-forwarded-for']).toBeUndefined()
    expect(headers['x-real-ip']).toBeUndefined()
    expect(headers.forwarded).toBeUndefined()
  })

  it('keeps Connection and Upgrade on WebSocket hops and still rewrites Origin', () => {
    const headers = upstreamHeaders({
      host: 'dsh.example.com',
      origin: 'https://evil.example',
      connection: 'Upgrade',
      upgrade: 'websocket',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'x-forwarded-for': '203.0.113.10',
    }, '127.0.0.1:43123', 'upgrade')
    expect(headers.host).toBe('127.0.0.1:43123')
    expect(headers.origin).toBe('http://127.0.0.1:43123')
    expect(headers.connection).toBe('Upgrade')
    expect(headers.upgrade).toBe('websocket')
    expect(headers['sec-websocket-key']).toBe('dGhlIHNhbXBsZSBub25jZQ==')
    expect(headers['x-forwarded-for']).toBeUndefined()
  })

  it('signs in through Better Auth and then proxies to loopback Harness', { timeout: 20_000 }, async () => {
    const { port, upstreamPort } = await boot()
    const origin = 'http://127.0.0.1'
    const login = await fetch(`http://127.0.0.1:${String(port)}/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ username: 'admin', password: PASSWORD, callbackURL: '/' }),
    })
    expect(login.ok).toBe(true)
    const cookie = login.headers.getSetCookie().join('; ')
    expect(cookie.length).toBeGreaterThan(0)

    const proxied = await fetch(`http://127.0.0.1:${String(port)}/workspace`, {
      headers: {
        cookie,
        origin: 'https://evil.example',
        referer: 'https://evil.example/settings',
        'sec-fetch-site': 'cross-site',
        'x-forwarded-for': '203.0.113.10',
        'x-real-ip': '203.0.113.10',
        forwarded: 'for=203.0.113.10',
      },
    })
    expect(proxied.status).toBe(200)
    const body = await proxied.text()
    const loopback = loopbackOrigin(`127.0.0.1:${String(upstreamPort)}`)
    expect(body).toContain('GET /workspace')
    expect(body).toContain(`host=127.0.0.1:${String(upstreamPort)}`)
    expect(body).toContain(`origin=${loopback}`)
    expect(body).toContain('xff=undefined')
    expect(body).toContain('xri=undefined')
    expect(body).toContain('fwd=undefined')
    expect(body).toContain('sfs=undefined')
  })

  it('does not overwrite an existing user on later boots', { timeout: 20_000 }, async () => {
    const first = await boot()
    await new Promise<void>((resolve) => { gateway!.server.close(() => { resolve() }) })
    gateway = undefined
    await new Promise<void>((resolve) => { upstream!.close(() => { resolve() }) })
    upstream = undefined
    const dbPath = join(root!, 'auth.sqlite')
    const second = await boot({ password: 'a-different-password-12', existingDb: dbPath })
    const login = await fetch(`http://127.0.0.1:${String(second.port)}/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1' },
      body: JSON.stringify({ username: 'admin', password: PASSWORD }),
    })
    expect(login.ok).toBe(true)
  })

  it('classifies only the marketplace unpaired heartbeat body', () => {
    const unpaired = Buffer.from(JSON.stringify({ ok: false, code: 'unpaired' }))
    expect(isUnpairedHeartbeatResponse(401, unpaired)).toBe(true)
    expect(isUnpairedHeartbeatResponse(403, unpaired)).toBe(false)
    expect(isUnpairedHeartbeatResponse(401, Buffer.from(JSON.stringify({ ok: false, code: 'forbidden' })))).toBe(false)
    expect(isUnpairedHeartbeatResponse(401, Buffer.from('not-json'))).toBe(false)
    expect(isUnpairedHeartbeatResponse(200, Buffer.from(JSON.stringify({ ok: true })))).toBe(false)
  })

  it('rewrites unpaired pairing heartbeats for a signed-in session', { timeout: 20_000 }, async () => {
    let mode: 'unpaired' | 'live' | 'forbidden' = 'unpaired'
    const { port } = await boot({
      onUpstream: (req, res) => {
        if (req.url !== '/api/pair/heartbeat') return false
        if (mode === 'unpaired') {
          res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: false, code: 'unpaired' }))
          return true
        }
        if (mode === 'live') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: true, device: 'phone' }))
          return true
        }
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, code: 'forbidden' }))
        return true
      },
    })

    const anonymous = await fetch(`http://127.0.0.1:${String(port)}/api/pair/heartbeat`, { method: 'POST' })
    expect(anonymous.status).toBe(401)
    expect(await anonymous.json()).toEqual({ error: 'unauthorized' })

    const cookie = await signInCookie(port)
    const rewritten = await fetch(`http://127.0.0.1:${String(port)}/api/pair/heartbeat`, {
      method: 'POST',
      headers: { cookie },
    })
    expect(rewritten.status).toBe(200)
    expect(await rewritten.json()).toEqual({ ok: true })

    mode = 'live'
    const live = await fetch(`http://127.0.0.1:${String(port)}/api/pair/heartbeat`, {
      method: 'POST',
      headers: { cookie },
    })
    expect(live.status).toBe(200)
    expect(await live.json()).toEqual({ ok: true, device: 'phone' })

    mode = 'forbidden'
    const forbidden = await fetch(`http://127.0.0.1:${String(port)}/api/pair/heartbeat`, {
      method: 'POST',
      headers: { cookie },
    })
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toEqual({ ok: false, code: 'forbidden' })
  })

  it('rejects unauthenticated upgrades', { timeout: 20_000 }, async () => {
    const { port } = await boot()
    const socket = connect(port, '127.0.0.1')
    await once(socket, 'connect')
    const response = once(socket, 'data')
    socket.write([
      'GET /events HTTP/1.1',
      `Host: 127.0.0.1:${String(port)}`,
      'Connection: Upgrade',
      'Upgrade: websocket',
      '',
      '',
    ].join('\r\n'))
    const [data] = await response as [Buffer]
    socket.destroy()
    expect(String(data)).toContain('401 Unauthorized')
  })

  it('rewrites Origin on authenticated upgrades and drops forwarding headers', { timeout: 20_000 }, async () => {
    let captured = ''
    const { port, upstreamPort } = await boot({
      onUpgrade: (req, socket) => {
        captured = [
          `host=${String(req.headers.host)}`,
          `origin=${String(req.headers.origin)}`,
          `xff=${String(req.headers['x-forwarded-for'])}`,
          `upgrade=${String(req.headers.upgrade)}`,
        ].join(' ')
        socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
      },
    })
    const cookie = await signInCookie(port)
    const socket = connect(port, '127.0.0.1')
    await once(socket, 'connect')
    const response = once(socket, 'data')
    socket.write([
      'GET /events HTTP/1.1',
      `Host: dsh.example.com`,
      'Origin: https://dsh.example.com',
      'Connection: Upgrade',
      'Upgrade: websocket',
      `Cookie: ${cookie}`,
      'X-Forwarded-For: 203.0.113.10',
      '',
      '',
    ].join('\r\n'))
    await response
    socket.destroy()
    expect(captured).toContain(`host=127.0.0.1:${String(upstreamPort)}`)
    expect(captured).toContain(`origin=http://127.0.0.1:${String(upstreamPort)}`)
    expect(captured).toContain('xff=undefined')
    expect(captured).toContain('upgrade=websocket')
  })
})

import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node'
import type { AuthInstance } from './auth.ts'
import type { ResolvedAuthConfig } from './config.ts'
import { safeRedirect } from './config.ts'
import { loginPage } from './login-page.ts'
import { proxyHttp, proxyUpgrade, rejectUpgrade } from './proxy.ts'

/** Public reverse-proxy handle that sits in front of official DSH. */
export interface AuthGateway {
  /** Bound public port. */
  port: number
  /** Node HTTP server. */
  server: Server
}

/**
 * Open the public HTTP server that owns login, Better Auth, session checks,
 * and proxies authenticated traffic to the loopback Harness webserver.
 */
export async function listenAuthGateway(
  config: ResolvedAuthConfig,
  auth: AuthInstance,
  upstreamPort: number,
): Promise<AuthGateway> {
  const authHandler = toNodeHandler(auth)
  const server = createServer((req, res) => {
    handleRequest(config, auth, authHandler, upstreamPort, req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy()
        return
      }
      res.writeHead(400, { 'cache-control': 'no-store' })
      res.end()
      void error
    })
  })
  server.on('upgrade', (req, socket, head) => {
    handleUpgrade(auth, upstreamPort, req, socket, head).catch(() => {
      socket.destroy()
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.listenPort, config.listenHost, () => {
      server.off('error', reject)
      resolve()
    })
  })

  return { server, port: (server.address() as AddressInfo).port }
}

/** True when Better Auth has a live session cookie on this request. */
export async function hasSession(auth: AuthInstance, req: IncomingMessage): Promise<boolean> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  return session !== null
}

function pathnameOf(req: IncomingMessage): string {
  return new URL(req.url ?? '/', 'http://dsh.internal').pathname
}

function isAuthPath(basePath: string, path: string): boolean {
  return path === basePath || path.startsWith(`${basePath}/`)
}

function writeUnauthorized(res: ServerResponse): void {
  res.writeHead(401, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify({ error: 'unauthorized' }))
}

async function handleLoginPage(
  config: ResolvedAuthConfig,
  auth: AuthInstance,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  if (await hasSession(auth, req)) {
    res.writeHead(302, { location: '/', 'cache-control': 'no-store' })
    res.end()
    return
  }
  const query = new URL(req.url ?? '/', 'http://dsh.internal').searchParams
  const next = safeRedirect(query.get('next'))
  const body = loginPage(config.basePath, next)
  res.writeHead(200, {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    'content-type': 'text/html; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  res.end(body)
}

async function handleRequest(
  config: ResolvedAuthConfig,
  auth: AuthInstance,
  authHandler: ReturnType<typeof toNodeHandler>,
  upstreamPort: number,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const path = pathnameOf(req)
  if (path === '/healthz') {
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }
  if (path === '/login') {
    await handleLoginPage(config, auth, req, res)
    return
  }
  if (isAuthPath(config.basePath, path)) {
    await authHandler(req, res)
    return
  }
  if (await hasSession(auth, req)) {
    proxyHttp(req, res, upstreamPort)
    return
  }
  if (path === '/api' || path.startsWith('/api/')) {
    writeUnauthorized(res)
    return
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const target = encodeURIComponent(req.url ?? '/')
    res.writeHead(302, { location: `/login?next=${target}`, 'cache-control': 'no-store' })
    res.end()
    return
  }
  writeUnauthorized(res)
}

async function handleUpgrade(
  auth: AuthInstance,
  upstreamPort: number,
  req: IncomingMessage,
  socket: import('node:stream').Duplex,
  head: Buffer,
): Promise<void> {
  if (!(await hasSession(auth, req))) {
    rejectUpgrade(socket, 401, 'unauthorized')
    return
  }
  proxyUpgrade(req, socket, head, upstreamPort)
}

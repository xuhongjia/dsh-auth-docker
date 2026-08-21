import { request as requestHttp } from 'node:http'
import { connect } from 'node:net'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

/** Hop-by-hop headers Node must not copy onto the next HTTP hop. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
])

/**
 * Browser-trust and forwarding traces that must not reach loopback Harness.
 * Plugin Market restart refuses any `Forwarded` / `X-Forwarded-For` / `X-Real-IP`.
 */
const TRUST_STRIP = new Set([
  'host',
  'origin',
  'referer',
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-forwarded-prefix',
  'x-forwarded-ssl',
  'x-forwarded-scheme',
  'x-forwarded-server',
  'x-original-forwarded-for',
  'x-real-ip',
  'x-client-ip',
  'true-client-ip',
  'cf-connecting-ip',
  'cf-visitor',
  'via',
])

export type UpstreamHeaderMode = 'http' | 'upgrade'

/**
 * Loopback origin whose host matches the rewritten Host header.
 * Plugin Market `sameOrigin` requires Origin to be present and equal Host.
 * @param upstreamHost - `127.0.0.1:<port>` authority of the official webserver.
 */
export function loopbackOrigin(upstreamHost: string): string {
  return `http://${upstreamHost}`
}

function shouldStripHeader(name: string, mode: UpstreamHeaderMode): boolean {
  const key = name.toLowerCase()
  if (TRUST_STRIP.has(key) || key.startsWith('sec-fetch-')) return true
  if (!HOP_BY_HOP.has(key)) return false
  if (mode === 'upgrade' && (key === 'connection' || key === 'upgrade')) return false
  return true
}

/**
 * Copy inbound headers onto the loopback Harness request: Host and Origin become
 * the official webserver authority so mutating plugin routes see same-origin
 * loopback, and forwarding traces are dropped so restart guards pass.
 * @param headers - headers from the public request.
 * @param upstreamHost - `127.0.0.1:<port>` authority of the official webserver.
 * @param mode - HTTP proxy vs WebSocket upgrade (keeps Connection/Upgrade).
 * @returns headers safe to send to loopback Harness.
 */
export function upstreamHeaders(
  headers: IncomingHttpHeaders,
  upstreamHost: string,
  mode: UpstreamHeaderMode = 'http',
): IncomingHttpHeaders {
  const forwarded: IncomingHttpHeaders = {
    host: upstreamHost,
    origin: loopbackOrigin(upstreamHost),
  }
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || shouldStripHeader(name, mode)) continue
    forwarded[name] = value
  }
  return forwarded
}

function headerLines(headers: IncomingHttpHeaders): string[] {
  const lines: string[] = []
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    const rendered = Array.isArray(value) ? value.join(', ') : value
    lines.push(`${name}: ${rendered}`)
  }
  return lines
}

const PAIRED_HEARTBEAT_BODY = Buffer.from(JSON.stringify({ ok: true }))

/** Marketplace remote-web-ui prefix; the client rewrites fenced `/api` here. */
const REMOTE_CHANNEL_PREFIX = '/remote'

/** Inner paths the desktop client mounts under `/remote`. */
const REMOTE_INNER_PREFIXES = ['/api', '/sidebar', '/git', '/pet']

/**
 * Map marketplace `/remote/api/…` onto loopback `/api/…` (same for sidebar/git/pet).
 * A Better Auth session already passed the public gate; Host/Origin are rewritten
 * to loopback, so the pairing cookie is not the access control on this hop.
 * Unsafe segments and non-channel prefixes are left unchanged.
 */
export function stripRemoteChannelPath(url: string | undefined): string {
  const raw = url ?? '/'
  let parsed: URL
  try {
    parsed = new URL(raw, 'http://127.0.0.1')
  } catch {
    return raw
  }
  const pathname = parsed.pathname
  if (!pathname.startsWith(`${REMOTE_CHANNEL_PREFIX}/`)) return raw
  const inner = pathname.slice(REMOTE_CHANNEL_PREFIX.length)
  if (!REMOTE_INNER_PREFIXES.some((prefix) => inner === prefix || inner.startsWith(`${prefix}/`))) {
    return raw
  }
  const segments = inner.slice(1).split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return raw
  }
  return `${inner}${parsed.search}`
}

/**
 * True when upstream is the marketplace pairing plugin refusing an unpaired
 * `POST /api/pair/heartbeat`. A Better Auth session already passed the public
 * gate; rewrite that 401 to `{ok:true}` so the public-origin desktop stops
 * polling unpaired. A live pairing cookie's 200 is not this body.
 * @param status - upstream status code.
 * @param body - upstream response bytes.
 * @returns whether the gateway should replace the body with `{ok:true}`.
 */
export function isUnpairedHeartbeatResponse(status: number, body: Buffer): boolean {
  if (status !== 401) return false
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'))
    if (parsed === null || typeof parsed !== 'object') return false
    if (!('ok' in parsed) || !('code' in parsed)) return false
    return parsed.ok === false && parsed.code === 'unpaired'
  } catch {
    // JSON.parse threw on a non-JSON body; keep the upstream response.
    return false
  }
}

function writeUpstreamUnavailable(res: ServerResponse): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.writeHead(502, { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' })
  res.end('upstream unavailable')
}

/**
 * Proxy one HTTP request to the official loopback webserver.
 * @param req - public request.
 * @param res - public response.
 * @param port - official webserver port.
 */
export function proxyHttp(req: IncomingMessage, res: ServerResponse, port: number): void {
  const upstreamHost = `127.0.0.1:${String(port)}`
  const upstream = requestHttp({
    hostname: '127.0.0.1',
    port,
    path: stripRemoteChannelPath(req.url),
    method: req.method,
    headers: upstreamHeaders(req.headers, upstreamHost),
  }, (upRes) => {
    res.writeHead(upRes.statusCode ?? 502, upRes.headers)
    upRes.pipe(res)
  })
  upstream.on('error', () => { writeUpstreamUnavailable(res) })
  req.pipe(upstream)
}

/**
 * Proxy `POST /api/pair/heartbeat`. Forward a live pairing cookie unchanged;
 * replace the plugin's unpaired 401 with `{ok:true}` for a logged-in session.
 * @param req - public request.
 * @param res - public response.
 * @param port - official webserver port.
 */
export function proxyPairHeartbeat(req: IncomingMessage, res: ServerResponse, port: number): void {
  const upstreamHost = `127.0.0.1:${String(port)}`
  const upstream = requestHttp({
    hostname: '127.0.0.1',
    port,
    path: req.url,
    method: req.method,
    headers: upstreamHeaders(req.headers, upstreamHost),
  }, (upRes) => {
    const chunks: Buffer[] = []
    upRes.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    })
    upRes.on('end', () => {
      const body = Buffer.concat(chunks)
      const status = upRes.statusCode ?? 502
      if (isUnpairedHeartbeatResponse(status, body)) {
        res.writeHead(200, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
        })
        res.end(PAIRED_HEARTBEAT_BODY)
        return
      }
      const headers: IncomingHttpHeaders = { ...upRes.headers }
      delete headers['transfer-encoding']
      headers['content-length'] = String(body.length)
      res.writeHead(status, headers)
      res.end(body)
    })
    upRes.on('error', () => { writeUpstreamUnavailable(res) })
  })
  upstream.on('error', () => { writeUpstreamUnavailable(res) })
  req.pipe(upstream)
}

/**
 * Proxy one HTTP upgrade (WebSocket downlink) to the official loopback webserver.
 * @param req - public upgrade request.
 * @param socket - public TCP socket.
 * @param head - bytes already read past the upgrade request.
 * @param port - official webserver port.
 */
export function proxyUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, port: number): void {
  const upstreamHost = `127.0.0.1:${String(port)}`
  const upstream = connect(port, '127.0.0.1')
  upstream.on('error', () => { socket.destroy() })
  socket.on('error', () => { upstream.destroy() })
  upstream.once('connect', () => {
    const lines = [
      `${req.method ?? 'GET'} ${stripRemoteChannelPath(req.url)} HTTP/1.1`,
      ...headerLines(upstreamHeaders(req.headers, upstreamHost, 'upgrade')),
      '',
      '',
    ]
    upstream.write(lines.join('\r\n'))
    if (head.length > 0) upstream.write(head)
    socket.pipe(upstream)
    upstream.pipe(socket)
  })
}

/**
 * Write a raw HTTP error onto an upgrade socket and close it.
 * @param socket - public TCP socket.
 * @param status - 401 or 403.
 * @param message - body text.
 */
export function rejectUpgrade(socket: Duplex, status: 401 | 403, message: string): void {
  const reason = status === 401 ? 'Unauthorized' : 'Forbidden'
  socket.end([
    `HTTP/1.1 ${String(status)} ${reason}`,
    'Connection: close',
    'Content-Type: text/plain; charset=utf-8',
    `Content-Length: ${String(Buffer.byteLength(message))}`,
    '',
    message,
  ].join('\r\n'))
}

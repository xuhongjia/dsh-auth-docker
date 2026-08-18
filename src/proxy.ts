import { request as requestHttp } from 'node:http'
import { connect } from 'node:net'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

/** Headers that must not be copied onto the loopback Harness request. */
const STRIP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'origin',
  'referer',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
  'sec-fetch-user',
])

/**
 * Copy inbound headers onto the loopback Harness request, replacing Host and
 * dropping browser-trust markers so official DSH sees a same-host loopback call.
 * @param headers - headers from the public request.
 * @param upstreamHost - `127.0.0.1:<port>` authority of the official webserver.
 * @returns headers safe to send to loopback Harness.
 */
export function upstreamHeaders(headers: IncomingHttpHeaders, upstreamHost: string): IncomingHttpHeaders {
  const forwarded: IncomingHttpHeaders = { host: upstreamHost }
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || STRIP_HEADERS.has(name.toLowerCase())) continue
    forwarded[name] = value
  }
  return forwarded
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
    path: req.url,
    method: req.method,
    headers: upstreamHeaders(req.headers, upstreamHost),
  }, (upRes) => {
    res.writeHead(upRes.statusCode ?? 502, upRes.headers)
    upRes.pipe(res)
  })
  upstream.on('error', () => {
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.writeHead(502, { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' })
    res.end('upstream unavailable')
  })
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
      `${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1`,
      `Host: ${upstreamHost}`,
    ]
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || name.toLowerCase() === 'host' || name.toLowerCase() === 'origin' || name.toLowerCase().startsWith('sec-fetch-') || name.toLowerCase() === 'referer') {
        continue
      }
      const rendered = Array.isArray(value) ? value.join(', ') : value
      lines.push(`${name}: ${rendered}`)
    }
    lines.push('', '')
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

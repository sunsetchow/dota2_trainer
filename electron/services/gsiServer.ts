import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'

// 心跳包很小（几百字节到几 KB），64KB 足够留余量，同时防止恶意/异常大请求把进程拖垮。
export const GSI_MAX_BODY_BYTES = 65_536

export interface GsiServerOptions {
  port: number
  authToken: string
  maxBodyBytes?: number
  onPayload: (payload: unknown) => void
}

export interface GsiServerHandle {
  port: number
  close: () => Promise<void>
}

function readToken(url: string): string | null {
  try {
    return new URL(url, 'http://127.0.0.1').searchParams.get('token')
  } catch {
    return null
  }
}

function isGsiPath(url: string): boolean {
  try {
    return new URL(url, 'http://127.0.0.1').pathname === '/gsi'
  } catch {
    return false
  }
}

function handleRequest(req: IncomingMessage, res: ServerResponse, options: GsiServerOptions) {
  if (req.method !== 'POST' || !req.url || !isGsiPath(req.url)) {
    res.writeHead(404).end()
    return
  }
  if (readToken(req.url) !== options.authToken) {
    res.writeHead(401).end()
    return
  }

  const chunks: Buffer[] = []
  let receivedBytes = 0
  let rejected = false
  const maxBodyBytes = options.maxBodyBytes ?? GSI_MAX_BODY_BYTES

  req.on('data', (chunk: Buffer) => {
    if (rejected) return
    receivedBytes += chunk.length
    if (receivedBytes > maxBodyBytes) {
      rejected = true
      res.writeHead(413).end()
      req.destroy()
      return
    }
    chunks.push(chunk)
  })

  req.on('end', () => {
    if (rejected) return
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
      options.onPayload(payload)
      res.writeHead(200).end()
    } catch {
      res.writeHead(400).end()
    }
  })

  req.on('error', () => {
    // 客户端断开等网络异常：不让 server 进程崩溃，也不重复响应。
  })
}

/** 只绑定 127.0.0.1；port 传 0 可以让操作系统分配空闲端口（测试用）。 */
export function startGsiServer(options: GsiServerOptions): Promise<GsiServerHandle> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => handleRequest(req, res, options))
    server.once('error', reject)
    server.listen(options.port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      const address = server.address()
      const boundPort = typeof address === 'object' && address ? address.port : options.port
      resolve({
        port: boundPort,
        close: () => new Promise<void>((resolveClose, rejectClose) => {
          server.close(error => error ? rejectClose(error) : resolveClose())
        }),
      })
    })
  })
}

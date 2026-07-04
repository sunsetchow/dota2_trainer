import { afterEach, describe, expect, it, vi } from 'vitest'
import { startGsiServer, GSI_MAX_BODY_BYTES, type GsiServerHandle } from './gsiServer.ts'

const AUTH_TOKEN = 'test-token-123'

let handle: GsiServerHandle | null = null

afterEach(async () => {
  if (handle) {
    await handle.close()
    handle = null
  }
})

async function post(port: number, path: string, body: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', body })
}

describe('startGsiServer', () => {
  it('binds to 127.0.0.1 on an OS-assigned port and accepts a valid POST /gsi payload', async () => {
    const onPayload = vi.fn()
    handle = await startGsiServer({ port: 0, authToken: AUTH_TOKEN, onPayload })
    expect(handle.port).toBeGreaterThan(0)

    const res = await post(handle.port, `/gsi?token=${AUTH_TOKEN}`, JSON.stringify({ map: { game_state: 'x' } }))
    expect(res.status).toBe(200)
    expect(onPayload).toHaveBeenCalledWith({ map: { game_state: 'x' } })
  })

  it('rejects requests with a missing or wrong token with 401 and does not call onPayload', async () => {
    const onPayload = vi.fn()
    handle = await startGsiServer({ port: 0, authToken: AUTH_TOKEN, onPayload })

    const noToken = await post(handle.port, '/gsi', '{}')
    expect(noToken.status).toBe(401)

    const wrongToken = await post(handle.port, '/gsi?token=nope', '{}')
    expect(wrongToken.status).toBe(401)

    expect(onPayload).not.toHaveBeenCalled()
  })

  it('rejects GET and unknown paths with 404', async () => {
    handle = await startGsiServer({ port: 0, authToken: AUTH_TOKEN, onPayload: vi.fn() })

    const getRes = await fetch(`http://127.0.0.1:${handle.port}/gsi?token=${AUTH_TOKEN}`)
    expect(getRes.status).toBe(404)

    const wrongPath = await post(handle.port, `/other?token=${AUTH_TOKEN}`, '{}')
    expect(wrongPath.status).toBe(404)
  })

  it('rejects invalid JSON with 400 without calling onPayload', async () => {
    const onPayload = vi.fn()
    handle = await startGsiServer({ port: 0, authToken: AUTH_TOKEN, onPayload })

    const res = await post(handle.port, `/gsi?token=${AUTH_TOKEN}`, 'not json')
    expect(res.status).toBe(400)
    expect(onPayload).not.toHaveBeenCalled()
  })

  it('rejects bodies over the max size with 413', async () => {
    const onPayload = vi.fn()
    handle = await startGsiServer({ port: 0, authToken: AUTH_TOKEN, onPayload })

    const oversized = 'x'.repeat(GSI_MAX_BODY_BYTES + 10)
    let status: number | null = null
    try {
      const res = await post(handle.port, `/gsi?token=${AUTH_TOKEN}`, oversized)
      status = res.status
    } catch {
      // destroying the request mid-flight can also surface as a fetch-level error,
      // which is an acceptable outcome here (connection was refused/reset).
    }
    if (status !== null) expect(status).toBe(413)
    expect(onPayload).not.toHaveBeenCalled()
  })

  it('releases the port on close so a new server can bind the same port', async () => {
    const first = await startGsiServer({ port: 0, authToken: AUTH_TOKEN, onPayload: vi.fn() })
    const port = first.port
    await first.close()
    handle = await startGsiServer({ port, authToken: AUTH_TOKEN, onPayload: vi.fn() })
    expect(handle.port).toBe(port)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: any[]) => unknown>()

const { showOpenDialog, enableGsi, disableGsi, getGsiStatus, setGsiBroadcast, detectGsiCfgDirs } = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  enableGsi: vi.fn(),
  disableGsi: vi.fn(),
  getGsiStatus: vi.fn(),
  setGsiBroadcast: vi.fn(),
  detectGsiCfgDirs: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => unknown) => { handlers.set(channel, handler) },
  },
  dialog: { showOpenDialog: (...args: any[]) => showOpenDialog(...args) },
}))

vi.mock('../services/gsiService.ts', () => ({ enableGsi, disableGsi, getGsiStatus, setGsiBroadcast }))
vi.mock('../services/gsiConfig.ts', () => ({ detectGsiCfgDirs }))

import { registerGsiIpcHandlers } from './gsiIpc.ts'

const store = { get: vi.fn(), set: vi.fn() }

beforeEach(() => {
  handlers.clear()
  vi.clearAllMocks()
})

describe('registerGsiIpcHandlers', () => {
  it('wires gsi:getStatus to getGsiStatus(store)', () => {
    getGsiStatus.mockReturnValue({ enabled: true })
    registerGsiIpcHandlers(store, () => [])
    expect(handlers.get('gsi:getStatus')!()).toEqual({ enabled: true })
    expect(getGsiStatus).toHaveBeenCalledWith(store)
  })

  it('wires gsi:enable to enableGsi(store, options) defaulting to {}', async () => {
    enableGsi.mockResolvedValue({ ok: true })
    registerGsiIpcHandlers(store, () => [])
    await handlers.get('gsi:enable')!({}, { port: 1234 })
    expect(enableGsi).toHaveBeenCalledWith(store, { port: 1234 })
    await handlers.get('gsi:enable')!({}, undefined)
    expect(enableGsi).toHaveBeenCalledWith(store, {})
  })

  it('wires gsi:disable to disableGsi(store)', async () => {
    registerGsiIpcHandlers(store, () => [])
    await handlers.get('gsi:disable')!({})
    expect(disableGsi).toHaveBeenCalledWith(store)
  })

  it('wires gsi:detectCfgDir to detectGsiCfgDirs()', () => {
    detectGsiCfgDirs.mockReturnValue(['/a/path'])
    registerGsiIpcHandlers(store, () => [])
    expect(handlers.get('gsi:detectCfgDir')!()).toEqual(['/a/path'])
  })

  it('gsi:chooseCfgDir returns the picked path, or null when canceled', async () => {
    registerGsiIpcHandlers(store, () => [])

    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/picked/dir'] })
    expect(await handlers.get('gsi:chooseCfgDir')!({})).toBe('/picked/dir')

    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await handlers.get('gsi:chooseCfgDir')!({})).toBeNull()
  })

  it('registers a broadcast callback that sends gsi:snapshotUpdated to live webContents only', () => {
    registerGsiIpcHandlers(store, () => [])

    const alive = { isDestroyed: () => false, send: vi.fn() }
    const dead = { isDestroyed: () => true, send: vi.fn() }
    registerGsiIpcHandlers(store, () => [alive, dead])
    const latestBroadcastFn = setGsiBroadcast.mock.calls[setGsiBroadcast.mock.calls.length - 1][0] as (snap: unknown) => void
    latestBroadcastFn({ status: 'connected' })

    expect(alive.send).toHaveBeenCalledWith('gsi:snapshotUpdated', { status: 'connected' })
    expect(dead.send).not.toHaveBeenCalled()
  })
})

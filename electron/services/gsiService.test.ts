import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  closeGsiOnQuit,
  disableGsi,
  enableGsi,
  getGsiStatus,
  resetGsiRuntimeForTests,
  restoreGsiOnStartup,
  setGsiBroadcast,
  type GsiServiceStore,
} from './gsiService.ts'
import { getGsiConfigPath } from './gsiConfig.ts'
import type { AppState } from '../../src/types'

function createStore(appState: Partial<AppState> = {}): GsiServiceStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  data.set('appState', { activeCycleId: '', heroPool: [], currentStreak: 0, longestStreak: 0, ...appState })
  return {
    data,
    get: (key, defaultValue) => data.has(key) ? data.get(key) : defaultValue,
    set: (key, value) => { data.set(key, value) },
  }
}

function extractTokenFromCfg(cfgDir: string): string {
  const content = readFileSync(getGsiConfigPath(cfgDir), 'utf-8')
  const match = content.match(/token=([a-f0-9]+)/)
  if (!match) throw new Error('token not found in cfg fixture')
  return match[1]
}

let tmpDir: string

afterEach(async () => {
  await closeGsiOnQuit()
  resetGsiRuntimeForTests()
  setGsiBroadcast(null)
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

describe('enableGsi', () => {
  it('starts the server, installs the cfg file, and persists {enabled, cfgDir, port} only', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gsi-service-'))
    const store = createStore()

    const result = await enableGsi(store, { cfgDir: tmpDir, port: 53711 })

    expect(result).toEqual({ ok: true })
    const appState = store.get('appState') as AppState
    expect(appState.gsi).toEqual({ enabled: true, cfgDir: tmpDir, port: 53711 })
    expect(readFileSync(getGsiConfigPath(tmpDir), 'utf-8')).toContain('127.0.0.1:53711')

    const status = getGsiStatus(store)
    expect(status.enabled).toBe(true)
    expect(status.server).toEqual({ running: true, port: 53711 })
    expect(status.config.installed).toBe(true)
    expect(status.snapshot).toEqual(expect.objectContaining({ status: 'disconnected' }))
  })

  it('rolls back (closes the server, does not persist enabled) when cfg install fails', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gsi-service-'))
    // an existing file where the cfg dir should be forces installGsiConfig to fail with ENOTDIR
    const bogusCfgDir = join(tmpDir, 'not-a-dir.txt')
    writeFileSync(bogusCfgDir, 'x')
    const store = createStore()

    const result = await enableGsi(store, { cfgDir: bogusCfgDir, port: 53712 })

    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe('string')
    const appState = store.get('appState') as AppState
    expect(appState.gsi).toBeUndefined()
    expect(getGsiStatus(store).server.running).toBe(false)
  })

  it('feeds parsed payloads into the in-memory snapshot and broadcasts them', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gsi-service-'))
    const store = createStore()
    const broadcasts: unknown[] = []
    setGsiBroadcast(snap => broadcasts.push(snap))

    await enableGsi(store, { cfgDir: tmpDir, port: 53713 })
    const res = await fetch('http://127.0.0.1:53713/gsi?token=' + extractTokenFromCfg(tmpDir), {
      method: 'POST',
      body: JSON.stringify({ draft: { team2: { picks: [1, 2] } } }),
    })
    expect(res.status).toBe(200)
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(broadcasts.length).toBeGreaterThan(0)
    const last = broadcasts[broadcasts.length - 1] as { enemyHeroIds: number[] }
    expect(last.enemyHeroIds).toEqual([1, 2])
  })
})

describe('disableGsi', () => {
  it('closes the server, uninstalls the cfg file, and flips enabled to false', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gsi-service-'))
    const store = createStore()
    await enableGsi(store, { cfgDir: tmpDir, port: 53714 })

    await disableGsi(store)

    const appState = store.get('appState') as AppState
    expect(appState.gsi?.enabled).toBe(false)
    expect(getGsiStatus(store).server.running).toBe(false)
    expect(getGsiStatus(store).config.installed).toBe(false)
  })
})

describe('restoreGsiOnStartup', () => {
  it('does nothing when appState.gsi.enabled is not true', async () => {
    const store = createStore({ gsi: { enabled: false } })
    await restoreGsiOnStartup(store)
    expect(getGsiStatus(store).server.running).toBe(false)
  })

  it('re-enables the server using the persisted cfgDir/port when enabled is true', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gsi-service-'))
    const store = createStore({ gsi: { enabled: true, cfgDir: tmpDir, port: 53715 } })

    await restoreGsiOnStartup(store)

    expect(getGsiStatus(store).server).toEqual({ running: true, port: 53715 })
  })
})

describe('closeGsiOnQuit', () => {
  it('closes a running server', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gsi-service-'))
    const store = createStore()
    await enableGsi(store, { cfgDir: tmpDir, port: 53716 })

    await closeGsiOnQuit()

    expect(getGsiStatus(store).server.running).toBe(false)
  })
})

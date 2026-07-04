import { randomBytes } from 'crypto'
import type { AppState, DraftGsiSnapshot, GsiEnableResult, GsiStatus } from '../../src/types'
import { parseGsiDraftPayload } from '../../src/schema/gsi.ts'
import { applyStaleTimeout, deriveDraftSnapshot, INITIAL_DRAFT_GSI_SNAPSHOT } from '../../src/utils/gsiDraft.ts'
import { detectGsiCfgDirs, getGsiConfigStatus, installGsiConfig, uninstallGsiConfig } from './gsiConfig.ts'
import { startGsiServer, type GsiServerHandle } from './gsiServer.ts'

export const DEFAULT_GSI_PORT = 53411
const STALE_CHECK_INTERVAL_MS = 15_000

export interface GsiServiceStore {
  get: (key: string, defaultValue?: unknown) => unknown
  set: (key: string, value: unknown) => void
}

// 运行时状态：不落盘。server 句柄、token 和已识别快照只存在 main 进程内存里，
// app 重启或 disable 都会清空；持久化只保留 { enabled, cfgDir, port }。
let serverHandle: GsiServerHandle | null = null
let installedCfgDir: string | null = null
let snapshot: DraftGsiSnapshot = INITIAL_DRAFT_GSI_SNAPSHOT
let staleTimer: ReturnType<typeof setInterval> | null = null
let broadcast: ((snapshot: DraftGsiSnapshot) => void) | null = null

export function setGsiBroadcast(cb: ((snapshot: DraftGsiSnapshot) => void) | null): void {
  broadcast = cb
}

function emitSnapshot(next: DraftGsiSnapshot): void {
  snapshot = next
  broadcast?.(next)
}

function stopStaleTimer(): void {
  if (staleTimer) {
    clearInterval(staleTimer)
    staleTimer = null
  }
}

function startStaleTimer(): void {
  stopStaleTimer()
  staleTimer = setInterval(() => {
    emitSnapshot(applyStaleTimeout(snapshot, Date.now()))
  }, STALE_CHECK_INTERVAL_MS)
}

async function stopRuntime(): Promise<void> {
  stopStaleTimer()
  if (serverHandle) {
    await serverHandle.close()
    serverHandle = null
  }
  snapshot = INITIAL_DRAFT_GSI_SNAPSHOT
}

function readGsiAppState(store: GsiServiceStore): AppState {
  return store.get('appState') as AppState
}

export async function enableGsi(store: GsiServiceStore, options: { cfgDir?: string; port?: number } = {}): Promise<GsiEnableResult> {
  await stopRuntime()

  const appState = readGsiAppState(store)
  const cfgDir = options.cfgDir ?? appState.gsi?.cfgDir ?? detectGsiCfgDirs()[0]
  if (!cfgDir) {
    return { ok: false, error: '未检测到 Dota 2 cfg 目录，请手动选择 gamestate_integration 目录。' }
  }
  const port = options.port ?? appState.gsi?.port ?? DEFAULT_GSI_PORT
  const authToken = randomBytes(16).toString('hex')

  let handle: GsiServerHandle
  try {
    handle = await startGsiServer({
      port,
      authToken,
      onPayload: raw => {
        const payload = parseGsiDraftPayload(raw)
        if (!payload) return
        emitSnapshot(deriveDraftSnapshot(snapshot, payload, Date.now()))
      },
    })
  } catch (error) {
    return { ok: false, error: `本地 GSI 服务启动失败（端口 ${port}）：${error instanceof Error ? error.message : String(error)}` }
  }

  try {
    installGsiConfig(cfgDir, handle.port, authToken)
  } catch (error) {
    await handle.close()
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  serverHandle = handle
  installedCfgDir = cfgDir
  snapshot = INITIAL_DRAFT_GSI_SNAPSHOT
  startStaleTimer()

  store.set('appState', { ...appState, gsi: { enabled: true, cfgDir, port: handle.port } })
  return { ok: true }
}

export async function disableGsi(store: GsiServiceStore): Promise<void> {
  const appStateBeforeStop = readGsiAppState(store)
  const cfgDir = installedCfgDir ?? appStateBeforeStop.gsi?.cfgDir ?? null
  await stopRuntime()
  if (cfgDir) {
    try {
      uninstallGsiConfig(cfgDir)
    } catch (error) {
      console.warn('[gsi] 卸载配置文件失败（忽略，不阻塞 disable）：', error)
    }
  }
  installedCfgDir = null

  const appState = readGsiAppState(store)
  store.set('appState', { ...appState, gsi: { ...appState.gsi, enabled: false } })
}

export function getGsiStatus(store: GsiServiceStore): GsiStatus {
  const appState = readGsiAppState(store)
  return {
    enabled: Boolean(appState.gsi?.enabled),
    server: { running: serverHandle !== null, port: serverHandle?.port ?? null },
    config: getGsiConfigStatus(installedCfgDir ?? appState.gsi?.cfgDir),
    snapshot: serverHandle ? snapshot : null,
  }
}

export async function restoreGsiOnStartup(store: GsiServiceStore): Promise<void> {
  const appState = readGsiAppState(store)
  if (!appState.gsi?.enabled) return
  const result = await enableGsi(store, { cfgDir: appState.gsi.cfgDir, port: appState.gsi.port })
  if (!result.ok) {
    console.warn('[gsi] 启动时恢复 GSI 服务失败，状态保持“已开启但未连接”，用户可在设置页重试：', result.error)
  }
}

export async function closeGsiOnQuit(): Promise<void> {
  installedCfgDir = null
  await stopRuntime()
}

/** 测试专用：清空模块级运行时状态，避免测试间串状态。 */
export function resetGsiRuntimeForTests(): void {
  stopStaleTimer()
  serverHandle = null
  installedCfgDir = null
  snapshot = INITIAL_DRAFT_GSI_SNAPSHOT
  broadcast = null
}

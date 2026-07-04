import type { DraftGsiSnapshot } from '../types'
import { parseGsiDraftPayload, type GsiDraftPayload } from '../schema/gsi.ts'

export { parseGsiDraftPayload }

// cfg 里的 heartbeat 是 30s；离线判定放宽到 3 倍心跳间隔，避免网络抖动误判掉线。
export const GSI_STALE_AFTER_MS = 90_000

export const INITIAL_DRAFT_GSI_SNAPSHOT: DraftGsiSnapshot = {
  status: 'disconnected',
  lastPayloadAt: null,
  enemyHeroIds: [],
  gameMode: 'unknown',
}

// ⚠️ 未经真实客户端验证：这些 game_state 值来自公开 GSI 文档，本环境没有
// Dota 2 客户端可供抓包确认，实际值和触发时机需要 30.0 fixture 校准。
const GAME_IN_PROGRESS_STATES = new Set([
  'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
  'DOTA_GAMERULES_STATE_POST_GAME',
])

/**
 * 纯函数：不做任何副作用（不写 store、不发 IPC），由调用方决定何时持久化/推送。
 */
export function deriveDraftSnapshot(prev: DraftGsiSnapshot, payload: GsiDraftPayload, now: number): DraftGsiSnapshot {
  const gameState = payload.map?.game_state
  const gameInProgress = gameState !== undefined && GAME_IN_PROGRESS_STATES.has(gameState)

  const incomingPicks = payload.draft?.team2?.picks ?? []
  const enemyHeroIds = gameInProgress
    ? prev.enemyHeroIds
    : Array.from(new Set([...prev.enemyHeroIds, ...incomingPicks])).sort((a, b) => a - b)

  const status: DraftGsiSnapshot['status'] = gameInProgress
    ? 'connected'
    : payload.draft
      ? 'in_draft'
      : 'connected'

  return {
    status,
    lastPayloadAt: now,
    enemyHeroIds,
    gameMode: prev.gameMode,
  }
}

/** 超过心跳超时窗口没收到新包时，把状态从 connected/in_draft 降级为 stale，不清空已识别数据。 */
export function applyStaleTimeout(snapshot: DraftGsiSnapshot, now: number, staleAfterMs = GSI_STALE_AFTER_MS): DraftGsiSnapshot {
  if (snapshot.status === 'disconnected' || snapshot.status === 'stale') return snapshot
  if (snapshot.lastPayloadAt === null) return snapshot
  if (now - snapshot.lastPayloadAt > staleAfterMs) {
    return { ...snapshot, status: 'stale' }
  }
  return snapshot
}

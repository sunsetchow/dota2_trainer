import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import store from './store.ts'
import opendotaHeroes from '../src/data/opendotaHeroes.json'
import heroMatchupSnapshot from '../src/data/heroMatchupSnapshot.json'
import type { AppState, TrainingCycle, MatchLog, PreGameSetup, DailyCheckin, MMRLog, HeroNote, OpenDotaImportedMatch, OpenDotaParseRequestResult, OpenDotaRecentMatch, HeroMatchupCache, HeroMatchupStats, HeroMatchupSyncResult, HeroBenchmarkCache, StratzRankBracket } from '../src/types'

interface OpenDotaPlayer {
  account_id?: number;
  player_slot?: number;
  hero_id?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  last_hits?: number;
  denies?: number;
  lh_t?: number[];
  dn_t?: number[];
  gold_t?: number[];
  xp_t?: number[];
  hero_damage?: number;
  purchase_log?: OpenDotaPurchaseLogItem[];
  gold_per_min?: number;
  xp_per_min?: number;
  level?: number;
  lane?: number;
  lane_role?: number;
  lane_efficiency?: number;
  lane_efficiency_pct?: number;
  lane_kills?: number;
  lane_win?: boolean | number | string;
  lane_result?: boolean | number | string;
  lane_outcome?: boolean | number | string;
  laning?: {
    lane?: number;
    lane_role?: number;
    lane_efficiency?: number;
    lane_efficiency_pct?: number;
    win?: boolean | number | string;
    result?: boolean | number | string;
    outcome?: boolean | number | string;
  };
  isRadiant?: boolean;
  win?: number;
  lose?: number;
}

interface OpenDotaPurchaseLogItem {
  time?: number;
  key?: string;
}

interface OpenDotaMatchResponse {
  match_id?: number;
  duration?: number;
  start_time?: number;
  radiant_win?: boolean;
  players?: OpenDotaPlayer[];
}

interface OpenDotaHeroMeta {
  id: number;
  name: string;
  localizedName: string;
  displayName: string;
}

interface OpenDotaHeroMatchupResponseItem {
  hero_id?: number;
  games_played?: number;
  wins?: number;
}

interface OpenDotaRecentMatchResponseItem {
  match_id?: number;
  hero_id?: number;
  start_time?: number;
  duration?: number;
  radiant_win?: boolean;
  player_slot?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
}

interface OpenDotaBenchmarkResponse {
  hero_id: number;
  result: HeroBenchmarkCache['benchmarks'];
}

const OPEN_DOTA_HEROES = opendotaHeroes as OpenDotaHeroMeta[]
const openDotaHeroNameById = new Map<number, string>(
  OPEN_DOTA_HEROES.map(hero => [hero.id, hero.displayName || hero.localizedName])
)

function getOpenDotaUrl(path: string): URL {
  const appState = store.get('appState') as AppState
  const url = new URL(`https://api.opendota.com/api${path}`)
  const apiKey = appState.openDota?.apiKey?.trim()
  if (apiKey) url.searchParams.set('api_key', apiKey)
  return url
}

function normalizeOpenDotaHttpError(status: number, body: string): string {
  const suffix = body.trim() ? `（${body.trim().slice(0, 180)}）` : ''
  if (status === 404) {
    return `OpenDota 没有找到这场比赛，或比赛还没有解析。可以先请求解析，几分钟后重试。${suffix}`
  }
  if (status === 429) {
    return `OpenDota 请求过于频繁。稍后重试，或在设置页填写 API Key。${suffix}`
  }
  if (status >= 500) {
    return `OpenDota 暂时无法返回这场比赛详情，常见原因是比赛未解析或 OpenDota 后端临时错误。可以先请求解析，几分钟后重试。${suffix}`
  }
  return `OpenDota 请求失败：HTTP ${status}${suffix}`
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

const KEY_ITEM_LABELS: Record<string, string> = {
  blink: '闪烁匕首',
  black_king_bar: '黑皇杖',
  blade_mail: '刃甲',
  vanguard: '先锋盾',
  crimson_guard: '赤红甲',
  pipe: '洞察烟斗',
  lotus_orb: '清莲宝珠',
  shivas_guard: '希瓦的守护',
  assault: '强袭胸甲',
  radiance: '辉耀',
  heart: '恐鳌之心',
  refresher: '刷新球',
  sheepstick: '邪恶镰刀',
  orchid: '紫怨',
  bloodthorn: '血棘',
  solar_crest: '炎阳纹章',
  heavens_halberd: '天堂之戟',
  armlet: '莫尔迪基安的臂章',
  helm_of_the_dominator: '支配头盔',
  helm_of_the_overlord: '统御头盔',
  harpoon: '鱼叉',
  echo_sabre: '回音战刃',
  desolator: '黯灭',
  manta: '幻影斧',
  diffusal_blade: '净魂之刃',
  eternal_shroud: '永恒之盘',
  aeon_disk: '永恒之盘',
  guardian_greaves: '卫士胫甲',
  mekansm: '梅肯斯姆',
  hood_of_defiance: '挑战头巾',
  mage_slayer: '法师克星',
  kaya_and_sange: '散慧对剑',
  sange_and_yasha: '散夜对剑',
  aghanims_scepter: '阿哈利姆神杖',
  ultimate_scepter: '阿哈利姆神杖',
  aghanims_shard: '阿哈利姆魔晶',
}

function getFirstKeyItem(purchaseLog?: OpenDotaPurchaseLogItem[]): { minute: number; name: string } | null {
  const match = [...(purchaseLog ?? [])]
    .filter(item => item.key && item.time !== undefined && item.time > 0 && KEY_ITEM_LABELS[item.key])
    .sort((a, b) => (a.time ?? 0) - (b.time ?? 0))[0]

  if (!match?.key || match.time === undefined) return null
  return {
    minute: Math.max(1, Math.ceil(match.time / 60)),
    name: KEY_ITEM_LABELS[match.key],
  }
}

function getLaneEfficiency(player: OpenDotaPlayer): number | undefined {
  const value = player.lane_efficiency
    ?? player.lane_efficiency_pct
    ?? player.laning?.lane_efficiency
    ?? player.laning?.lane_efficiency_pct
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value <= 1 ? value * 100 : value
}

function getLaneRole(player: OpenDotaPlayer): number | undefined {
  return player.lane_role ?? player.laning?.lane_role ?? player.laning?.lane
}

function getLane(player: OpenDotaPlayer): number | undefined {
  return player.lane ?? player.laning?.lane
}

function getIsRadiant(player: OpenDotaPlayer): boolean | undefined {
  if (typeof player.isRadiant === 'boolean') return player.isRadiant
  if (typeof player.player_slot !== 'number') return undefined
  return player.player_slot < 128
}

function normalizeDirectLaneResult(value: unknown): 'dominated' | 'even' | 'lost' | undefined {
  if (value === true) return 'dominated'
  if (value === false) return 'lost'
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) return 'dominated'
    if (value === 0) return 'lost'
    if (value === 2) return 'even'
    return undefined
  }
  if (typeof value !== 'string') return undefined

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['1', 'true', 'win', 'won', 'lane_win', 'won_lane', 'dominated', 'stomp', 'crush', '压制'].includes(normalized)) {
    return 'dominated'
  }
  if (['0', 'false', 'loss', 'lose', 'lost', 'lane_loss', 'lost_lane', '被压'].includes(normalized)) {
    return 'lost'
  }
  if (['2', 'draw', 'even', 'tie', 'tied', '均势', '持平'].includes(normalized)) {
    return 'even'
  }
  return undefined
}

function averageLaneEfficiency(players: OpenDotaPlayer[]): number | undefined {
  const values = players
    .map(getLaneEfficiency)
    .filter((value): value is number => value !== undefined)
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getOpposingLanePlayers(player: OpenDotaPlayer, players: OpenDotaPlayer[]): OpenDotaPlayer[] {
  const lane = getLane(player)
  const isRadiant = getIsRadiant(player)
  if (lane === undefined || isRadiant === undefined) return []

  const samePhysicalLane = players.filter(p => getLane(p) === lane && getIsRadiant(p) === !isRadiant)
  if (samePhysicalLane.length > 0) return samePhysicalLane

  const laneRole = getLaneRole(player)
  if (laneRole === undefined) return []
  const opposingRole = laneRole === 1 ? 3 : laneRole === 3 ? 1 : laneRole
  return players.filter(p => getLaneRole(p) === opposingRole && getIsRadiant(p) === !isRadiant)
}

function inferLaneResult(player: OpenDotaPlayer, players: OpenDotaPlayer[] = []): 'dominated' | 'even' | 'lost' | undefined {
  const directResult = [
    player.lane_win,
    player.laning?.win,
    player.lane_result,
    player.laning?.result,
    player.lane_outcome,
    player.laning?.outcome,
  ].map(normalizeDirectLaneResult).find(Boolean)

  if (directResult) return directResult

  const efficiency = getLaneEfficiency(player)
  const lane = getLane(player)
  const isRadiant = getIsRadiant(player)

  if (lane !== undefined && isRadiant !== undefined) {
    const sameLanePlayers = players.filter(p => getLane(p) === lane && getIsRadiant(p) === isRadiant)
    const opposingLanePlayers = getOpposingLanePlayers(player, players)
    const teamEfficiency = averageLaneEfficiency(sameLanePlayers)
    const opposingEfficiency = averageLaneEfficiency(opposingLanePlayers)

    if (teamEfficiency !== undefined && opposingEfficiency !== undefined) {
      const diff = teamEfficiency - opposingEfficiency
      if (diff >= 10) return 'dominated'
      if (diff <= -10) return 'lost'
      return 'even'
    }
  }

  if (efficiency === undefined) return undefined
  if (efficiency >= 85) return 'dominated'
  if (efficiency <= 50) return 'lost'
  return 'even'
}

function getMinuteStat(values: number[] | undefined, minute: number): number | undefined {
  if (!values || values.length <= minute) return undefined
  return values[minute]
}

function computePhaseGpm(goldT: number[] | undefined, durationMin: number): { laningGpm?: number; midGpm?: number; lateGpm?: number } {
  if (!goldT || goldT.length < 2) return {}
  const lastIndex = goldT.length - 1
  // ⚠️ 越界返回 undefined 而不是 clamp 到最后一格：clamp 会让两个越界分钟号读到同一个值，
  // 相减得到虚假的 0（看起来像"这个阶段没赚到钱"，实际是"数据没到这么长"）。
  const at = (min: number): number | undefined => (min >= 0 && min <= lastIndex ? goldT[min] : undefined)
  const laningEnd = Math.min(10, durationMin)
  const midEnd = Math.min(25, durationMin)
  const atLaningEnd = at(laningEnd)
  const atMidEnd = at(midEnd)
  const atDuration = at(durationMin)
  return {
    laningGpm: laningEnd > 0 && atLaningEnd !== undefined ? atLaningEnd / laningEnd : undefined,
    midGpm: midEnd > laningEnd && atMidEnd !== undefined && atLaningEnd !== undefined ? (atMidEnd - atLaningEnd) / (midEnd - laningEnd) : undefined,
    lateGpm: durationMin > midEnd && atDuration !== undefined && atMidEnd !== undefined ? (atDuration - atMidEnd) / (durationMin - midEnd) : undefined,
  }
}

function interpolatePercentile(points: Array<{ percentile: number; value: number }> | undefined, actualValue: number | undefined): number | null {
  if (!points?.length || actualValue === undefined || !Number.isFinite(actualValue)) return null
  const sorted = [...points].sort((a, b) => a.value - b.value)
  // 已用真实接口核对：OpenDota /benchmarks 的 percentile 恒为 0-1 小数（0.1/0.2/.../0.9），
  // 不会是 0-100 整数，故 p <= 1 这支必然命中；保留 else 分支只是防御性兜底。
  const toPct = (p: number) => (p <= 1 ? p * 100 : p)
  if (actualValue <= sorted[0].value) return toPct(sorted[0].percentile)
  const last = sorted[sorted.length - 1]
  if (actualValue >= last.value) return toPct(last.percentile)
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i]
    const hi = sorted[i + 1]
    if (actualValue >= lo.value && actualValue <= hi.value) {
      const ratio = hi.value === lo.value ? 0 : (actualValue - lo.value) / (hi.value - lo.value)
      return toPct(lo.percentile + ratio * (hi.percentile - lo.percentile))
    }
  }
  return null
}

const HERO_BENCHMARK_TTL_MS = 7 * 24 * 60 * 60 * 1000

function isCacheFresh(syncedAt: number, ttlMs: number): boolean {
  return Date.now() - syncedAt < ttlMs
}

function isValidBenchmarkResponse(result: HeroBenchmarkCache['benchmarks'] | undefined): boolean {
  return Boolean(result) && Object.values(result).some(points => Array.isArray(points) && points.length > 0)
}

async function getOrFetchHeroBenchmarks(heroId: number): Promise<HeroBenchmarkCache> {
  const cacheKey = String(heroId)
  const cached = (store.get('heroBenchmarkCache', {}) as Record<string, HeroBenchmarkCache>)[cacheKey]
  if (cached && isCacheFresh(cached.syncedAt, HERO_BENCHMARK_TTL_MS)) return cached

  const raw = await fetchOpenDotaJson<OpenDotaBenchmarkResponse>(`/benchmarks?hero_id=${heroId}`, 15_000)
  if (!isValidBenchmarkResponse(raw.result)) {
    if (cached) return cached // 响应异常（限速/格式变化）时优先沿用旧缓存，即使已过期
    throw new Error('OpenDota benchmarks 返回数据异常。')
  }

  const cache: HeroBenchmarkCache = {
    source: 'opendota',
    syncedAt: Date.now(),
    heroId,
    benchmarks: raw.result,
  }
  // 写回前重新读取最新缓存（而不是复用 await 之前的快照），避免并发导入不同英雄时
  // 后完成的请求用旧快照覆盖、丢掉另一个英雄刚写入的数据（TOCTOU）。
  const latest = store.get('heroBenchmarkCache', {}) as Record<string, HeroBenchmarkCache>
  store.set('heroBenchmarkCache', { ...latest, [cacheKey]: cache })
  return cache
}

function getMatchResult(match: OpenDotaMatchResponse, player: OpenDotaPlayer): 'win' | 'loss' {
  if (player.win === 1) return 'win'
  if (player.lose === 1) return 'loss'

  const isRadiant = getIsRadiant(player)
  if (typeof match.radiant_win === 'boolean' && isRadiant !== undefined) {
    return match.radiant_win === isRadiant ? 'win' : 'loss'
  }

  throw new Error('OpenDota 返回的数据缺少胜负信息，无法可靠导入这场比赛。')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getOpenDotaAccountId(): string {
  const appState = store.get('appState') as AppState
  const accountId = appState.openDota?.accountId?.trim()
  if (!accountId || !/^\d+$/.test(accountId)) {
    throw new Error('请先在设置页填写 OpenDota Account ID。')
  }
  return accountId
}

function normalizeMatchId(matchIdInput: string): string {
  const matchId = String(matchIdInput ?? '').trim()
  if (!/^\d+$/.test(matchId)) {
    throw new Error('请输入有效的 Match ID。')
  }
  return matchId
}

function buildImportedMatch(matchId: string, match: OpenDotaMatchResponse, player: OpenDotaPlayer): OpenDotaImportedMatch {
  if (!player.hero_id) {
    throw new Error('OpenDota 返回的数据缺少英雄信息。')
  }

  const firstKeyItem = getFirstKeyItem(player.purchase_log)
  const laneEfficiency = getLaneEfficiency(player)
  const durationMin = Math.max(1, Math.round((match.duration ?? 0) / 60))
  const phaseGpm = computePhaseGpm(player.gold_t, durationMin)
  return {
    matchId,
    timestamp: match.start_time ? match.start_time * 1000 : Date.now(),
    durationMin,
    result: getMatchResult(match, player),
    heroId: player.hero_id,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    lastHits: player.last_hits,
    denies: player.denies,
    csAt10: getMinuteStat(player.lh_t, 10),
    dnAt10: getMinuteStat(player.dn_t, 10),
    firstKeyItemMin: firstKeyItem?.minute,
    firstKeyItemName: firstKeyItem?.name,
    gpm: player.gold_per_min,
    xpm: player.xp_per_min,
    level: player.level,
    laneRole: getLaneRole(player),
    laneResult: inferLaneResult(player, match.players ?? []),
    laneEfficiency,
    laneKills: player.lane_kills,
    playerSlot: player.player_slot,
    isRadiant: player.isRadiant,
    ...phaseGpm,
  }
}

const BENCHMARK_METRICS: Array<{
  key: keyof HeroBenchmarkCache['benchmarks']
  field: 'gpmPercentile' | 'xpmPercentile' | 'lastHitsPercentile' | 'heroDamagePercentile'
  getValue: (player: OpenDotaPlayer, durationMin: number) => number | undefined
}> = [
  { key: 'gold_per_min', field: 'gpmPercentile', getValue: player => player.gold_per_min },
  { key: 'xp_per_min', field: 'xpmPercentile', getValue: player => player.xp_per_min },
  // last_hits/hero_damage 是全场总数，benchmark 是"每分钟"速率，必须先换算成速率再插值；
  // 缺失时要传 undefined（而不是 ?? 0 当真实 0 处理），否则会显示成一个虚假的极低百分位。
  { key: 'last_hits_per_min', field: 'lastHitsPercentile', getValue: (player, durationMin) => player.last_hits !== undefined ? player.last_hits / durationMin : undefined },
  { key: 'hero_damage_per_min', field: 'heroDamagePercentile', getValue: (player, durationMin) => player.hero_damage !== undefined ? player.hero_damage / durationMin : undefined },
]

async function enrichImportedMatchWithBenchmarks(imported: OpenDotaImportedMatch, player: OpenDotaPlayer): Promise<OpenDotaImportedMatch> {
  try {
    const benchmarks = await getOrFetchHeroBenchmarks(imported.heroId)
    const durationMin = Math.max(1, imported.durationMin)
    const percentiles: Partial<OpenDotaImportedMatch> = {}
    for (const metric of BENCHMARK_METRICS) {
      percentiles[metric.field] = interpolatePercentile(benchmarks.benchmarks[metric.key], metric.getValue(player, durationMin)) ?? undefined
    }
    return { ...imported, ...percentiles }
  } catch (error) {
    console.error('[opendota:benchmarks] 赛后能力评分卡数据获取失败：', error instanceof Error ? error.message : error)
    return imported
  }
}

async function fetchOpenDotaImportedMatch(matchId: string, accountId: string, timeoutMs = 15_000): Promise<OpenDotaImportedMatch> {
  const url = getOpenDotaUrl(`/matches/${matchId}`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      const body = await readResponseBody(response)
      throw new Error(normalizeOpenDotaHttpError(response.status, body))
    }

    const match = await response.json() as OpenDotaMatchResponse
    if (!match.players?.length) {
      throw new Error('OpenDota 没有返回玩家明细。这场比赛可能还没有解析，可以先请求解析，几分钟后重试。')
    }
    const player = match.players.find(p => String(p.account_id) === accountId)
    if (!player) {
      throw new Error('这场比赛里没有找到设置中的 Account ID。')
    }

    const imported = buildImportedMatch(matchId, match, player)
    return await enrichImportedMatchWithBenchmarks(imported, player)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenDota 请求超时，请稍后重试。')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function autoImportLatestOpenDotaMatch(existingMatchIds: string[] = []): Promise<OpenDotaImportedMatch> {
  const accountId = getOpenDotaAccountId()
  const known = new Set(existingMatchIds.map(String))
  const recent = await fetchOpenDotaJson<OpenDotaRecentMatchResponseItem[]>(`/players/${accountId}/recentMatches`, 15_000)
  const candidates = recent
    .map(row => row.match_id)
    .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
    .map(String)
    .filter(matchId => !known.has(matchId))

  if (candidates.length === 0) {
    throw new Error('OpenDota 最近对局里没有找到未记录的新比赛。')
  }

  let lastError: Error | null = null
  for (const matchId of candidates.slice(0, 5)) {
    try {
      return await fetchOpenDotaImportedMatch(matchId, accountId, 20_000)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw new Error(lastError?.message ?? '最近几场比赛暂时无法导入，可能还没有解析。')
}

async function listRecentOpenDotaMatches(existingMatchIds: string[] = []): Promise<OpenDotaRecentMatch[]> {
  const accountId = getOpenDotaAccountId()
  const known = new Set(existingMatchIds.map(String))
  const recent = await fetchOpenDotaJson<OpenDotaRecentMatchResponseItem[]>(`/players/${accountId}/recentMatches`, 15_000)

  return recent
    .filter(row => typeof row.match_id === 'number' && Number.isFinite(row.match_id))
    .slice(0, 10)
    .map(row => {
      const isRadiant = typeof row.player_slot === 'number' ? row.player_slot < 128 : undefined
      const result = typeof row.radiant_win === 'boolean' && isRadiant !== undefined
        ? (row.radiant_win === isRadiant ? 'win' as const : 'loss' as const)
        : undefined
      const matchId = String(row.match_id)
      return {
        matchId,
        heroId: row.hero_id,
        heroName: row.hero_id ? openDotaHeroNameById.get(row.hero_id) : undefined,
        timestamp: row.start_time ? row.start_time * 1000 : undefined,
        durationMin: row.duration ? Math.max(1, Math.round(row.duration / 60)) : undefined,
        result,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        recorded: known.has(matchId),
      }
    })
}

async function requestOpenDotaParse(matchId: string, timeoutMs = 15_000): Promise<OpenDotaParseRequestResult> {
  const url = getOpenDotaUrl(`/request/${matchId}`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { method: 'POST', signal: controller.signal })
    const body = await readResponseBody(response)
    if (!response.ok) {
      throw new Error(normalizeOpenDotaHttpError(response.status, body))
    }

    let jobId: string | undefined
    try {
      const data = JSON.parse(body) as { job?: { jobId?: string }; jobId?: string }
      jobId = data.jobId ?? data.job?.jobId
    } catch {
      jobId = undefined
    }

    return {
      matchId,
      jobId,
      message: jobId
        ? `已提交解析请求（Job ${jobId}）。请等待几分钟后重新导入。`
        : '已提交解析请求。请等待几分钟后重新导入。',
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenDota 解析请求超时，请稍后重试。')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchOpenDotaJson<T>(path: string, timeoutMs = 15_000): Promise<T> {
  const url = getOpenDotaUrl(path)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      const body = await readResponseBody(response)
      throw new Error(normalizeOpenDotaHttpError(response.status, body))
    }
    return await response.json() as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OpenDota 请求超时，请稍后重试。')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function todayKey(): string {
  return dateKeyFromDate(new Date())
}

function dateKeyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const HERO_MATCHUP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function getIsoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function formatDateTime(ts?: number): string {
  if (!ts) return '未知'
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function runLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]
      index += 1
      await task(item)
      await sleep(1100)
    }
  })
  await Promise.all(workers)
}

async function syncOpenDotaHeroMatchups(force = false): Promise<HeroMatchupSyncResult> {
  const current = store.get('heroMatchupCache', null) as HeroMatchupCache | null
  const date = todayKey()
  const weekKey = getIsoWeekKey()
  const now = Date.now()
  const currentExpiresAt = current?.expiresAt ?? (current?.syncedAt ? current.syncedAt + HERO_MATCHUP_CACHE_TTL_MS : 0)
  const isFresh = Boolean(current?.matchupCount && currentExpiresAt > now)

  if (!force && current?.matchupCount) {
    return {
      status: isFresh ? 'fresh' : 'stale',
      message: isFresh
        ? `本周 matchup 矩阵仍有效（${current.heroCount} 个英雄，${current.matchupCount} 条对位，有效期至 ${formatDateTime(currentExpiresAt)}）。`
        : `matchup 矩阵已过期，继续使用上次缓存（${current.date}）。建议在设置页手动同步本周矩阵。`,
      cache: current,
    }
  }

  if (!force && !current?.matchupCount) {
    throw new Error('本地还没有 OpenDota matchup 矩阵。请先在设置页点击“同步本周 matchup 矩阵”。')
  }

  const matchups: HeroMatchupCache['matchups'] = {}
  const errors: string[] = []

  await runLimited(OPEN_DOTA_HEROES, 1, async hero => {
    const heroName = openDotaHeroNameById.get(hero.id)
    if (!heroName) return

    try {
      const rows = await fetchOpenDotaJson<OpenDotaHeroMatchupResponseItem[]>(`/heroes/${hero.id}/matchups`, 20_000)
      const heroMatchups: Record<string, HeroMatchupStats> = {}

      for (const row of rows) {
        if (!row.hero_id || !row.games_played || row.wins === undefined) continue
        const enemyName = openDotaHeroNameById.get(row.hero_id)
        if (!enemyName) continue
        const winRate = (row.wins / row.games_played) * 100
        heroMatchups[enemyName] = {
          gamesPlayed: row.games_played,
          wins: row.wins,
          winRate,
          advantage: winRate - 50,
        }
      }

      matchups[heroName] = heroMatchups
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${heroName}: ${message}`)
    }
  })

  const matchupCount = Object.values(matchups).reduce((sum, item) => sum + Object.keys(item).length, 0)
  if (matchupCount === 0) {
    if (current) {
      return {
        status: 'stale',
        message: `OpenDota 同步失败，继续使用上一次缓存（${current.date}）。`,
        cache: current,
      }
    }
    throw new Error('OpenDota matchup 矩阵同步失败，且本地没有可用缓存。')
  }

  const syncedAt = Date.now()
  const cache: HeroMatchupCache = {
    source: 'opendota',
    version: 1,
    syncedAt,
    date,
    weekKey,
    expiresAt: syncedAt + HERO_MATCHUP_CACHE_TTL_MS,
    complete: errors.length === 0 && Object.keys(matchups).length === OPEN_DOTA_HEROES.length,
    heroCount: Object.keys(matchups).length,
    matchupCount,
    matchups,
    ...(errors.length > 0 && { errors: errors.slice(0, 12) }),
  }
  store.set('heroMatchupCache', cache)

  return {
    status: errors.length > 0 ? 'partial' : 'synced',
    message: errors.length > 0
      ? `已部分同步本周 matchup 矩阵（${cache.heroCount}/${OPEN_DOTA_HEROES.length} 个英雄，限速 1 req/sec）。`
      : `已同步本周 matchup 矩阵（${cache.weekKey}，${cache.heroCount} 个英雄，${cache.matchupCount} 条对位）。`,
    cache,
  }
}

// ── Stratz 英雄克制矩阵（可选数据源）：走天梯分段对局，样本量比 OpenDota 的 /matchups
// （职业赛专属数据，实测常年局数不到 50 场）大出两三个数量级，参见项目调研记录。

const STRATZ_GRAPHQL_URL = 'https://api.stratz.com/graphql'
// Stratz 的接口在 Cloudflare 后面，不带这个 UA 会被当机器人拦截返回验证页而不是 JSON（已实测确认）。
const STRATZ_USER_AGENT = 'STRATZ_API'

interface StratzMatchupVsRow {
  heroId2: number;
  winsAverage: number;
  matchCount: number;
}

interface StratzGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface StratzHeroVsHeroMatchupData {
  heroStats?: {
    // ⚠️ heroVsHeroMatchup 本身是个对象（不是数组！），advantage 才是数组，已用真实 API 响应核对过。
    heroVsHeroMatchup?: {
      advantage?: Array<{
        heroId: number;
        matchCountVs: number;
        vs: StratzMatchupVsRow[];
      }>;
    };
  };
}

// Stratz 的 bracketBasicIds 枚举里没有真正代表"聚合全部分段"的值——传字面量 "ALL" 实测返回空数据，
// 要拿到聚合结果得显式列出四个真实分段（等价于完全不传这个参数时的默认行为，已用真实 API 核对）。
const STRATZ_ALL_BRACKETS: StratzRankBracket[] = ['HERALD_GUARDIAN', 'CRUSADER_ARCHON', 'LEGEND_ANCIENT', 'DIVINE_IMMORTAL']

const HERO_VS_HERO_MATCHUP_QUERY = `
  query HeroVsHeroMatchup($heroId: Short!, $bracketBasicIds: [RankBracketBasicEnum]) {
    heroStats {
      heroVsHeroMatchup(heroId: $heroId, bracketBasicIds: $bracketBasicIds) {
        advantage {
          heroId
          matchCountVs
          vs { heroId2 winsAverage matchCount }
        }
      }
    }
  }
`

async function fetchStratzGraphQL<T>(apiKey: string, query: string, variables: Record<string, unknown>, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(STRATZ_GRAPHQL_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': STRATZ_USER_AGENT,
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!response.ok) {
      const body = await readResponseBody(response)
      throw new Error(`Stratz 请求失败：HTTP ${response.status}${body.trim() ? `（${body.trim().slice(0, 180)}）` : ''}`)
    }
    const json = await response.json() as StratzGraphQLResponse<T>
    if (json.errors?.length) {
      throw new Error(`Stratz GraphQL 错误：${json.errors.map(e => e.message).join('; ')}`)
    }
    if (!json.data) throw new Error('Stratz 返回了空数据。')
    return json.data
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Stratz 请求超时，请稍后重试。')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function syncStratzHeroMatchups(apiKey: string, rankBracket: StratzRankBracket, force = false): Promise<HeroMatchupSyncResult> {
  const current = store.get('heroMatchupCache', null) as HeroMatchupCache | null
  const date = todayKey()
  const weekKey = getIsoWeekKey()
  const now = Date.now()
  const currentExpiresAt = current?.expiresAt ?? (current?.syncedAt ? current.syncedAt + HERO_MATCHUP_CACHE_TTL_MS : 0)
  const isFresh = Boolean(current?.matchupCount && currentExpiresAt > now)

  if (!force && current?.matchupCount) {
    return {
      status: isFresh ? 'fresh' : 'stale',
      message: isFresh
        ? `本周 matchup 矩阵仍有效（${current.heroCount} 个英雄，${current.matchupCount} 条对位，有效期至 ${formatDateTime(currentExpiresAt)}，数据源 Stratz）。`
        : `matchup 矩阵已过期，继续使用上次缓存（${current.date}）。建议在设置页手动同步本周矩阵。`,
      cache: current,
    }
  }

  if (!force && !current?.matchupCount) {
    throw new Error('本地还没有英雄克制矩阵。请先在设置页点击“同步本周 matchup 矩阵”。')
  }

  const matchups: HeroMatchupCache['matchups'] = {}
  const errors: string[] = []
  const bracketArg = rankBracket === 'ALL' ? STRATZ_ALL_BRACKETS : [rankBracket]

  // Stratz 免费额度（登录后 2000 次/小时起）比 OpenDota 匿名限速宽松很多，并发拉取即可。
  await runLimited(OPEN_DOTA_HEROES, 5, async hero => {
    const heroName = openDotaHeroNameById.get(hero.id)
    if (!heroName) return

    try {
      const result = await fetchStratzGraphQL<StratzHeroVsHeroMatchupData>(
        apiKey,
        HERO_VS_HERO_MATCHUP_QUERY,
        { heroId: hero.id, bracketBasicIds: bracketArg },
      )
      const rows = result.heroStats?.heroVsHeroMatchup?.advantage?.[0]?.vs ?? []
      const heroMatchups: Record<string, HeroMatchupStats> = {}

      for (const row of rows) {
        if (!row.heroId2 || !row.matchCount) continue
        const enemyName = openDotaHeroNameById.get(row.heroId2)
        if (!enemyName) continue
        const winRate = row.winsAverage * 100
        heroMatchups[enemyName] = {
          gamesPlayed: row.matchCount,
          wins: Math.round(row.matchCount * row.winsAverage),
          winRate,
          advantage: winRate - 50,
        }
      }

      matchups[heroName] = heroMatchups
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${heroName}: ${message}`)
    }
  })

  const matchupCount = Object.values(matchups).reduce((sum, item) => sum + Object.keys(item).length, 0)
  if (matchupCount === 0) {
    if (current) {
      return {
        status: 'stale',
        message: `Stratz 同步失败，继续使用上一次缓存（${current.date}）。`,
        cache: current,
      }
    }
    throw new Error('Stratz matchup 矩阵同步失败，且本地没有可用缓存。')
  }

  const syncedAt = Date.now()
  const cache: HeroMatchupCache = {
    source: 'stratz',
    version: 1,
    syncedAt,
    date,
    weekKey,
    expiresAt: syncedAt + HERO_MATCHUP_CACHE_TTL_MS,
    complete: errors.length === 0 && Object.keys(matchups).length === OPEN_DOTA_HEROES.length,
    heroCount: Object.keys(matchups).length,
    matchupCount,
    matchups,
    ...(errors.length > 0 && { errors: errors.slice(0, 12) }),
  }
  store.set('heroMatchupCache', cache)

  return {
    status: errors.length > 0 ? 'partial' : 'synced',
    message: errors.length > 0
      ? `已部分同步本周 matchup 矩阵（${cache.heroCount}/${OPEN_DOTA_HEROES.length} 个英雄，数据源 Stratz · ${rankBracket}）。`
      : `已同步本周 matchup 矩阵（${cache.weekKey}，${cache.heroCount} 个英雄，${cache.matchupCount} 条对位，数据源 Stratz · ${rankBracket}）。`,
    cache,
  }
}

// ── 8 周主题常量
const DEFAULT_WEEK_THEMES: TrainingCycle['weekThemes'] = [
  {
    week: 0,
    theme: '建立基线',
    checklistItemIds: ['cs-10min', 'watch-video', 'replay-0-10', 'watch-replay', 'ranked-2', 'stop-2loss', 'death-replay', 'warmup-15', 'ranked-3', 'postmatch-review', 'key-10min', 'tomorrow-goal'],
  },
  {
    week: 1,
    theme: '对线基本功（补刀/消耗/不崩线）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'as-stop-drill', 'tower-cs', 'replay-lane', 'lane-mistake'],
  },
  {
    week: 2,
    theme: '对线基本功（补刀/消耗/不崩线）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'as-stop-drill', 'tower-cs', 'replay-lane', 'lane-mistake'],
  },
  {
    week: 3,
    theme: '地图资源（绿/橙/红区死亡分析）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'death-zone', 'safe-farm-first'],
  },
  {
    week: 4,
    theme: '地图资源（绿/橙/红区死亡分析）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'death-zone', 'safe-farm-first'],
  },
  {
    week: 5,
    theme: '兵线目标（中期30秒问题决策）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'wave-30s'],
  },
  {
    week: 6,
    theme: '兵线目标（中期30秒问题决策）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'wave-30s'],
  },
  {
    week: 7,
    theme: '英雄池专项',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'key-10min', 'hero-pool-note'],
  },
  {
    week: 8,
    theme: '冲分整合（排位纪律）',
    checklistItemIds: ['cs-10min', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'key-10min', 'tomorrow-goal'],
  },
]

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// ── IPC Handlers

ipcMain.handle('store:getAppState', () => store.get('appState'))
ipcMain.handle('store:setAppState', (_, partial: Partial<AppState>) => {
  const current = store.get('appState') as AppState
  store.set('appState', { ...current, ...partial })
})

ipcMain.handle('store:addMatchLog', (_, log: MatchLog) => {
  const logs = store.get('matchLogs', []) as MatchLog[]
  store.set('matchLogs', [...logs, log])
})
ipcMain.handle('store:getMatchLogs', () => store.get('matchLogs', []))
ipcMain.handle('store:updateMatchLog', (_, id: string, patch: Partial<MatchLog>) => {
  const logs = store.get('matchLogs', []) as MatchLog[]
  store.set('matchLogs', logs.map(l => l.id === id ? { ...l, ...patch } : l))
})

ipcMain.handle('store:addPreGameSetup', (_, s: PreGameSetup) => {
  const setups = store.get('preGameSetups', []) as PreGameSetup[]
  store.set('preGameSetups', [...setups, s])
})
ipcMain.handle('store:getPreGameSetups', () => store.get('preGameSetups', []))
ipcMain.handle('store:updatePreGameSetup', (_, id: string, patch: Partial<PreGameSetup>) => {
  const setups = store.get('preGameSetups', []) as PreGameSetup[]
  store.set('preGameSetups', setups.map(s => s.id === id ? { ...s, ...patch } : s))
})

function upsertDailyCheckin(c: DailyCheckin): DailyCheckin[] {
  const cs = store.get('dailyCheckins', []) as DailyCheckin[]
  const next = [
    ...cs.filter(item => item.date !== c.date),
    c,
  ].sort((a, b) => a.date.localeCompare(b.date))
  store.set('dailyCheckins', next)
  return next
}

ipcMain.handle('store:upsertDailyCheckin', (_, c: DailyCheckin) => {
  upsertDailyCheckin(c)
})
ipcMain.handle('store:addDailyCheckin', (_, c: DailyCheckin) => {
  upsertDailyCheckin(c)
})
ipcMain.handle('store:getDailyCheckins', () => store.get('dailyCheckins', []))

ipcMain.handle('store:addMMRLog', (_, l: MMRLog) => {
  const logs = store.get('mmrLogs', []) as MMRLog[]
  store.set('mmrLogs', [...logs, l])
})
ipcMain.handle('store:getMMRLogs', () => store.get('mmrLogs', []))

ipcMain.handle('store:getHeroNotes', () => store.get('heroNotes', []))
ipcMain.handle('store:upsertHeroNote', (_, note: HeroNote) => {
  const notes = store.get('heroNotes', []) as HeroNote[]
  const normalizedHero = note.hero.trim()
  if (!normalizedHero) {
    throw new Error('英雄档案缺少英雄名。')
  }
  const nextNote: HeroNote = {
    ...note,
    hero: normalizedHero,
    updatedAt: Date.now(),
  }
  store.set('heroNotes', [
    ...notes.filter(item => item.hero !== normalizedHero),
    nextNote,
  ].sort((a, b) => a.hero.localeCompare(b.hero, 'zh-CN')))
})

ipcMain.handle('store:addCycle', (_, c: TrainingCycle) => {
  const cs = store.get('cycles', []) as TrainingCycle[]
  store.set('cycles', [...cs, c])
})
ipcMain.handle('store:getCycles', () => store.get('cycles', []))

ipcMain.handle('opendota:importMatch', async (_, matchIdInput: string): Promise<OpenDotaImportedMatch> => {
  const matchId = normalizeMatchId(matchIdInput)
  return fetchOpenDotaImportedMatch(matchId, getOpenDotaAccountId())
})

ipcMain.handle('opendota:autoImportLatestMatch', async (_, existingMatchIds?: string[]): Promise<OpenDotaImportedMatch> => {
  return autoImportLatestOpenDotaMatch(Array.isArray(existingMatchIds) ? existingMatchIds : [])
})

ipcMain.handle('opendota:getRecentMatches', async (_, existingMatchIds?: string[]): Promise<OpenDotaRecentMatch[]> => {
  return listRecentOpenDotaMatches(Array.isArray(existingMatchIds) ? existingMatchIds : [])
})

ipcMain.handle('opendota:requestParse', async (_, matchIdInput: string): Promise<OpenDotaParseRequestResult> => {
  const matchId = normalizeMatchId(matchIdInput)
  return requestOpenDotaParse(matchId)
})

ipcMain.handle('opendota:analyzeAndImportMatch', async (_, matchIdInput: string): Promise<OpenDotaImportedMatch> => {
  const matchId = normalizeMatchId(matchIdInput)
  const accountId = getOpenDotaAccountId()

  await requestOpenDotaParse(matchId)

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 9; attempt++) {
    if (attempt > 0) await sleep(10_000)
    try {
      return await fetchOpenDotaImportedMatch(matchId, accountId, 20_000)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const message = lastError.message
      const probablyStillParsing = message.includes('解析') || message.includes('HTTP 500') || message.includes('HTTP 404') || message.includes('没有返回玩家明细')
      if (!probablyStillParsing) throw lastError
    }
  }

  throw new Error(lastError?.message ?? 'OpenDota 已收到解析请求，但 90 秒内还没有返回详细数据。请稍后再点“导入”。')
})

ipcMain.handle('opendota:getHeroMatchupCache', (): HeroMatchupCache | null => {
  return store.get('heroMatchupCache', null) as HeroMatchupCache | null
})

ipcMain.handle('opendota:syncHeroMatchups', async (_, force?: boolean): Promise<HeroMatchupSyncResult> => {
  const appState = store.get('appState') as AppState
  const stratzApiKey = appState.stratz?.apiKey?.trim()
  if (stratzApiKey) {
    return syncStratzHeroMatchups(stratzApiKey, appState.stratz?.rankBracket ?? 'ALL', Boolean(force))
  }
  return syncOpenDotaHeroMatchups(Boolean(force))
})

// 导出（触发系统"另存为"对话框 + 写文件）
ipcMain.handle('store:exportAll', async () => {
  const data = {
    appState:      store.get('appState'),
    cycles:        store.get('cycles'),
    matchLogs:     store.get('matchLogs'),
    preGameSetups: store.get('preGameSetups'),
    dailyCheckins: store.get('dailyCheckins'),
    mmrLogs:       store.get('mmrLogs'),
    heroNotes:     store.get('heroNotes'),
    heroMatchupCache: store.get('heroMatchupCache'),
    heroBenchmarkCache: store.get('heroBenchmarkCache'),
  }
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: `dota2-backup-${todayKey()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (canceled || !filePath) return { success: false }
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  return { success: true }
})

// 导入
ipcMain.handle('store:importAll', (_, json: string) => {
  const data = JSON.parse(json)
  for (const key of ['appState', 'cycles', 'matchLogs', 'preGameSetups', 'dailyCheckins', 'mmrLogs', 'heroNotes', 'heroMatchupCache', 'heroBenchmarkCache']) {
    if (data[key] !== undefined) store.set(key, data[key])
  }
})

app.whenReady().then(() => {
  // 冷启动：确保 activeCycleId 始终存在
  const appState = store.get('appState') as AppState
  if (!appState.activeCycleId) {
    const defaultCycle: TrainingCycle = {
      cycleId: 'default',
      startDate: todayKey(),
      weekThemes: DEFAULT_WEEK_THEMES,
    }
    store.set('cycles', [defaultCycle])
    store.set('appState', { ...appState, activeCycleId: 'default' })
  }

  // 全新安装 / 刚从 git pull 下来：本地没有缓存，或本地缓存不如 repo 快照完整时，用仓库快照兜底
  const existingMatchupCache = store.get('heroMatchupCache', null) as HeroMatchupCache | null
  const bundledMatchupCache = heroMatchupSnapshot as HeroMatchupCache
  const shouldSeedMatchupCache = Boolean(
    bundledMatchupCache.matchupCount > 0 && (
      !existingMatchupCache?.matchupCount ||
      (bundledMatchupCache.complete && !existingMatchupCache.complete) ||
      ((bundledMatchupCache.syncedAt ?? 0) > (existingMatchupCache.syncedAt ?? 0) && bundledMatchupCache.matchupCount >= existingMatchupCache.matchupCount)
    )
  )
  if (shouldSeedMatchupCache) {
    store.set('heroMatchupCache', bundledMatchupCache)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

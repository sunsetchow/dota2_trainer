import store from '../store.ts'
import opendotaHeroes from '../../src/data/opendotaHeroes.json'
import positionMetaJson from '../../src/data/positionMetaHeroes.json'
import type { AppState, DotaPosition, MatchLog, OpenDotaImportedMatch, OpenDotaParseRequestResult, OpenDotaRecentMatch, HeroBenchmarkCache, HeroMatchupCache, HeroMatchupStats, HeroMatchupSyncResult, HeroTimingCache, HeroTimingSyncResult, PositionMetaSnapshot, PositionMetaSyncResult, StratzRankBracket } from '../../src/types'
import {
  parseHeroBenchmarkCache,
  parseHeroBenchmarkCacheMap,
  parseHeroMatchupCache,
  parseHeroTimingCache,
  parsePositionMetaSnapshot,
} from '../../src/schema/persistence.ts'
import { createOpenDotaError, getOpenDotaErrorCode } from '../../src/utils/openDotaErrors.ts'
import { deriveHeroTimingProfile, sanitizeDurationBins, type DurationBin } from '../../src/utils/heroTiming.ts'
import { getHeroNameById } from '../../src/utils/heroIdentity.ts'

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
// 用 heroIdentity 里 canonical 化过的名字（兼容改过官方译名的英雄，比如 id 155 朗戈），
// 不要直接用 hero.displayName，否则这里同步出来的 matchup / timing / 位置热门数据
// 可能跟英雄池、Draft 用的名字对不上。
const openDotaHeroNameById = new Map<number, string>(
  OPEN_DOTA_HEROES.map(hero => [hero.id, getHeroNameById(hero.id) ?? (hero.displayName || hero.localizedName)])
)

function getOpenDotaApiKey(): string | undefined {
  const appState = store.get('appState') as AppState
  return appState.openDota?.apiKey?.trim() || undefined
}

function getOpenDotaUrl(path: string): URL {
  const url = new URL(`https://api.opendota.com/api${path}`)
  const apiKey = getOpenDotaApiKey()
  if (apiKey) url.searchParams.set('api_key', apiKey)
  return url
}

function normalizeOpenDotaHttpError(status: number, body: string): Error {
  const suffix = body.trim() ? `（${body.trim().slice(0, 180)}）` : ''
  if (status === 404) {
    return createOpenDotaError('MATCH_NOT_FOUND', `OpenDota 没有找到这场比赛，或比赛还没有解析。可以先请求解析，几分钟后重试。${suffix}`)
  }
  if (status === 429) {
    return createOpenDotaError('RATE_LIMITED', `OpenDota 请求过于频繁。稍后重试，或在设置页填写 API Key。${suffix}`)
  }
  if (status >= 500) {
    return createOpenDotaError('PARSE_PENDING', `OpenDota 暂时无法返回这场比赛详情，常见原因是比赛未解析或 OpenDota 后端临时错误。可以先请求解析，几分钟后重试。${suffix}`)
  }
  return createOpenDotaError('UNKNOWN', `OpenDota 请求失败：HTTP ${status}${suffix}`)
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

// Stratz 的 itemPurchases 只给数字 itemId，不像 OpenDota 那样给字符串 key；已用 OpenDota 公开、
// 免鉴权的 /constants/items 接口核对过，数字 item id 是 Valve 的通用编号，OpenDota/Stratz 通用
// （比如 137 号在两边都是辉耀，用真实对局数据核对过购买时间点对得上）。
const KEY_ITEM_LABELS_BY_ID: Record<number, string> = {
  1: '闪烁匕首',
  116: '黑皇杖',
  127: '刃甲',
  125: '先锋盾',
  242: '赤红甲',
  90: '洞察烟斗',
  226: '清莲宝珠',
  119: '希瓦的守护',
  112: '强袭胸甲',
  137: '辉耀',
  114: '恐鳌之心',
  110: '刷新球',
  96: '邪恶镰刀',
  98: '紫怨',
  250: '血棘',
  229: '炎阳纹章',
  210: '天堂之戟',
  151: '莫尔迪基安的臂章',
  164: '支配头盔',
  635: '统御头盔',
  939: '鱼叉',
  252: '回音战刃',
  168: '黯灭',
  147: '幻影斧',
  174: '净魂之刃',
  692: '永恒之盘',
  256: '永恒之盘',
  231: '卫士胫甲',
  79: '梅肯斯姆',
  131: '挑战头巾',
  598: '法师克星',
  273: '散慧对剑',
  154: '散夜对剑',
  108: '阿哈利姆神杖',
  609: '阿哈利姆魔晶',
}

function getFirstKeyItemFromStratzPurchases(purchases?: Array<{ time: number; itemId: number }>): { minute: number; name: string } | null {
  const match = [...(purchases ?? [])]
    .filter(item => item.time > 0 && KEY_ITEM_LABELS_BY_ID[item.itemId])
    .sort((a, b) => a.time - b.time)[0]

  if (!match) return null
  return {
    minute: Math.max(1, Math.ceil(match.time / 60)),
    name: KEY_ITEM_LABELS_BY_ID[match.itemId],
  }
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
  const cached = (parseHeroBenchmarkCacheMap(store.get('heroBenchmarkCache', {})) as Record<string, HeroBenchmarkCache>)[cacheKey]
  if (cached && isCacheFresh(cached.syncedAt, HERO_BENCHMARK_TTL_MS)) return cached

  const raw = await fetchOpenDotaJson<OpenDotaBenchmarkResponse>(`/benchmarks?hero_id=${heroId}`, 15_000)
  if (!isValidBenchmarkResponse(raw.result)) {
    if (cached) return cached // 响应异常（限速/格式变化）时优先沿用旧缓存，即使已过期
    throw new Error('OpenDota benchmarks 返回数据异常。')
  }

  const cache = parseHeroBenchmarkCache({
    source: 'opendota',
    syncedAt: Date.now(),
    heroId,
    benchmarks: raw.result,
  }) as HeroBenchmarkCache
  // 写回前重新读取最新缓存（而不是复用 await 之前的快照），避免并发导入不同英雄时
  // 后完成的请求用旧快照覆盖、丢掉另一个英雄刚写入的数据（TOCTOU）。
  const latest = parseHeroBenchmarkCacheMap(store.get('heroBenchmarkCache', {})) as Record<string, HeroBenchmarkCache>
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

function getEnemyHeroNames(match: OpenDotaMatchResponse, player: OpenDotaPlayer): string[] {
  const isRadiant = getIsRadiant(player)
  if (isRadiant === undefined) return []

  return (match.players ?? [])
    .filter(row => getIsRadiant(row) === !isRadiant)
    .map(row => row.hero_id ? openDotaHeroNameById.get(row.hero_id) : undefined)
    .filter((name): name is string => Boolean(name))
    .filter((name, index, array) => array.indexOf(name) === index)
}

function getEnemyHeroIds(match: OpenDotaMatchResponse, player: OpenDotaPlayer): number[] {
  const isRadiant = getIsRadiant(player)
  if (isRadiant === undefined) return []

  return (match.players ?? [])
    .filter(row => getIsRadiant(row) === !isRadiant)
    .map(row => row.hero_id)
    .filter((id): id is number => Number.isFinite(id) && id > 0)
    .filter((id, index, array) => array.indexOf(id) === index)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getOpenDotaAccountId(): string {
  const appState = store.get('appState') as AppState
  const accountId = appState.openDota?.accountId?.trim()
  if (!accountId || !/^\d+$/.test(accountId)) {
    throw createOpenDotaError('ACCOUNT_REQUIRED', '请先在设置页填写 OpenDota Account ID。')
  }
  return accountId
}

function normalizeMatchId(matchIdInput: string): string {
  const matchId = String(matchIdInput ?? '').trim()
  if (!/^\d+$/.test(matchId)) {
    throw createOpenDotaError('INVALID_MATCH_ID', '请输入有效的 Match ID。')
  }
  return matchId
}

function getPersistedMatchIds(): string[] {
  const logs = store.get('matchLogs', [])
  if (!Array.isArray(logs)) return []

  return (logs as Partial<MatchLog>[])
    .map(log => log.matchId)
    .filter((matchId): matchId is string => typeof matchId === 'string' && matchId.trim().length > 0)
    .map(matchId => matchId.trim())
}

function getKnownMatchIdSet(existingMatchIds: string[] = []): Set<string> {
  return new Set([
    ...existingMatchIds.map(String),
    ...getPersistedMatchIds(),
  ]
    .map(matchId => matchId.trim())
    .filter(matchId => matchId.length > 0))
}

function buildImportedMatch(matchId: string, match: OpenDotaMatchResponse, player: OpenDotaPlayer): OpenDotaImportedMatch {
  if (!player.hero_id) {
    throw createOpenDotaError('PARSE_PENDING', 'OpenDota 返回的数据缺少英雄信息。')
  }

  const firstKeyItem = getFirstKeyItem(player.purchase_log)
  const laneEfficiency = getLaneEfficiency(player)
  const durationMin = Math.max(1, Math.round((match.duration ?? 0) / 60))
  const phaseDurationMin = Math.max(1, Math.min(Math.floor((match.duration ?? 0) / 60), (player.gold_t?.length ?? 1) - 1))
  const phaseGpm = computePhaseGpm(player.gold_t, phaseDurationMin)
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
    isRadiant: getIsRadiant(player),
    enemyHeroes: getEnemyHeroNames(match, player),
    enemyHeroIds: getEnemyHeroIds(match, player),
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
      throw normalizeOpenDotaHttpError(response.status, body)
    }

    const match = await response.json() as OpenDotaMatchResponse
    if (!match.players?.length) {
      throw createOpenDotaError('PARSE_PENDING', 'OpenDota 没有返回玩家明细。这场比赛可能还没有解析，可以先请求解析，几分钟后重试。')
    }
    const player = match.players.find(p => String(p.account_id) === accountId)
    if (!player) {
      throw createOpenDotaError('ACCOUNT_MISMATCH', '这场比赛里没有找到设置中的 Account ID。')
    }

    const imported = buildImportedMatch(matchId, match, player)
    return await enrichImportedMatchWithBenchmarks(imported, player)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createOpenDotaError('TIMEOUT', 'OpenDota 请求超时，请稍后重试。')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

// 发现"最近有哪些新比赛"始终走 OpenDota 的 recentMatches（不需要额外接一个 Stratz 版本）；
// 只有"拉某一场比赛详情"这一步在配置了 Stratz Key 时优先走 Stratz，跟 matchup/timing/位置
// 热门那几个同步功能的"有 Key 优先 Stratz"规则保持一致。
async function autoImportLatestOpenDotaMatch(existingMatchIds: string[] = [], stratzApiKey?: string): Promise<OpenDotaImportedMatch> {
  const accountId = getOpenDotaAccountId()
  const known = getKnownMatchIdSet(existingMatchIds)
  const recent = await fetchOpenDotaJson<OpenDotaRecentMatchResponseItem[]>(`/players/${accountId}/recentMatches`, 15_000)
  const candidates = recent
    .map(row => row.match_id)
    .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
    .map(String)
    .filter(matchId => !known.has(matchId))

  if (candidates.length === 0) {
    throw new Error('OpenDota 最近对局里没有找到未记录的新比赛。')
  }

  // 赛后数据只要 Stratz——配置了 Key 就只走 Stratz，不退回 OpenDota。这里的 OpenDota
  // recentMatches 调用只是用来发现"最近有哪些新比赛 ID"，跟实际抓取哪个数据源无关。
  let lastError: Error | null = null
  for (const matchId of candidates.slice(0, 5)) {
    try {
      if (stratzApiKey) {
        return await fetchStratzImportedMatch(matchId, accountId, stratzApiKey)
      }
      return await fetchOpenDotaImportedMatch(matchId, accountId, 20_000)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw new Error(lastError?.message ?? '最近几场比赛暂时无法导入，可能还没有解析。')
}

async function listRecentOpenDotaMatches(existingMatchIds: string[] = []): Promise<OpenDotaRecentMatch[]> {
  const accountId = getOpenDotaAccountId()
  const known = getKnownMatchIdSet(existingMatchIds)
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
      throw normalizeOpenDotaHttpError(response.status, body)
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
      throw createOpenDotaError('TIMEOUT', 'OpenDota 解析请求超时，请稍后重试。')
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
      throw normalizeOpenDotaHttpError(response.status, body)
    }
    return await response.json() as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createOpenDotaError('TIMEOUT', 'OpenDota 请求超时，请稍后重试。')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export function todayKey(): string {
  return dateKeyFromDate(new Date())
}

function dateKeyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const HERO_MATCHUP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const HERO_TIMING_CACHE_TTL_MS = HERO_MATCHUP_CACHE_TTL_MS
const HERO_TIMING_PUBLIC_CONCURRENCY = 1
const HERO_TIMING_PUBLIC_DELAY_MS = 1100
const HERO_TIMING_API_KEY_CONCURRENCY = 3
const HERO_TIMING_API_KEY_DELAY_MS = 350
let syncHeroTimingsInFlight: Promise<HeroTimingSyncResult> | undefined
let heroTimingSyncProgress: { completed: number; total: number } | null = null

function getHeroTimingSyncProgress(): { completed: number; total: number } | null {
  return heroTimingSyncProgress
}

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

async function runLimited<T>(
  items: T[],
  limit: number,
  delayOrTask: number | ((item: T) => Promise<void>),
  maybeTask?: (item: T) => Promise<void>,
): Promise<void> {
  const delayMs = typeof delayOrTask === 'number' ? delayOrTask : 1100
  const task = typeof delayOrTask === 'number' ? maybeTask : delayOrTask
  if (!task) throw new Error('runLimited task is required')
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]
      index += 1
      await task(item)
      if (index < items.length) await sleep(delayMs)
    }
  })
  await Promise.all(workers)
}

async function syncHeroTimings(force = false): Promise<HeroTimingSyncResult> {
  if (syncHeroTimingsInFlight) return syncHeroTimingsInFlight
  syncHeroTimingsInFlight = syncHeroTimingsInner(force).finally(() => {
    syncHeroTimingsInFlight = undefined
  })
  return syncHeroTimingsInFlight
}

async function syncHeroTimingsInner(force: boolean): Promise<HeroTimingSyncResult> {
  const currentRaw = store.get('heroTimingCache', null)
  const current = currentRaw ? parseHeroTimingCache(currentRaw) as HeroTimingCache : null
  const now = Date.now()
  if (!force && current?.heroCount && now - current.syncedAt < HERO_TIMING_CACHE_TTL_MS) {
    return { cached: true, heroCount: current.heroCount, errors: [] }
  }

  const profiles: HeroTimingCache['profiles'] = {}
  const errors: string[] = []
  const hasApiKey = Boolean(getOpenDotaApiKey())
  const concurrency = hasApiKey ? HERO_TIMING_API_KEY_CONCURRENCY : HERO_TIMING_PUBLIC_CONCURRENCY
  const delayMs = hasApiKey ? HERO_TIMING_API_KEY_DELAY_MS : HERO_TIMING_PUBLIC_DELAY_MS

  heroTimingSyncProgress = { completed: 0, total: OPEN_DOTA_HEROES.length }
  try {
    const RATE_LIMIT_RETRY_DELAYS_MS = [5_000, 15_000]

    await runLimited(OPEN_DOTA_HEROES, concurrency, delayMs, async hero => {
      try {
        let rawBins: unknown
        let attempt = 0
        while (true) {
          try {
            rawBins = await fetchOpenDotaJson<unknown>(`/heroes/${hero.id}/durations`, 20_000)
            break
          } catch (error) {
            const isRateLimited = getOpenDotaErrorCode(error) === 'RATE_LIMITED'
            if (!isRateLimited || attempt >= RATE_LIMIT_RETRY_DELAYS_MS.length) throw error
            await sleep(RATE_LIMIT_RETRY_DELAYS_MS[attempt])
            attempt += 1
          }
        }
        const heroName = openDotaHeroNameById.get(hero.id) ?? hero.displayName ?? hero.localizedName
        const bins = sanitizeDurationBins(rawBins)
        if (bins.length === 0) {
          errors.push(`${heroName}: durations 返回空数据`)
          return
        }
        const profile = deriveHeroTimingProfile({
          id: hero.id,
          displayName: heroName,
          localizedName: hero.localizedName,
        }, bins)
        profiles[String(hero.id)] = profile
      } catch (error) {
        const heroName = openDotaHeroNameById.get(hero.id) ?? hero.displayName ?? hero.localizedName
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`${heroName}: ${message}`)
      } finally {
        if (heroTimingSyncProgress) heroTimingSyncProgress = { ...heroTimingSyncProgress, completed: heroTimingSyncProgress.completed + 1 }
      }
    })
  } finally {
    heroTimingSyncProgress = null
  }

  if (Object.keys(profiles).length === 0) {
    if (current) return { cached: false, heroCount: current.heroCount, errors }
    throw new Error('OpenDota hero timing 数据同步失败，且本地没有可用缓存。')
  }

  const syncedAt = Date.now()
  const cache = parseHeroTimingCache({
    source: 'opendota',
    syncedAt,
    date: todayKey(),
    version: 1,
    heroCount: Object.keys(profiles).length,
    profiles,
    ...(errors.length > 0 && { errors: errors.slice(0, 12) }),
  }) as HeroTimingCache
  store.set('heroTimingCache', cache)
  return { cached: false, heroCount: cache.heroCount, errors }
}

async function syncOpenDotaHeroMatchups(force = false): Promise<HeroMatchupSyncResult> {
  const currentRaw = store.get('heroMatchupCache', null)
  const current = currentRaw ? parseHeroMatchupCache(currentRaw) as HeroMatchupCache : null
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
  const cache = parseHeroMatchupCache({
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
  }) as HeroMatchupCache
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
  // synergy 是 Stratz 自己算好的"克制"百分比，已用官网真实页面逐行核对过（不是简单
  // winRate-50%，而是先扣掉两个英雄各自整体胜率的差异，只留下真正的对线相性效应）。
  synergy: number;
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
          vs { heroId2 winsAverage matchCount synergy }
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

interface StratzMatchPlayer {
  steamAccountId?: number
  heroId?: number
  isRadiant?: boolean
  isVictory?: boolean
  kills?: number
  deaths?: number
  assists?: number
  numLastHits?: number
  numDenies?: number
  goldPerMinute?: number
  experiencePerMinute?: number
  level?: number
  heroDamage?: number
  heroHealing?: number
  towerDamage?: number
  lane?: 'ROAMING' | 'SAFE_LANE' | 'MID_LANE' | 'OFF_LANE' | 'JUNGLE' | 'UNKNOWN'
  position?: string
  stats?: {
    lastHitsPerMinute?: number[]
    deniesPerMinute?: number[]
    goldPerMinute?: number[]
    itemPurchases?: Array<{ time: number; itemId: number }>
    deathEvents?: Array<{ time: number; positionX: number; positionY: number }>
  }
}

interface StratzMatchData {
  match?: {
    id: number
    durationSeconds?: number
    startDateTime?: number
    isStats?: boolean
    bottomLaneOutcome?: 'TIE' | 'RADIANT_VICTORY' | 'RADIANT_STOMP' | 'DIRE_VICTORY' | 'DIRE_STOMP'
    midLaneOutcome?: 'TIE' | 'RADIANT_VICTORY' | 'RADIANT_STOMP' | 'DIRE_VICTORY' | 'DIRE_STOMP'
    topLaneOutcome?: 'TIE' | 'RADIANT_VICTORY' | 'RADIANT_STOMP' | 'DIRE_VICTORY' | 'DIRE_STOMP'
    actualRank?: number
    // winRates 是天辉视角的逐时间点胜率数组，Stratz 没有公开文档说明采样间隔——只能把
    // 数组下标当"大致第几分钟"来近似换算，换算成己方视角（夜魇要用 1 - 值）。
    // ⚠️ predictedWinRates 曾经也用过，但实测发现它经常跟 winRates/实际胜负方向对不上
    // （比如一场天辉后来赢了的比赛，predictedWinRates 却从 0.98 一路跌到 0.37），语义
    // 不可靠，已经不再使用，只留 winRates 这一个可信来源。
    winRates?: number[]
    players?: StratzMatchPlayer[]
  }
}

const STRATZ_MATCH_QUERY = `
  query ($id: Long!) {
    match(id: $id) {
      id
      durationSeconds
      startDateTime
      isStats
      bottomLaneOutcome
      midLaneOutcome
      topLaneOutcome
      actualRank
      winRates
      players {
        steamAccountId
        heroId
        isRadiant
        isVictory
        kills
        deaths
        assists
        numLastHits
        numDenies
        goldPerMinute
        experiencePerMinute
        level
        heroDamage
        heroHealing
        towerDamage
        lane
        position
        stats {
          lastHitsPerMinute
          deniesPerMinute
          goldPerMinute
          itemPurchases { time itemId }
          deathEvents { time positionX positionY }
        }
      }
    }
  }
`

// Stratz 的逐分钟数组是"这一分钟里发生了多少"（离散分桶），跟 OpenDota lh_t/dn_t/gold_t
// 那种"到这一分钟为止的累计值"完全不同口径——已用真实对局数据核对过：把 lastHitsPerMinute
// 前 10 项加起来算出的 csAt10，跟同一场比赛 OpenDota 独立算出的 csAt10 完全一致。
function sumStratzMinutes(values: number[] | undefined, endMinuteExclusive: number): number | undefined {
  if (!values?.length) return undefined
  const end = Math.min(endMinuteExclusive, values.length)
  let total = 0
  for (let i = 0; i < end; i += 1) total += values[i] ?? 0
  return total
}

function computeStratzPhaseGpm(goldPerMinute: number[] | undefined, durationMin: number): { laningGpm?: number; midGpm?: number; lateGpm?: number } {
  if (!goldPerMinute?.length) return {}
  const laningEnd = Math.min(10, durationMin)
  const midEnd = Math.min(25, durationMin)
  const laningSum = sumStratzMinutes(goldPerMinute, laningEnd)
  const midSum = midEnd > laningEnd ? sumStratzMinutes(goldPerMinute, midEnd) : undefined
  const lateSum = durationMin > midEnd ? sumStratzMinutes(goldPerMinute, durationMin) : undefined
  return {
    laningGpm: laningEnd > 0 && laningSum !== undefined ? laningSum / laningEnd : undefined,
    midGpm: midEnd > laningEnd && midSum !== undefined && laningSum !== undefined ? (midSum - laningSum) / (midEnd - laningEnd) : undefined,
    lateGpm: durationMin > midEnd && lateSum !== undefined && midSum !== undefined ? (lateSum - midSum) / (durationMin - midEnd) : undefined,
  }
}

// Stratz 直接给三路对线结果（TIE/RADIANT_VICTORY/RADIANT_STOMP/DIRE_VICTORY/DIRE_STOMP），
// 不需要像 OpenDota 那样靠 lane_efficiency 差值猜——用玩家的 lane（角色：安全/中路/劣势）
// 加上边路（天辉/夜魇）换算出该看哪一路的结果，再按己方/对方视角映射成 dominated/even/lost。
// STOMP 和 VICTORY 都映射成 dominated/lost，但额外带一个 stomp 标记区分"大胜/大败"还是
// "小胜/小败"，只在 result 是 dominated/lost 时才有意义（even 时恒为 undefined）。
function mapStratzLaneResult(player: StratzMatchPlayer, match: NonNullable<StratzMatchData['match']>): { result: 'dominated' | 'even' | 'lost'; stomp?: boolean } | undefined {
  if (player.isRadiant === undefined || !player.lane) return undefined

  let outcome: typeof match.bottomLaneOutcome
  if (player.lane === 'MID_LANE') {
    outcome = match.midLaneOutcome
  } else if (player.lane === 'SAFE_LANE') {
    outcome = player.isRadiant ? match.bottomLaneOutcome : match.topLaneOutcome
  } else if (player.lane === 'OFF_LANE') {
    outcome = player.isRadiant ? match.topLaneOutcome : match.bottomLaneOutcome
  } else {
    return undefined
  }
  if (!outcome) return undefined

  if (outcome === 'TIE') return { result: 'even' }
  const wonByRadiant = outcome === 'RADIANT_VICTORY' || outcome === 'RADIANT_STOMP'
  const isStomp = outcome === 'RADIANT_STOMP' || outcome === 'DIRE_STOMP'
  return { result: wonByRadiant === player.isRadiant ? 'dominated' : 'lost', stomp: isStomp }
}

// winRates 是天辉视角，换算成己方视角（夜魇要用 1 - 值）；数组下标按比例换算成"大致第几分钟"
// （Stratz 没有公开采样间隔文档，只能近似）。挑变化幅度最大的几个相邻点，作为"势头明显
// 转变"的参考，不是精确时间点。
function findWinRateSwings(winRates: number[] | undefined, durationMin: number, isRadiant: boolean | undefined, topN = 2): Array<{ approxMinute: number; delta: number; ownWinRate: number }> {
  if (!winRates || winRates.length < 2 || isRadiant === undefined) return []
  const ownRates = winRates.map(rate => isRadiant ? rate : 1 - rate)
  const swings = ownRates.slice(1).map((rate, i) => ({
    approxMinute: Math.round(((i + 1) / (ownRates.length - 1)) * durationMin),
    delta: rate - ownRates[i],
    ownWinRate: rate,
  }))
  return swings
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, topN)
    .sort((a, b) => a.approxMinute - b.approxMinute)
}

async function fetchStratzImportedMatch(matchId: string, accountId: string, apiKey: string): Promise<OpenDotaImportedMatch> {
  const data = await fetchStratzGraphQL<StratzMatchData>(apiKey, STRATZ_MATCH_QUERY, { id: Number(matchId) })
  const match = data.match
  if (!match) {
    throw createOpenDotaError('MATCH_NOT_FOUND', 'Stratz 没有找到这场比赛，或比赛还没有解析。可以先请求解析，几分钟后重试。')
  }
  // ⚠️ isStats 曾被当作"这场比赛数据是否就绪"的判断依据，但实测发现一场 isStats:false 的
  // 比赛里 players/lane 结果/逐分钟数据/道具购买记录全都是完整的——isStats 不代表这次查询
  // 需要的字段是否齐全，真正该判断的是 players 数组和下面这名玩家的 heroId 是否存在。
  if (!match.players?.length) {
    throw createOpenDotaError('PARSE_PENDING', 'Stratz 还没有这场比赛的详细数据，可以先请求解析，几分钟后重试。')
  }
  const player = match.players.find(p => String(p.steamAccountId) === accountId)
  if (!player) {
    throw createOpenDotaError('ACCOUNT_MISMATCH', '这场比赛里没有找到设置中的 Account ID。')
  }
  if (!player.heroId) {
    throw createOpenDotaError('PARSE_PENDING', 'Stratz 返回的数据缺少英雄信息。')
  }

  const durationSeconds = match.durationSeconds ?? 0
  const durationMin = Math.max(1, Math.round(durationSeconds / 60))
  const firstKeyItem = getFirstKeyItemFromStratzPurchases(player.stats?.itemPurchases)
  const isRadiant = player.isRadiant
  const enemyPlayers = (match.players ?? []).filter(p => p.isRadiant === (isRadiant === undefined ? undefined : !isRadiant))
  const enemyHeroIds = enemyPlayers
    .map(p => p.heroId)
    .filter((id): id is number => Number.isFinite(id) && Boolean(id))
    .filter((id, index, array) => array.indexOf(id) === index)
  const enemyHeroes = enemyHeroIds
    .map(id => openDotaHeroNameById.get(id))
    .filter((name): name is string => Boolean(name))

  const laneOutcome = mapStratzLaneResult(player, match)
  const imported: OpenDotaImportedMatch = {
    matchId,
    timestamp: match.startDateTime ? match.startDateTime * 1000 : Date.now(),
    durationMin,
    result: player.isVictory ? 'win' : 'loss',
    heroId: player.heroId,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    lastHits: player.numLastHits,
    denies: player.numDenies,
    csAt10: sumStratzMinutes(player.stats?.lastHitsPerMinute, 10),
    dnAt10: sumStratzMinutes(player.stats?.deniesPerMinute, 10),
    firstKeyItemMin: firstKeyItem?.minute,
    firstKeyItemName: firstKeyItem?.name,
    gpm: player.goldPerMinute,
    xpm: player.experiencePerMinute,
    level: player.level,
    laneResult: laneOutcome?.result,
    laneStomp: laneOutcome?.stomp,
    isRadiant: player.isRadiant,
    enemyHeroes,
    enemyHeroIds,
    source: 'stratz',
    heroHealing: player.heroHealing,
    towerDamage: player.towerDamage,
    actualRank: match.actualRank,
    openingWinRate: match.winRates?.length
      ? Math.round((isRadiant === false ? 1 - match.winRates[0] : match.winRates[0]) * 100)
      : undefined,
    winRateSwings: findWinRateSwings(match.winRates, durationMin, isRadiant).map(swing => ({
      ...swing,
      ownWinRate: Math.round(swing.ownWinRate * 100),
      delta: Math.round(swing.delta * 100),
    })),
    deathPositions: player.stats?.deathEvents?.map(d => ({ time: d.time, x: d.positionX, y: d.positionY })),
    ...computeStratzPhaseGpm(player.stats?.goldPerMinute, durationMin),
  }
  return await enrichImportedMatchWithBenchmarks(imported, { gold_per_min: player.goldPerMinute, xp_per_min: player.experiencePerMinute, last_hits: player.numLastHits, hero_damage: player.heroDamage } as OpenDotaPlayer)
}

// Stratz 有自己独立的比赛下载/解析流水线，不依赖 OpenDota 的 /request 接口——已用 Stratz
// GraphQL schema introspection 核实过存在 retryMatchDownload(matchId) 这个 mutation
// （返回 Boolean，没有官方文档描述，但字段名和参数明确对应"重新触发这场比赛的下载"）。
const STRATZ_RETRY_DOWNLOAD_MUTATION = `
  mutation ($id: Long!) {
    retryMatchDownload(matchId: $id)
  }
`

async function requestStratzMatchDownload(matchId: string, apiKey: string): Promise<OpenDotaParseRequestResult> {
  const data = await fetchStratzGraphQL<{ retryMatchDownload?: boolean }>(apiKey, STRATZ_RETRY_DOWNLOAD_MUTATION, { id: Number(matchId) })
  return {
    matchId,
    message: data.retryMatchDownload
      ? '已通过 Stratz 提交解析请求。请等待几分钟后重新导入。'
      : 'Stratz 解析请求未被接受，这场比赛可能已经解析过，或暂时无法处理。',
  }
}

async function syncStratzHeroMatchups(apiKey: string, rankBracket: StratzRankBracket, force = false): Promise<HeroMatchupSyncResult> {
  const currentRaw = store.get('heroMatchupCache', null)
  const current = currentRaw ? parseHeroMatchupCache(currentRaw) as HeroMatchupCache : null
  const date = todayKey()
  const weekKey = getIsoWeekKey()
  const now = Date.now()
  const currentExpiresAt = current?.expiresAt ?? (current?.syncedAt ? current.syncedAt + HERO_MATCHUP_CACHE_TTL_MS : 0)
  const currentMatchesSource = current?.source === 'stratz' && current.rankBracket === rankBracket
  const isFresh = Boolean(currentMatchesSource && current?.matchupCount && currentExpiresAt > now)

  if (!force && current?.matchupCount && currentMatchesSource) {
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
          advantage: row.synergy,
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
  const cache = parseHeroMatchupCache({
    source: 'stratz',
    version: 1,
    syncedAt,
    date,
    weekKey,
    expiresAt: syncedAt + HERO_MATCHUP_CACHE_TTL_MS,
    complete: errors.length === 0 && Object.keys(matchups).length === OPEN_DOTA_HEROES.length,
    heroCount: Object.keys(matchups).length,
    matchupCount,
    rankBracket,
    matchups,
    ...(errors.length > 0 && { errors: errors.slice(0, 12) }),
  }) as HeroMatchupCache
  store.set('heroMatchupCache', cache)

  return {
    status: errors.length > 0 ? 'partial' : 'synced',
    message: errors.length > 0
      ? `已部分同步本周 matchup 矩阵（${cache.heroCount}/${OPEN_DOTA_HEROES.length} 个英雄，数据源 Stratz · ${rankBracket}）。`
      : `已同步本周 matchup 矩阵（${cache.weekKey}，${cache.heroCount} 个英雄，${cache.matchupCount} 条对位，数据源 Stratz · ${rankBracket}）。`,
    cache,
  }
}

interface StratzHeroTimeStatRow {
  heroId: number
  time: number
  matchCount: number
  winCount: number
}

interface StratzHeroTimingStatsData {
  heroStats?: {
    stats?: StratzHeroTimeStatRow[]
  }
}

// stats(groupByTime) 返回的是"对局时长 ≥ time 分钟"的累计生存计数（已用真实 API 核对：
// 相邻分钟做差可以精确还原回总局数/总胜场，见项目调研记录），不是离散分桶计数，
// 所以必须先对相邻分钟做差分，才能重用 OpenDota /durations 那套按秒分桶的 calcSegment 逻辑。
const STRATZ_HERO_TIMING_MAX_MINUTE = 75

const HERO_TIMING_STATS_QUERY = `
  query HeroTimingStats($heroIds: [Short], $bracketBasicIds: [RankBracketBasicEnum]) {
    heroStats {
      stats(heroIds: $heroIds, bracketBasicIds: $bracketBasicIds, groupByTime: true, minTime: 0, maxTime: ${STRATZ_HERO_TIMING_MAX_MINUTE}) {
        heroId
        time
        matchCount
        winCount
      }
    }
  }
`

function diffHeroTimingBinsFromStratzStats(rows: StratzHeroTimeStatRow[]): DurationBin[] {
  const sorted = [...rows].sort((a, b) => a.time - b.time)
  return sorted.map((row, index) => {
    const next = sorted[index + 1]
    const games = next ? Math.max(0, row.matchCount - next.matchCount) : row.matchCount
    const wins = next ? Math.max(0, row.winCount - next.winCount) : row.winCount
    return { duration_bin: row.time * 60, games_played: games, wins }
  })
}

async function syncStratzHeroTimings(apiKey: string, rankBracket: StratzRankBracket, force = false): Promise<HeroTimingSyncResult> {
  const currentRaw = store.get('heroTimingCache', null)
  const current = currentRaw ? parseHeroTimingCache(currentRaw) as HeroTimingCache : null
  const now = Date.now()
  if (!force && current?.heroCount && current.source === 'stratz' && now - current.syncedAt < HERO_TIMING_CACHE_TTL_MS) {
    return { cached: true, heroCount: current.heroCount, errors: [] }
  }

  const bracketArg = rankBracket === 'ALL' ? STRATZ_ALL_BRACKETS : [rankBracket]
  const heroIds = OPEN_DOTA_HEROES.map(hero => hero.id)

  const result = await fetchStratzGraphQL<StratzHeroTimingStatsData>(
    apiKey,
    HERO_TIMING_STATS_QUERY,
    { heroIds, bracketBasicIds: bracketArg },
  )
  const rowsByHero = new Map<number, StratzHeroTimeStatRow[]>()
  for (const row of result.heroStats?.stats ?? []) {
    const existing = rowsByHero.get(row.heroId)
    if (existing) existing.push(row)
    else rowsByHero.set(row.heroId, [row])
  }

  const profiles: HeroTimingCache['profiles'] = {}
  const errors: string[] = []
  for (const hero of OPEN_DOTA_HEROES) {
    const heroName = openDotaHeroNameById.get(hero.id) ?? hero.displayName ?? hero.localizedName
    const heroRows = rowsByHero.get(hero.id)
    if (!heroRows || heroRows.length === 0) {
      errors.push(`${heroName}: Stratz 未返回该英雄的 timing 数据`)
      continue
    }
    const bins = diffHeroTimingBinsFromStratzStats(heroRows)
    profiles[String(hero.id)] = deriveHeroTimingProfile({
      id: hero.id,
      displayName: heroName,
      localizedName: hero.localizedName,
    }, bins)
  }

  if (Object.keys(profiles).length === 0) {
    if (current) return { cached: false, heroCount: current.heroCount, errors }
    throw new Error('Stratz hero timing 数据同步失败，且本地没有可用缓存。')
  }

  const syncedAt = Date.now()
  const cache = parseHeroTimingCache({
    source: 'stratz',
    syncedAt,
    date: todayKey(),
    version: 1,
    heroCount: Object.keys(profiles).length,
    profiles,
    ...(errors.length > 0 && { errors: errors.slice(0, 12) }),
  }) as HeroTimingCache
  store.set('heroTimingCache', cache)
  return { cached: false, heroCount: cache.heroCount, errors }
}

const POSITION_META_TOP_N = 12
const POSITION_META_CACHE_TTL_MS = HERO_MATCHUP_CACHE_TTL_MS

interface StratzHeroPositionStatRow {
  heroId: number
  position: string
  matchCount: number
  winCount: number
}

interface StratzHeroPositionStatsData {
  heroStats?: {
    stats?: StratzHeroPositionStatRow[]
  }
}

const HERO_POSITION_STATS_QUERY = `
  query HeroPositionStats($heroIds: [Short], $bracketBasicIds: [RankBracketBasicEnum]) {
    heroStats {
      stats(heroIds: $heroIds, bracketBasicIds: $bracketBasicIds, groupByPosition: true) {
        heroId
        position
        matchCount
        winCount
      }
    }
  }
`

// Stratz 的 position 枚举是 POSITION_1..POSITION_5；DotaPosition 是 '1'..'5'。
function dotaPositionFromStratzPosition(position: string): DotaPosition | undefined {
  const match = position.match(/^POSITION_([1-5])$/)
  return match ? (match[1] as DotaPosition) : undefined
}

async function syncStratzPositionMeta(apiKey: string, rankBracket: StratzRankBracket, force = false): Promise<PositionMetaSyncResult> {
  const currentRaw = store.get('positionMetaCache', null)
  const current = currentRaw ? parsePositionMetaSnapshot(currentRaw) as PositionMetaSnapshot : null
  const weekKey = getIsoWeekKey()
  const now = Date.now()
  const currentMatchesSource = current?.source === 'stratz' && current.rankBracket === rankBracket
  const isFresh = Boolean(currentMatchesSource && now - current.syncedAt < POSITION_META_CACHE_TTL_MS)

  if (!force && currentMatchesSource && current) {
    return {
      status: isFresh ? 'fresh' : 'stale',
      message: isFresh
        ? `位置热门英雄缓存仍有效（${weekKey}，数据源 Stratz · ${rankBracket}）。`
        : '位置热门英雄缓存已过期，继续使用上次缓存。建议在设置页手动同步。',
      cache: current,
    }
  }

  const bracketArg = rankBracket === 'ALL' ? STRATZ_ALL_BRACKETS : [rankBracket]
  const heroIds = OPEN_DOTA_HEROES.map(hero => hero.id)

  const result = await fetchStratzGraphQL<StratzHeroPositionStatsData>(
    apiKey,
    HERO_POSITION_STATS_QUERY,
    { heroIds, bracketBasicIds: bracketArg },
  )

  const rowsByPosition = new Map<DotaPosition, Array<{ heroId: number; matchCount: number; winCount: number }>>()
  for (const row of result.heroStats?.stats ?? []) {
    const position = dotaPositionFromStratzPosition(row.position)
    if (!position) continue
    const list = rowsByPosition.get(position) ?? []
    list.push({ heroId: row.heroId, matchCount: row.matchCount, winCount: row.winCount })
    rowsByPosition.set(position, list)
  }

  const errors: string[] = []
  const positions = (['1', '2', '3', '4', '5'] as const).reduce((acc, position) => {
    const rows = (rowsByPosition.get(position) ?? []).filter(row => row.matchCount > 0)
    if (rows.length === 0) {
      errors.push(`${position}号位：Stratz 未返回数据`)
      acc[position] = []
      return acc
    }
    const totalMatchCount = rows.reduce((sum, row) => sum + row.matchCount, 0)
    const sorted = [...rows].sort((a, b) => b.matchCount - a.matchCount).slice(0, POSITION_META_TOP_N)
    const topMatchCount = sorted[0].matchCount
    acc[position] = sorted.map(row => ({
      hero: openDotaHeroNameById.get(row.heroId) ?? String(row.heroId),
      weight: Number((row.matchCount / topMatchCount).toFixed(4)),
      pickRate: Number((row.matchCount / totalMatchCount).toFixed(4)),
      matchCount: row.matchCount,
    }))
    return acc
  }, {} as PositionMetaSnapshot['positions'])

  const totalHeroesReturned = Object.values(positions).reduce((sum, list) => sum + list.length, 0)
  if (totalHeroesReturned === 0) {
    if (current) {
      return {
        status: 'stale',
        message: `Stratz 同步失败，继续使用上一次缓存（${current.weekKey}）。`,
        cache: current,
      }
    }
    throw new Error('Stratz 位置热门英雄同步失败，且本地没有可用缓存。')
  }

  const syncedAt = Date.now()
  const cache = parsePositionMetaSnapshot({
    source: 'stratz',
    rankBracket,
    weekKey,
    syncedAt,
    topN: POSITION_META_TOP_N,
    positions,
    ...(errors.length > 0 && { errors }),
  }) as PositionMetaSnapshot
  store.set('positionMetaCache', cache)

  return {
    status: errors.length > 0 ? 'partial' : 'synced',
    message: errors.length > 0
      ? `已部分同步位置热门英雄（${weekKey}，数据源 Stratz · ${rankBracket}）。`
      : `已同步位置热门英雄（${weekKey}，数据源 Stratz · ${rankBracket}）。`,
    cache,
  }
}

function getPositionMetaCache(): PositionMetaSnapshot {
  const raw = store.get('positionMetaCache', null)
  if (raw) return parsePositionMetaSnapshot(raw) as PositionMetaSnapshot
  return positionMetaJson as PositionMetaSnapshot
}

export function createDotaDataServices() {
  return {
    normalizeMatchId,
    getOpenDotaAccountId,
    fetchOpenDotaImportedMatch,
    fetchStratzImportedMatch,
    autoImportLatestOpenDotaMatch,
    listRecentOpenDotaMatches,
    requestOpenDotaParse,
    requestStratzMatchDownload,
    syncHeroTimings,
    syncStratzHeroTimings,
    getHeroTimingSyncProgress,
    syncOpenDotaHeroMatchups,
    syncStratzHeroMatchups,
    syncStratzPositionMeta,
    getPositionMetaCache,
    sleep,
  }
}

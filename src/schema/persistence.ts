import { z } from 'zod'

export const CURRENT_SCHEMA_VERSION = 3

const DotaPositionSchema = z.enum(['1', '2', '3', '4', '5'])
const EnemyByPositionSchema = z.object({
  '1': z.string().optional(),
  '2': z.string().optional(),
  '3': z.string().optional(),
  '4': z.string().optional(),
  '5': z.string().optional(),
}).strict()
const EnemyHeroIdByPositionSchema = z.object({
  '1': z.number().int().positive().optional(),
  '2': z.number().int().positive().optional(),
  '3': z.number().int().positive().optional(),
  '4': z.number().int().positive().optional(),
  '5': z.number().int().positive().optional(),
}).strict()
const StratzRankBracketSchema = z.enum(['ALL', 'HERALD_GUARDIAN', 'CRUSADER_ARCHON', 'LEGEND_ANCIENT', 'DIVINE_IMMORTAL'])
const TrainingDimensionSchema = z.enum(['ops', 'pregame', 'economy', 'combat', 'objective'])
const SessionTypeSchema = z.enum(['30min', '90min', '3hr'])

const OpenDotaSettingsSchema = z.object({
  accountId: z.string().optional(),
  apiKey: z.string().optional(),
  matchupMinGames: z.number().int().positive().optional(),
}).strict()

const StratzSettingsSchema = z.object({
  apiKey: z.string().optional(),
  rankBracket: StratzRankBracketSchema.optional(),
}).strict()

// GSI（Game State Integration，实验性）：只持久化用户开关/目录/端口最小配置。
// 连接状态、已识别英雄快照和 authToken 只存在 main 进程内存里，不进入这里。
const GsiSettingsSchema = z.object({
  enabled: z.boolean(),
  cfgDir: z.string().optional(),
  port: z.number().int().positive().optional(),
}).strict()

export const HeroConfigSchema = z.object({
  name: z.string().trim().min(1),
  heroId: z.number().int().positive().optional(),
  active: z.boolean(),
  tier: z.enum(['main', 'practice', 'backup']).optional(),
  positions: z.array(DotaPositionSchema).optional(),
}).strict()

export const AppStateSchema = z.object({
  activeCycleId: z.string(),
  heroPool: z.array(HeroConfigSchema),
  currentStreak: z.number().int().nonnegative().default(0),
  longestStreak: z.number().int().nonnegative().default(0),
  pendingPreGameSetupId: z.string().optional(),
  openDota: OpenDotaSettingsSchema.optional(),
  stratz: StratzSettingsSchema.optional(),
  checklistFreezeTokens: z.number().int().nonnegative().optional(),
  freezeUsedDates: z.array(z.string()).optional(),
  gsi: GsiSettingsSchema.optional(),
}).strict()

export const AppStatePatchSchema = z.object({
  activeCycleId: z.string().optional(),
  heroPool: z.array(HeroConfigSchema).optional(),
  currentStreak: z.number().int().nonnegative().optional(),
  longestStreak: z.number().int().nonnegative().optional(),
  pendingPreGameSetupId: z.string().optional(),
  openDota: OpenDotaSettingsSchema.optional(),
  stratz: StratzSettingsSchema.optional(),
  checklistFreezeTokens: z.number().int().nonnegative().optional(),
  freezeUsedDates: z.array(z.string()).optional(),
  gsi: GsiSettingsSchema.optional(),
}).strict()

const WeekThemeSchema = z.object({
  week: z.number().int().nonnegative(),
  theme: z.string(),
  checklistItemIds: z.array(z.string()),
}).strict()

export const TrainingCycleSchema = z.object({
  cycleId: z.string().min(1),
  startDate: z.string(),
  weekThemes: z.array(WeekThemeSchema),
  endDate: z.string().optional(),
}).strict()

export const PreGameSetupSchema = z.object({
  id: z.string().min(1),
  timestamp: z.number().finite(),
  hero: z.string(),
  heroId: z.number().int().positive().optional(),
  trainingGoal: z.string().optional(),
  preGameFocus: z.string().optional(),
  targetPosition: DotaPositionSchema.optional(),
  enemyByPosition: EnemyByPositionSchema.optional(),
  enemyHeroIdsByPosition: EnemyHeroIdByPositionSchema.optional(),
  enemyCarry: z.string().optional(),
  enemyCarryHeroId: z.number().int().positive().optional(),
  enemySupports: z.array(z.string()).optional(),
  enemySupportHeroIds: z.array(z.number().int().positive()).optional(),
  cycleId: z.string().optional(),
  linkedMatchId: z.string().optional(),
}).strict()

export const PreGameSetupPatchSchema = PreGameSetupSchema.partial().strict()

export const DailyCheckinSchema = z.object({
  id: z.string().min(1),
  date: z.string(),
  sessionType: SessionTypeSchema,
  checkedItems: z.array(z.string()),
}).strict()

export const MMRLogSchema = z.object({
  id: z.string().min(1),
  date: z.string(),
  mmr: z.number().finite(),
  notes: z.string().optional(),
}).strict()

export const MatchLogSchema = z.object({
  id: z.string().min(1),
  timestamp: z.number().finite(),
  preGameSetupId: z.string().optional(),
  hero: z.string().min(1),
  result: z.enum(['win', 'loss']),
  durationMin: z.number().finite().positive(),
  cycleId: z.string().optional(),
  trainingGoalMet: z.enum(['yes', 'partial', 'no']),
  biggestMistake: z.string(),
  nextGameFocus: z.string(),
  reviewDimension: TrainingDimensionSchema.optional(),
  reviewTopic: z.string().optional(),
  worstDeathZone: z.enum(['green', 'orange', 'red']).optional(),
  laneResult: z.enum(['dominated', 'even', 'lost']).optional(),
  firstKeyItemMin: z.number().finite().optional(),
  firstKeyItemName: z.string().optional(),
  goodInitiations: z.number().finite().optional(),
  draftScore: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  csAt10: z.number().finite().optional(),
  enemyCarry: z.string().optional(),
  enemyCarryHeroId: z.number().int().positive().optional(),
  enemySupports: z.array(z.string()).optional(),
  enemySupportHeroIds: z.array(z.number().int().positive()).optional(),
  enemyHeroes: z.array(z.string()).optional(),
  enemyHeroIds: z.array(z.number().int().positive()).optional(),
  matchId: z.string().optional(),
  source: z.enum(['manual', 'opendota']).optional(),
  heroId: z.number().int().positive().optional(),
  kills: z.number().finite().optional(),
  deaths: z.number().finite().optional(),
  assists: z.number().finite().optional(),
  lastHits: z.number().finite().optional(),
  denies: z.number().finite().optional(),
  dnAt10: z.number().finite().optional(),
  gpm: z.number().finite().optional(),
  xpm: z.number().finite().optional(),
  level: z.number().finite().optional(),
  laneRole: z.number().finite().optional(),
  laneEfficiency: z.number().finite().optional(),
  laneKills: z.number().finite().optional(),
  laneDeaths: z.number().finite().optional(),
  playerSlot: z.number().finite().optional(),
  isRadiant: z.boolean().optional(),
  opendotaImportedAt: z.number().finite().optional(),
  notes: z.string().optional(),
  reviewClipDeath: z.string().optional(),
  reviewClipFight: z.string().optional(),
  reviewClipObjective: z.string().optional(),
  gpmPercentile: z.number().finite().optional(),
  xpmPercentile: z.number().finite().optional(),
  lastHitsPercentile: z.number().finite().optional(),
  heroDamagePercentile: z.number().finite().optional(),
  laningGpm: z.number().finite().optional(),
  midGpm: z.number().finite().optional(),
  lateGpm: z.number().finite().optional(),
}).strict()

export const MatchLogPatchSchema = MatchLogSchema.partial().strict()

const HeroMatchupNoteSchema = z.object({
  opponentHero: z.string().min(1),
  opponentHeroId: z.number().int().positive().optional(),
  note: z.string(),
  stance: z.enum(['counters', 'counteredBy', 'general']).optional(),
  updatedAt: z.number().finite(),
  source: z.enum(['manual', 'postgame']).optional(),
  lastMatchId: z.string().optional(),
}).strict()

export const HeroNoteSchema = z.object({
  hero: z.string().min(1),
  heroId: z.number().int().positive().optional(),
  position: z.string(),
  strongPeriod: z.string(),
  weakPeriod: z.string(),
  laneGoal: z.string(),
  firstKeyItem: z.string(),
  counters: z.string(),
  counteredBy: z.string(),
  whenToFight: z.string(),
  whenToFarm: z.string(),
  commonDeaths: z.string(),
  reviewRules: z.array(z.string()),
  matchupNotes: z.record(z.string(), HeroMatchupNoteSchema).optional(),
  updatedAt: z.number().finite(),
  reviewClip1: z.string().optional(),
  reviewClip2: z.string().optional(),
  reviewClip3: z.string().optional(),
  srsEase: z.number().finite().optional(),
  srsIntervalDays: z.number().finite().optional(),
  srsNextReviewDate: z.string().optional(),
  srsLastRating: z.enum(['forgot', 'hard', 'good', 'easy']).optional(),
}).strict()

const HeroMatchupStatsSchema = z.object({
  gamesPlayed: z.number().finite().nonnegative(),
  wins: z.number().finite().nonnegative(),
  winRate: z.number().finite(),
  advantage: z.number().finite(),
}).strict()

export const HeroMatchupCacheSchema = z.object({
  source: z.enum(['opendota', 'stratz']),
  version: z.number().int().positive().optional(),
  syncedAt: z.number().finite(),
  date: z.string(),
  weekKey: z.string().optional(),
  expiresAt: z.number().finite().optional(),
  complete: z.boolean().optional(),
  heroCount: z.number().finite().nonnegative(),
  matchupCount: z.number().finite().nonnegative(),
  rankBracket: StratzRankBracketSchema.optional(),
  matchups: z.record(z.string(), z.record(z.string(), HeroMatchupStatsSchema)),
  errors: z.array(z.string()).optional(),
}).strict()

const HeroBenchmarkPercentileSchema = z.object({
  percentile: z.number().finite(),
  value: z.number().finite(),
}).strict()

export const HeroBenchmarkCacheSchema = z.object({
  source: z.literal('opendota'),
  syncedAt: z.number().finite(),
  heroId: z.number().finite(),
  // OpenDota may add benchmark categories over time. Keep known keys typed for the app,
  // but allow extra percentile-array metrics so runtime validation does not break when
  // the upstream response grows.
  benchmarks: z.object({
    gold_per_min: z.array(HeroBenchmarkPercentileSchema).optional(),
    xp_per_min: z.array(HeroBenchmarkPercentileSchema).optional(),
    kills_per_min: z.array(HeroBenchmarkPercentileSchema).optional(),
    last_hits_per_min: z.array(HeroBenchmarkPercentileSchema).optional(),
    hero_damage_per_min: z.array(HeroBenchmarkPercentileSchema).optional(),
  }).catchall(z.array(HeroBenchmarkPercentileSchema)),
}).strict()

export const HeroBenchmarkCacheMapSchema = z.record(z.string(), HeroBenchmarkCacheSchema)

const HeroTimingSegmentSchema = z.object({
  winRate: z.number().min(0).max(1).nullable(),
  games: z.number().int().nonnegative(),
}).strict()

export const HeroTimingProfileSchema = z.object({
  heroId: z.number().int().positive(),
  displayName: z.string().trim().min(1),
  localizedName: z.string().trim().min(1).optional(),
  early: HeroTimingSegmentSchema,
  mid: HeroTimingSegmentSchema,
  late: HeroTimingSegmentSchema,
  veryLate: HeroTimingSegmentSchema,
  timingLabel: z.enum(['early', 'mid', 'late', 'very_late', 'balanced', 'insufficient_data']),
  peakMinute: z.number().int().positive().optional(),
  totalGames: z.number().int().nonnegative(),
  confidence: z.enum(['low', 'medium', 'high']),
}).strict()

export const HeroTimingCacheSchema = z.object({
  source: z.literal('opendota'),
  syncedAt: z.number().finite(),
  date: z.string(),
  version: z.literal(1),
  heroCount: z.number().int().nonnegative(),
  profiles: z.record(z.string(), HeroTimingProfileSchema),
  errors: z.array(z.string()).optional(),
}).strict()

export const BackupSchema = z.object({
  schemaVersion: z.number().int().nonnegative().default(CURRENT_SCHEMA_VERSION),
  appState: AppStateSchema.optional(),
  cycles: z.array(TrainingCycleSchema).optional(),
  matchLogs: z.array(MatchLogSchema).optional(),
  preGameSetups: z.array(PreGameSetupSchema).optional(),
  dailyCheckins: z.array(DailyCheckinSchema).optional(),
  mmrLogs: z.array(MMRLogSchema).optional(),
  heroNotes: z.array(HeroNoteSchema).optional(),
  heroMatchupCache: HeroMatchupCacheSchema.nullable().optional(),
  heroBenchmarkCache: z.record(z.string(), HeroBenchmarkCacheSchema).optional(),
  heroTimingCache: HeroTimingCacheSchema.nullable().optional(),
}).strict()

export type ParsedBackupData = z.infer<typeof BackupSchema>

function formatZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map(issue => `${issue.path.length ? issue.path.join('.') : 'root'}: ${issue.message}`)
    .join('；')
}

function parseWithMessage<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new Error(`${message}：${formatZodError(result.error)}`)
  }
  return result.data
}

export function parseAppStatePatch(value: unknown) {
  return parseWithMessage(AppStatePatchSchema, value, '应用状态数据无效')
}

export function parseMatchLog(value: unknown) {
  return parseWithMessage(MatchLogSchema, value, '对局记录数据无效')
}

export function parseMatchLogPatch(value: unknown) {
  return parseWithMessage(MatchLogPatchSchema, value, '对局记录更新数据无效')
}

export function parsePreGameSetup(value: unknown) {
  return parseWithMessage(PreGameSetupSchema, value, '赛前设定数据无效')
}

export function parsePreGameSetupPatch(value: unknown) {
  return parseWithMessage(PreGameSetupPatchSchema, value, '赛前设定更新数据无效')
}

export function parseDailyCheckin(value: unknown) {
  return parseWithMessage(DailyCheckinSchema, value, '每日打卡数据无效')
}

export function parseMMRLog(value: unknown) {
  return parseWithMessage(MMRLogSchema, value, 'MMR 记录数据无效')
}

export function parseHeroNote(value: unknown) {
  return parseWithMessage(HeroNoteSchema, value, '英雄档案数据无效')
}

export function parseHeroMatchupCache(value: unknown) {
  return parseWithMessage(HeroMatchupCacheSchema, value, '英雄克制缓存数据无效')
}

export function parseHeroBenchmarkCache(value: unknown) {
  return parseWithMessage(HeroBenchmarkCacheSchema, value, '英雄 benchmark 缓存数据无效')
}

export function parseHeroBenchmarkCacheMap(value: unknown) {
  return parseWithMessage(HeroBenchmarkCacheMapSchema, value, '英雄 benchmark 缓存集合数据无效')
}

export function parseHeroTimingCache(value: unknown) {
  return parseWithMessage(HeroTimingCacheSchema, value, '英雄 timing 缓存数据无效')
}

export function parseTrainingCycle(value: unknown) {
  return parseWithMessage(TrainingCycleSchema, value, '训练周期数据无效')
}

export function parseBackupData(value: unknown): ParsedBackupData {
  return parseWithMessage(BackupSchema, value, '导入数据格式无效')
}

export function parseImportedBackupJson(json: string): ParsedBackupData {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('备份文件不是有效 JSON。')
  }
  return parseBackupData(raw)
}

export function normalizeSchemaVersion(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0
}

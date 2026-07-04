// ── 训练维度枚举
export type TrainingDimension = 'ops' | 'pregame' | 'economy' | 'combat' | 'objective';

export type SessionType = '30min' | '90min' | '3hr';

// ── Checklist 项定义（配置，不存用户数据）
export interface ChecklistItem {
  id: string;
  label: string;
  dimension: TrainingDimension | 'discipline' | 'review';
  sessionTypes: SessionType[];
  weekRange?: [number, number];
}

// ── 周主题
export interface WeekTheme {
  week: number;
  theme: string;
  checklistItemIds: string[];
}

// ── 训练周期（支持多周期）
export interface TrainingCycle {
  cycleId: string;
  startDate: string;         // YYYY-MM-DD
  weekThemes: WeekTheme[];
  endDate?: string;
}

// ── MMR 记录
export interface MMRLog {
  id: string;
  date: string;
  mmr: number;
  notes?: string;
}

// ── OpenDota 设置
export interface OpenDotaSettings {
  accountId?: string;
  apiKey?: string;
  matchupMinGames?: number;
}

// ── Stratz 设置（英雄克制矩阵数据源；OpenDota 不再用于 hero matchup）
export type StratzRankBracket = 'ALL' | 'HERALD_GUARDIAN' | 'CRUSADER_ARCHON' | 'LEGEND_ANCIENT' | 'DIVINE_IMMORTAL';
export type DotaPosition = '1' | '2' | '3' | '4' | '5';
export type EnemyByPosition = Partial<Record<DotaPosition, string>>;
export type EnemyHeroIdByPosition = Partial<Record<DotaPosition, number>>;

export interface StratzSettings {
  apiKey?: string;
  rankBracket?: StratzRankBracket;
}

// ── GSI（Game State Integration，实验性，默认关闭）
// 只持久化用户开关/目录/端口；连接状态、已识别英雄快照、authToken 只存在 main 进程内存里。
export interface GsiSettings {
  enabled: boolean;
  cfgDir?: string;
  port?: number;
}

export type DraftGsiConnectionStatus = 'disconnected' | 'connected' | 'in_draft' | 'stale';

export interface DraftGsiSnapshot {
  status: DraftGsiConnectionStatus;
  lastPayloadAt: number | null;
  enemyHeroIds: number[];
  gameMode: 'captains_mode' | 'all_pick' | 'ranked_all_pick' | 'unknown';
}

export interface GsiConfigStatus {
  installed: boolean;
  configPath: string | null;
  dotaCfgDirFound: boolean;
  detectedSteamPaths: string[];
}

export interface GsiServerStatus {
  running: boolean;
  port: number | null;
}

export interface GsiStatus {
  enabled: boolean;
  server: GsiServerStatus;
  config: GsiConfigStatus;
  snapshot: DraftGsiSnapshot | null;
}

export interface GsiEnableResult {
  ok: boolean;
  error?: string;
}

export interface PositionMetaHero {
  hero: string;
  weight: number;
  pickRate?: number;
  matchCount?: number;
}

export interface PositionMetaSnapshot {
  source: 'stratz' | 'manual';
  rankBracket?: StratzRankBracket;
  weekKey: string;
  syncedAt: number;
  topN: number;
  positions: Record<DotaPosition, PositionMetaHero[]>;
}

export interface DraftReason {
  type: 'known-counter' | 'known-risk' | 'unknown-counter' | 'unknown-risk' | 'proficiency';
  label: string;
  score: number;
  position?: DotaPosition;
  enemy?: string;
  gamesPlayed?: number;
  source?: 'stratz' | 'opendota' | 'static' | 'meta';
}

export interface RankedDraftHero {
  hero: string;
  knownScore: number;
  unknownScore: number;
  proficiencyScore: number;
  totalScore: number;
  knownCounterScore: number;
  knownRiskScore: number;
  unknownCounterScore: number;
  unknownRiskScore: number;
  reasons: DraftReason[];
  poolTier?: HeroConfig['tier'];
  proficiencyLabel: string;
}

// ── 赛前设定
export interface PreGameSetup {
  id: string;
  timestamp: number;
  hero: string;
  heroId?: number;
  trainingGoal?: string;
  preGameFocus?: string;
  targetPosition?: DotaPosition;
  enemyByPosition?: EnemyByPosition;
  enemyHeroIdsByPosition?: EnemyHeroIdByPosition;
  enemyCarry?: string;
  enemyCarryHeroId?: number;
  enemySupports?: string[];
  enemySupportHeroIds?: number[];
  cycleId?: string;
  linkedMatchId?: string;
}

// ── 对局记录
export interface MatchLog {
  id: string;
  timestamp: number;
  preGameSetupId?: string;
  hero: string;
  result: 'win' | 'loss';
  durationMin: number;
  cycleId?: string;

  // 必填
  trainingGoalMet: 'yes' | 'partial' | 'no';
  biggestMistake: string;
  nextGameFocus: string;

  // 选填
  reviewDimension?: TrainingDimension;
  reviewTopic?: string;
  worstDeathZone?: 'green' | 'orange' | 'red';
  laneResult?: 'dominated' | 'even' | 'lost';
  firstKeyItemMin?: number;
  firstKeyItemName?: string;
  goodInitiations?: number;
  draftScore?: 1 | 2 | 3 | 4 | 5;
  csAt10?: number;
  enemyCarry?: string;
  enemyCarryHeroId?: number;
  enemySupports?: string[];
  enemySupportHeroIds?: number[];
  enemyHeroes?: string[];
  enemyHeroIds?: number[];
  matchId?: string;
  source?: 'manual' | 'opendota';
  heroId?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  lastHits?: number;
  denies?: number;
  dnAt10?: number;
  gpm?: number;
  xpm?: number;
  level?: number;
  laneRole?: number;
  laneEfficiency?: number;
  laneKills?: number;
  laneDeaths?: number;
  playerSlot?: number;
  isRadiant?: boolean;
  opendotaImportedAt?: number;
  notes?: string;
  reviewClipDeath?: string;
  reviewClipFight?: string;
  reviewClipObjective?: string;
  gpmPercentile?: number;
  xpmPercentile?: number;
  lastHitsPercentile?: number;
  heroDamagePercentile?: number;
  laningGpm?: number;
  midGpm?: number;
  lateGpm?: number;
}

export interface OpenDotaRecentMatch {
  matchId: string;
  heroId?: number;
  heroName?: string;
  timestamp?: number;
  durationMin?: number;
  result?: 'win' | 'loss';
  kills?: number;
  deaths?: number;
  assists?: number;
  recorded?: boolean;
}

// ── 每日打卡
export interface DailyCheckin {
  id: string;
  date: string;              // YYYY-MM-DD
  sessionType: SessionType;
  checkedItems: string[];
}

// ── 英雄配置
export interface HeroConfig {
  name: string;
  heroId?: number;
  active: boolean;
  tier?: 'main' | 'practice' | 'backup';
  positions?: DotaPosition[];
}

// ── 应用状态（electron-store 持久化）
export interface AppState {
  activeCycleId: string;
  heroPool: HeroConfig[];
  currentStreak: number;
  longestStreak: number;
  pendingPreGameSetupId?: string;
  openDota?: OpenDotaSettings;
  stratz?: StratzSettings;
  checklistFreezeTokens?: number;
  freezeUsedDates?: string[];
  gsi?: GsiSettings;
}

// ── OpenDota 导入结果（主进程返回）
export interface OpenDotaImportedMatch {
  matchId: string;
  timestamp: number;
  durationMin: number;
  result: 'win' | 'loss';
  heroId: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  lastHits?: number;
  denies?: number;
  csAt10?: number;
  dnAt10?: number;
  firstKeyItemMin?: number;
  firstKeyItemName?: string;
  gpm?: number;
  xpm?: number;
  level?: number;
  laneRole?: number;
  laneResult?: 'dominated' | 'even' | 'lost';
  laneEfficiency?: number;
  laneKills?: number;
  laneDeaths?: number;
  playerSlot?: number;
  isRadiant?: boolean;
  enemyHeroes?: string[];
  enemyHeroIds?: number[];
  gpmPercentile?: number;
  xpmPercentile?: number;
  lastHitsPercentile?: number;
  heroDamagePercentile?: number;
  laningGpm?: number;
  midGpm?: number;
  lateGpm?: number;
}

export type OpenDotaErrorCode =
  | 'PARSE_PENDING'
  | 'MATCH_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'ACCOUNT_MISMATCH'
  | 'ACCOUNT_REQUIRED'
  | 'INVALID_MATCH_ID'
  | 'DUPLICATE_MATCH'
  | 'UNKNOWN'

export interface OpenDotaParseRequestResult {
  matchId: string;
  jobId?: string;
  message: string;
}

// ── 英雄克制缓存（OpenDota 每周矩阵）
export interface HeroMatchupStats {
  gamesPlayed: number;
  wins: number;
  winRate: number;
  advantage: number;
}

export interface HeroMatchupCache {
  source: 'opendota' | 'stratz';
  version?: number;
  syncedAt: number;
  date: string;
  weekKey?: string;
  expiresAt?: number;
  complete?: boolean;
  heroCount: number;
  matchupCount: number;
  rankBracket?: StratzRankBracket;
  matchups: Record<string, Record<string, HeroMatchupStats>>;
  errors?: string[];
}

export interface HeroMatchupSyncResult {
  status: 'fresh' | 'synced' | 'partial' | 'stale';
  message: string;
  cache: HeroMatchupCache;
}

export type HeroTimingLabel = 'early' | 'mid' | 'late' | 'very_late' | 'balanced' | 'insufficient_data';
export type HeroTimingConfidence = 'low' | 'medium' | 'high';

export interface HeroTimingSegment {
  winRate: number | null;
  games: number;
}

export interface HeroTimingProfile {
  heroId: number;
  displayName: string;
  localizedName?: string;
  early: HeroTimingSegment;
  mid: HeroTimingSegment;
  late: HeroTimingSegment;
  veryLate: HeroTimingSegment;
  timingLabel: HeroTimingLabel;
  peakMinute?: number;
  totalGames: number;
  confidence: HeroTimingConfidence;
}

export interface HeroTimingCache {
  source: 'opendota';
  syncedAt: number;
  date: string;
  version: 1;
  heroCount: number;
  profiles: Record<string, HeroTimingProfile>;
  errors?: string[];
}

export interface HeroTimingSyncResult {
  cached: boolean;
  heroCount: number;
  errors: string[];
}

export interface HeroBenchmarkPercentile {
  percentile: number;
  value: number;
}

export interface HeroBenchmarkCache {
  source: 'opendota';
  syncedAt: number;
  heroId: number;
  benchmarks: {
    gold_per_min?: HeroBenchmarkPercentile[];
    xp_per_min?: HeroBenchmarkPercentile[];
    kills_per_min?: HeroBenchmarkPercentile[];
    last_hits_per_min?: HeroBenchmarkPercentile[];
    hero_damage_per_min?: HeroBenchmarkPercentile[];
  };
}

export interface HeroMatchupNote {
  opponentHero: string;
  opponentHeroId?: number;
  note: string;
  stance?: 'counters' | 'counteredBy' | 'general';
  updatedAt: number;
  source?: 'manual' | 'postgame';
  lastMatchId?: string;
}

// ── 英雄档案（P1）
export interface HeroNote {
  hero: string;
  heroId?: number;
  position: string;
  strongPeriod: string;
  weakPeriod: string;
  laneGoal: string;
  firstKeyItem: string;
  counters: string;
  counteredBy: string;
  whenToFight: string;
  whenToFarm: string;
  commonDeaths: string;
  reviewRules: string[];
  matchupNotes?: Record<string, HeroMatchupNote>;
  updatedAt: number;
  reviewClip1?: string;
  reviewClip2?: string;
  reviewClip3?: string;
  srsEase?: number;
  srsIntervalDays?: number;
  srsNextReviewDate?: string;
  srsLastRating?: 'forgot' | 'hard' | 'good' | 'easy';
}

// ── Window 接口声明（渲染进程用）
declare global {
  interface Window {
    electronStore: {
      getAppState(): Promise<AppState>;
      setAppState(partial: Partial<AppState>): Promise<void>;
      addMatchLog(log: MatchLog): Promise<void>;
      getMatchLogs(): Promise<MatchLog[]>;
      updateMatchLog(id: string, patch: Partial<MatchLog>): Promise<void>;
      addPreGameSetup(setup: PreGameSetup): Promise<void>;
      getPreGameSetups(): Promise<PreGameSetup[]>;
      updatePreGameSetup(id: string, patch: Partial<PreGameSetup>): Promise<void>;
      upsertDailyCheckin(checkin: DailyCheckin): Promise<void>;
      addDailyCheckin(checkin: DailyCheckin): Promise<void>;
      getDailyCheckins(): Promise<DailyCheckin[]>;
      addMMRLog(log: MMRLog): Promise<void>;
      getMMRLogs(): Promise<MMRLog[]>;
      getHeroNotes(): Promise<HeroNote[]>;
      upsertHeroNote(note: HeroNote): Promise<void>;
      addCycle(cycle: TrainingCycle): Promise<void>;
      getCycles(): Promise<TrainingCycle[]>;
      importOpenDotaMatch(matchId: string): Promise<OpenDotaImportedMatch>;
      autoImportLatestOpenDotaMatch(existingMatchIds?: string[]): Promise<OpenDotaImportedMatch>;
      getRecentOpenDotaMatches(existingMatchIds?: string[]): Promise<OpenDotaRecentMatch[]>;
      requestOpenDotaParse(matchId: string): Promise<OpenDotaParseRequestResult>;
      getHeroMatchupCache(): Promise<HeroMatchupCache | null>;
      syncOpenDotaHeroMatchups(force?: boolean): Promise<HeroMatchupSyncResult>;
      getHeroTimingCache(): Promise<HeroTimingCache | null>;
      syncHeroTimings(force?: boolean): Promise<HeroTimingSyncResult>;
      getGsiStatus(): Promise<GsiStatus>;
      enableGsi(options?: { cfgDir?: string; port?: number }): Promise<GsiEnableResult>;
      disableGsi(): Promise<void>;
      detectGsiCfgDir(): Promise<string[]>;
      chooseGsiCfgDir(): Promise<string | null>;
      onGsiSnapshotUpdated(cb: (snapshot: DraftGsiSnapshot) => void): () => void;
      exportAll(): Promise<{ success: boolean }>;
      importAll(json: string): Promise<void>;
    };
  }
}

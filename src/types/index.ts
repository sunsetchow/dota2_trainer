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

// ── Stratz 设置（英雄克制矩阵可选数据源，天梯分段数据，比 OpenDota /matchups 只有职业赛数据样本大得多）
export type StratzRankBracket = 'ALL' | 'HERALD_GUARDIAN' | 'CRUSADER_ARCHON' | 'LEGEND_ANCIENT' | 'DIVINE_IMMORTAL';
export type DotaPosition = '1' | '2' | '3' | '4' | '5';
export type EnemyByPosition = Partial<Record<DotaPosition, string>>;

export interface StratzSettings {
  apiKey?: string;
  rankBracket?: StratzRankBracket;
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
  trainingGoal: string;
  enemyCarry?: string;
  enemySupports?: string[];
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
  enemySupports?: string[];
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
  active: boolean;
  tier?: 'main' | 'practice' | 'backup';
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
  gpmPercentile?: number;
  xpmPercentile?: number;
  lastHitsPercentile?: number;
  heroDamagePercentile?: number;
  laningGpm?: number;
  midGpm?: number;
  lateGpm?: number;
}

export interface OpenDotaParseRequestResult {
  matchId: string;
  message: string;
  jobId?: string;
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

// ── 英雄档案（P1）
export interface HeroNote {
  hero: string;
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
      analyzeAndImportOpenDotaMatch(matchId: string): Promise<OpenDotaImportedMatch>;
      requestOpenDotaParse(matchId: string): Promise<OpenDotaParseRequestResult>;
      getHeroMatchupCache(): Promise<HeroMatchupCache | null>;
      syncOpenDotaHeroMatchups(force?: boolean): Promise<HeroMatchupSyncResult>;
      exportAll(): Promise<{ success: boolean }>;
      importAll(json: string): Promise<void>;
    };
  }
}

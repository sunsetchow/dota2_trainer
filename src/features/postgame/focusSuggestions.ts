import type { HeroNote, TrainingDimension } from '../../types'

export type LaneResult = 'dominated' | 'even' | 'lost'

export const FOCUS_OPTIONS_BY_DIMENSION: Record<TrainingDimension, string[]> = {
  ops: [
    '前 10 分钟只优先补刀，不为了消耗漏远程兵',
    '换血前先确认小兵仇恨和关键技能冷却',
    '团战前先站住施法距离，再决定是否交关键技能',
  ],
  pregame: [
    '进游戏前写清楚本局强势期，强势期前不主动接烂团',
    '开局先判断双方阵容第一目标，再决定对线打法',
    '前 5 分钟只执行本英雄的对线胜利条件',
  ],
  economy: [
    '每次离线前先判断下一波钱来自兵线、野区还是中立资源',
    '死亡或回家后先规划 60 秒刷钱路线，再移动',
    '进入危险区前先确认敌方核心和控制英雄位置',
  ],
  combat: [
    '每次参团前先问：我这波是先手、反手还是收割',
    '关键装备前不为了低价值击杀打无视野团',
    '开团前先看小地图和队友距离，不单人先进场',
  ],
  objective: [
    '打赢团后 5 秒内选择推塔、肉山或带线，不原地逛',
    '每次过河前先处理最近一条兵线',
    '拿到关键击杀后优先换建筑或 Roshan，而不是追第二个人',
  ],
}

export const FOCUS_OPTIONS_BY_LANE_RESULT: Record<LaneResult, string[]> = {
  dominated: [
    '对线优势后先控线和压经验，不越塔送回节奏',
    '压制对线后第一个夜晚前把优势转成塔或资源',
  ],
  even: [
    '对线持平时不硬拼，优先稳定补刀并等关键等级',
    '5 分钟后主动判断是否需要换线、拉野或控符',
  ],
  lost: [
    '对线劣势时先保经验和远程兵，不为了补刀连续掉血',
    '被压后提前叫支援或转野，不在同一位置死第二次',
  ],
}

export const FOCUS_OPTIONS_BY_WEEK: Record<number, string[]> = {
  1: ['前 10 分钟只记录一次对线失误，并在下一波兵修正'],
  2: ['每波兵先看远程兵血量，再决定消耗或补刀'],
  3: ['刷钱前先标记安全区、争夺区、危险区'],
  4: ['没有敌方关键英雄位置时，不进红区收线'],
  5: ['中期每 30 秒先处理兵线，再决定打架或刷钱'],
  6: ['打架前先确认这波能否换塔、肉山或关键装备时间'],
  7: ['只围绕本英雄第一件关键装决定打或刷'],
  8: ['输一局后下一局只执行一个纪律点，不补偿式开团'],
}

export const FOCUS_OPTIONS_BY_HERO: Record<string, string[]> = {
  军团指挥官: [
    '下一局决斗前先确认队友伤害和敌方救人技能，再开决斗',
    '对线期先保证压制和经验，不为了低概率决斗放弃经济线',
  ],
  斧王: [
    '下一局跳吼前先等敌方核心露头，不把先手交给辅助',
    '对线期先控兵线吃经验，没到关键等级不硬断兵送节奏',
  ],
  潮汐猎人: [
    '下一局大招只为核心目标或关键反手留，不为单个辅助交 ravage',
    '团战前先站在能覆盖队友的位置，不提前被消耗到不能开团',
  ],
  半人马战行者: [
    '下一局踩人前先确认队友能跟上，不单人先手打成卖自己',
    '对线劣势时用双刃剑补关键兵，不为了换血丢经验',
  ],
  黑暗贤者: [
    '下一局每波壳子先服务兵线和刷钱路线，不无目的给队友',
    '团战只找墙接真空的核心位置，不为了小控强行开团',
  ],
  暗夜魔王: [
    '下一局第一个夜晚前规划一次烟或边路压制，不在白天硬找架',
    '夜晚开打前先锁定后排视野目标，不追前排浪费沉默时间',
  ],
  狼人: [
    '下一局大招只用于拿塔、肉山或关键击杀，不用来追低价值人头',
    '到强势装后先叫队友围绕建筑推进，不继续无压力单刷',
  ],
  剃刀: [
    '下一局对线先拉住核心英雄抽攻，不为了追人漏远程兵',
    '中期只打能持续链接的战场，不先进复杂地形被风筝',
  ],
  瘟疫法师: [
    '下一局先判断敌方爆发和沉默位置，再决定能不能站前排吃伤害',
    '团战大招只给关键核心或必死目标，不为了抢人头早交',
  ],
  冥魂大帝: [
    '下一局有复活前主动站前排吃信息，没复活时不带头进危险区',
    '对线期先保证补刀和骷髅节奏，不用低级骷髅乱推线',
  ],
  不朽尸王: [
    '下一局墓碑只放在敌方必须打或必须退的位置，不随手丢在边缘',
    '对线期先用尸腐压血线，不为了追人把兵线送进塔',
  ],
  小小: [
    '下一局先确认投掷目标和队友位置，再打 VT 连招',
    '跳刀前不硬找低概率先手，优先补出关键装再打第一波',
  ],
  孽主: [
    '下一局先把线推过河再参团，不放弃守塔和清线价值',
    '传送门只用于明确的救人、换线或打目标，不随机带队友乱走',
  ],
  伐木机: [
    '下一局只在敌方控制技能交过后深入，不把强势线打成送赏金',
    '对线优势先压经验和塔，不越过无视野区域追残血',
  ],
  马尔斯: [
    '下一局开竞技场前先想清楚矛钉墙方向，不空大后硬追',
    '团战优先框住敌方核心或分割战场，不为单个辅助交大',
  ],
  原始野兽: [
    '下一局冲锋前先确认路线和队友距离，不把自己送进五个人中间',
    '大招优先给关键输出或控制英雄，不随手按在前排身上',
  ],
  破晓辰星: [
    '下一局大招前先看队友血量和落点，不为了救必死队友送第二条命',
    '对线期先用技能保证远程兵和换血，不无目的推线',
  ],
  龙骑士: [
    '下一局每次变龙前先说清楚要推哪座塔，不开大后原地刷钱',
    '对线期以稳定补刀和等级为先，不为低伤害换血漏刀',
  ],
  沙王: [
    '下一局跳大前先等关键控制或视野信息，不盲跳进反手技能',
    '对线期用沙尘和穿刺保经验，不为了消耗把蓝打空',
  ],
  兽王: [
    '下一局野性呼唤先服务视野和控线，不只当补刀技能',
    '六级后第一波吼叫要连接推塔或击杀，不空转强势期',
  ],
  末日使者: [
    '下一局大招只给敌方最影响团战的人，不为了单杀辅助交 Doom',
    '前 10 分钟先保证吞兵和经济节奏，不无目的游走',
  ],
}

export const BLINK_INITIATORS = new Set([
  '斧王', '潮汐猎人', '半人马战行者', '沙王', '马尔斯', '撼地者', '谜团', '斯拉达', '巨牙海民', '酒仙', '军团指挥官',
])

export const SUMMON_PUSHERS = new Set([
  '狼人', '兽王', '先知', '陈', '德鲁伊', '育母蜘蛛', '维萨吉', '谜团',
])

export const LANE_DOMINATORS = new Set([
  '剃刀', '冥界亚龙', '哈斯卡', '伐木机', '瘟疫法师', '剧毒术士', '死亡先知', '蝙蝠骑士',
])

export function getHeroFocusOptions(heroName: string, keyItemName?: string): string[] {
  const hero = heroName.trim()
  if (!hero) return []

  const options = [...(FOCUS_OPTIONS_BY_HERO[hero] ?? [])]

  if (keyItemName) {
    options.push(`下一局围绕${keyItemName}第一波主动找节奏，装备前不接无目标团`)
  }
  if (BLINK_INITIATORS.has(hero)) {
    options.push('下一局跳刀前只刷关键经济，跳刀后第一波必须先找核心目标')
  }
  if (SUMMON_PUSHERS.has(hero)) {
    options.push('下一局强势召唤物时间优先换塔或 Roshan，不只刷野')
  }
  if (LANE_DOMINATORS.has(hero)) {
    options.push('下一局对线优势先压经验和控资源，不越线追人送回节奏')
  }

  return options
}

export function getHeroNoteFocusOptions(note?: HeroNote): string[] {
  if (!note) return []
  return [
    ...note.reviewRules.map(rule => `下一局执行：${rule}`),
    note.laneGoal ? `下一局对线只盯：${note.laneGoal}` : undefined,
    note.firstKeyItem ? `下一局先围绕${note.firstKeyItem}做第一波节奏` : undefined,
    note.commonDeaths ? `下一局避免：${note.commonDeaths}` : undefined,
  ].filter((item): item is string => Boolean(item))
}

export function compactMistake(value?: string): string | undefined {
  const firstSentence = value?.trim().split(/[，,。.；;]/)[0]?.trim()
  if (!firstSentence || firstSentence.length < 4) return undefined
  return `避免重复：${firstSentence}`
}

export function compactPreviousFocus(value?: string): string | undefined {
  const focus = value?.trim()
  if (!focus || focus.length < 4) return undefined
  return focus.length > 34 ? `${focus.slice(0, 34)}…` : focus
}

export function uniqueOptions(options: Array<string | undefined>): string[] {
  return [...new Set(options.filter((value): value is string => Boolean(value)))].slice(0, 6)
}


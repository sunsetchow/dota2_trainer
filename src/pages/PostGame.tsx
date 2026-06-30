import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { useAppState, useHeroNotes, useMatchLogs, useCycles } from '../store/useStore.ts'
import HeroSelector from '../components/HeroSelector.tsx'
import QuickSelect from '../components/QuickSelect.tsx'
import { REVIEW_DIMENSIONS } from '../data/reviewDimensions.ts'
import type { HeroNote, MatchLog, PreGameSetup, OpenDotaImportedMatch, OpenDotaRecentMatch, TrainingDimension } from '../types'
import { getCurrentWeek } from '../utils/cycle.ts'
import { getOpenDotaHeroName } from '../utils/opendotaHeroes.ts'

type LaneResult = 'dominated' | 'even' | 'lost'

const FOCUS_OPTIONS_BY_DIMENSION: Record<TrainingDimension, string[]> = {
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

const FOCUS_OPTIONS_BY_LANE_RESULT: Record<LaneResult, string[]> = {
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

const FOCUS_OPTIONS_BY_WEEK: Record<number, string[]> = {
  1: ['前 10 分钟只记录一次对线失误，并在下一波兵修正'],
  2: ['每波兵先看远程兵血量，再决定消耗或补刀'],
  3: ['刷钱前先标记安全区、争夺区、危险区'],
  4: ['没有敌方关键英雄位置时，不进红区收线'],
  5: ['中期每 30 秒先处理兵线，再决定打架或刷钱'],
  6: ['打架前先确认这波能否换塔、肉山或关键装备时间'],
  7: ['只围绕本英雄第一件关键装决定打或刷'],
  8: ['输一局后下一局只执行一个纪律点，不补偿式开团'],
}

const FOCUS_OPTIONS_BY_HERO: Record<string, string[]> = {
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

const BLINK_INITIATORS = new Set([
  '斧王', '潮汐猎人', '半人马战行者', '沙王', '马尔斯', '撼地者', '谜团', '斯拉达', '巨牙海民', '酒仙', '军团指挥官',
])

const SUMMON_PUSHERS = new Set([
  '狼人', '兽王', '先知', '陈', '德鲁伊', '育母蜘蛛', '维萨吉', '谜团',
])

const LANE_DOMINATORS = new Set([
  '剃刀', '冥界亚龙', '哈斯卡', '伐木机', '瘟疫法师', '剧毒术士', '死亡先知', '蝙蝠骑士',
])

function getHeroFocusOptions(heroName: string, keyItemName?: string): string[] {
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

function getHeroNoteFocusOptions(note?: HeroNote): string[] {
  if (!note) return []
  return [
    ...note.reviewRules.map(rule => `下一局执行：${rule}`),
    note.laneGoal ? `下一局对线只盯：${note.laneGoal}` : undefined,
    note.firstKeyItem ? `下一局先围绕${note.firstKeyItem}做第一波节奏` : undefined,
    note.commonDeaths ? `下一局避免：${note.commonDeaths}` : undefined,
  ].filter((item): item is string => Boolean(item))
}

function compactMistake(value?: string): string | undefined {
  const firstSentence = value?.trim().split(/[，,。.；;]/)[0]?.trim()
  if (!firstSentence || firstSentence.length < 4) return undefined
  return `避免重复：${firstSentence}`
}

function compactPreviousFocus(value?: string): string | undefined {
  const focus = value?.trim()
  if (!focus || focus.length < 4) return undefined
  return focus.length > 34 ? `${focus.slice(0, 34)}…` : focus
}

function uniqueOptions(options: Array<string | undefined>): string[] {
  return [...new Set(options.filter((value): value is string => Boolean(value)))].slice(0, 6)
}

export default function PostGame() {
  const navigate = useNavigate()
  const { appState } = useAppState()
  const { matchLogs, add: addMatchLog } = useMatchLogs()
  const { heroNotes } = useHeroNotes()
  const { cycles } = useCycles()

  // 必填字段
  const [hero, setHero] = useState('')
  const [result, setResult] = useState<'win' | 'loss' | ''>('')
  const [durationMin, setDurationMin] = useState('')
  const [trainingGoalMet, setTrainingGoalMet] = useState<'yes' | 'partial' | 'no' | ''>('')
  const [biggestMistake, setBiggestMistake] = useState('')
  const [reviewDimension, setReviewDimension] = useState<TrainingDimension | ''>('')
  const [reviewTopic, setReviewTopic] = useState('')
  const [nextGameFocus, setNextGameFocus] = useState('')

  // 选填字段
  const [showOptional, setShowOptional] = useState(false)
  const [worstDeathZone, setWorstDeathZone] = useState<'green' | 'orange' | 'red' | ''>('')
  const [laneResult, setLaneResult] = useState<'dominated' | 'even' | 'lost' | ''>('')
  const [firstKeyItemMin, setFirstKeyItemMin] = useState('')
  const [goodInitiations, setGoodInitiations] = useState('')
  const [draftScore, setDraftScore] = useState<1 | 2 | 3 | 4 | 5 | 0>(0)
  const [csAt10, setCsAt10] = useState('')
  const [matchId, setMatchId] = useState('')
  const [notes, setNotes] = useState('')
  const [reviewClipDeath, setReviewClipDeath] = useState('')
  const [reviewClipFight, setReviewClipFight] = useState('')
  const [reviewClipObjective, setReviewClipObjective] = useState('')

  const [pendingSetup, setPendingSetup] = useState<PreGameSetup | null>(null)
  const [saving, setSaving] = useState(false)
  const [importingOpenDota, setImportingOpenDota] = useState(false)
  const [autoImportingOpenDota, setAutoImportingOpenDota] = useState(false)
  const [analyzingOpenDota, setAnalyzingOpenDota] = useState(false)
  const [openDotaStatus, setOpenDotaStatus] = useState('')
  const [canRequestParse, setCanRequestParse] = useState(false)
  const [importedMatch, setImportedMatch] = useState<OpenDotaImportedMatch | null>(null)
  const [recentMatches, setRecentMatches] = useState<OpenDotaRecentMatch[]>([])
  const [loadingRecentMatches, setLoadingRecentMatches] = useState(false)
  const [autoImportAttempted, setAutoImportAttempted] = useState(false)

  // 加载 pending 赛前设定
  useEffect(() => {
    if (!appState?.pendingPreGameSetupId) return
    window.electronStore.getPreGameSetups().then(setups => {
      const s = setups.find(s => s.id === appState.pendingPreGameSetupId)
      if (s) {
        setPendingSetup(s)
        if (!hero) setHero(s.hero)
      }
    })
  }, [appState?.pendingPreGameSetupId])

  // 快速选项
  const activeCycle = cycles.find(c => c.cycleId === appState?.activeCycleId)
  const currentWeek = activeCycle ? getCurrentWeek(activeCycle) : 0
  const lastMatch = [...matchLogs].sort((a, b) => b.timestamp - a.timestamp)[0]
  const selectedHero = hero.trim()
  const lastSameHeroMatch = selectedHero
    ? [...matchLogs]
      .filter(log => log.hero === selectedHero && Boolean(log.nextGameFocus?.trim()))
      .sort((a, b) => b.timestamp - a.timestamp)[0]
    : undefined

  const heroPool = appState?.heroPool.filter(h => h.active).map(h => h.name) ?? []
  const selectedReviewDimension = REVIEW_DIMENSIONS.find(item => item.id === reviewDimension)
  const selectedHeroNote = selectedHero ? heroNotes.find(note => note.hero === selectedHero) : undefined
  const previousHeroFocus = compactPreviousFocus(lastSameHeroMatch?.nextGameFocus)
  const quickFocusOptions = uniqueOptions([
    previousHeroFocus,
    ...getHeroNoteFocusOptions(selectedHeroNote),
    ...getHeroFocusOptions(hero, importedMatch?.firstKeyItemName),
    ...(reviewDimension ? FOCUS_OPTIONS_BY_DIMENSION[reviewDimension] : []),
    ...(laneResult ? FOCUS_OPTIONS_BY_LANE_RESULT[laneResult as LaneResult] : []),
    ...(FOCUS_OPTIONS_BY_WEEK[currentWeek] ?? []),
    compactMistake(biggestMistake),
    compactMistake(lastMatch?.biggestMistake),
    '下一局只改这一个点，结束后只按这个点复盘',
  ])

  const canSave =
    hero.trim() &&
    result &&
    durationMin &&
    !isNaN(parseInt(durationMin, 10)) &&
    trainingGoalMet &&
    biggestMistake.trim() &&
    nextGameFocus.trim()

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const currentAppState = await window.electronStore.getAppState()
      const cleanMatchId = matchId.trim()
      if (cleanMatchId && matchLogs.some(l => l.matchId === cleanMatchId)) {
        window.alert('这个 Match ID 已经记录过了。')
        return
      }
      const logId = nanoid() // ✅ 先生成 id，在对象创建前
      const imported = importedMatch?.matchId === cleanMatchId ? importedMatch : null

      const log: MatchLog = {
        id: logId,
        timestamp: imported?.timestamp ?? Date.now(),
        hero: hero.trim(),
        result: result as 'win' | 'loss',
        durationMin: parseInt(durationMin, 10),
        trainingGoalMet: trainingGoalMet as 'yes' | 'partial' | 'no',
        biggestMistake: biggestMistake.trim(),
        nextGameFocus: nextGameFocus.trim(),
        cycleId: currentAppState.activeCycleId,
        ...(reviewDimension && { reviewDimension: reviewDimension as TrainingDimension }),
        ...(reviewTopic.trim() && { reviewTopic: reviewTopic.trim() }),
        ...(worstDeathZone && { worstDeathZone: worstDeathZone as 'green' | 'orange' | 'red' }),
        ...(laneResult && { laneResult: laneResult as 'dominated' | 'even' | 'lost' }),
        ...(firstKeyItemMin && { firstKeyItemMin: parseInt(firstKeyItemMin, 10) }),
        ...(imported?.firstKeyItemName && { firstKeyItemName: imported.firstKeyItemName }),
        ...(goodInitiations && { goodInitiations: parseInt(goodInitiations, 10) }),
        ...(draftScore > 0 && { draftScore: draftScore as 1 | 2 | 3 | 4 | 5 }),
        ...(csAt10 && { csAt10: parseInt(csAt10, 10) }),
        ...(pendingSetup?.enemyCarry && { enemyCarry: pendingSetup.enemyCarry }),
        ...(cleanMatchId && { matchId: cleanMatchId }),
        ...(imported && {
          source: 'opendota' as const,
          heroId: imported.heroId,
          kills: imported.kills,
          deaths: imported.deaths,
          assists: imported.assists,
          lastHits: imported.lastHits,
          denies: imported.denies,
          dnAt10: imported.dnAt10,
          gpm: imported.gpm,
          xpm: imported.xpm,
          level: imported.level,
          laneRole: imported.laneRole,
          laneEfficiency: imported.laneEfficiency,
          laneKills: imported.laneKills,
          playerSlot: imported.playerSlot,
          isRadiant: imported.isRadiant,
          opendotaImportedAt: Date.now(),
        }),
        ...(notes.trim() && { notes: notes.trim() }),
        ...(reviewClipDeath.trim() && { reviewClipDeath: reviewClipDeath.trim() }),
        ...(reviewClipFight.trim() && { reviewClipFight: reviewClipFight.trim() }),
        ...(reviewClipObjective.trim() && { reviewClipObjective: reviewClipObjective.trim() }),
      }

      // 关联赛前设定
      if (currentAppState.pendingPreGameSetupId) {
        log.preGameSetupId = currentAppState.pendingPreGameSetupId
        await window.electronStore.updatePreGameSetup(
          currentAppState.pendingPreGameSetupId,
          { linkedMatchId: logId } // ✅ logId 此时已有正确值
        )
        await window.electronStore.setAppState({ pendingPreGameSetupId: undefined })
      }

      await window.electronStore.addMatchLog(log)
      navigate('/')
    } finally {
      setSaving(false)
    }
  }

  const handleImportOpenDota = async () => {
    const cleanMatchId = matchId.trim()
    if (!cleanMatchId) {
      setOpenDotaStatus('请先输入 Match ID。')
      return
    }
    if (matchLogs.some(l => l.matchId === cleanMatchId)) {
      setOpenDotaStatus('这个 Match ID 已经记录过了。')
      return
    }

    setImportingOpenDota(true)
    setOpenDotaStatus('')
    setCanRequestParse(false)
    try {
      const data = await window.electronStore.importOpenDotaMatch(cleanMatchId)
      applyImportedOpenDota(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setImportedMatch(null)
      setCanRequestParse(message.includes('解析') || message.includes('HTTP 500') || message.includes('HTTP 404'))
      setOpenDotaStatus(message)
    } finally {
      setImportingOpenDota(false)
    }
  }

  const handleAutoImportOpenDota = async (silent = false) => {
    if (autoImportingOpenDota || importingOpenDota || analyzingOpenDota || importedMatch) return
    if (!appState?.openDota?.accountId?.trim()) {
      if (!silent) setOpenDotaStatus('请先在设置页填写 OpenDota Account ID。')
      return
    }

    setAutoImportingOpenDota(true)
    setCanRequestParse(false)
    if (!silent) setOpenDotaStatus('正在从 OpenDota 自动同步最近一局未记录比赛…')
    try {
      const existingMatchIds = matchLogs.map(log => log.matchId).filter((id): id is string => Boolean(id))
      const data = await window.electronStore.autoImportLatestOpenDotaMatch(existingMatchIds)
      applyImportedOpenDota(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setImportedMatch(null)
      if (!silent || !message.includes('请先在设置页填写')) setOpenDotaStatus(message)
    } finally {
      setAutoImportingOpenDota(false)
    }
  }

  const handleLoadRecentOpenDotaMatches = async () => {
    if (!appState?.openDota?.accountId?.trim()) {
      setOpenDotaStatus('请先在设置页填写 OpenDota Account ID。')
      return
    }
    setLoadingRecentMatches(true)
    setOpenDotaStatus('正在拉取 OpenDota 最近 10 场…')
    try {
      const existingMatchIds = matchLogs.map(log => log.matchId).filter((id): id is string => Boolean(id))
      const rows = await window.electronStore.getRecentOpenDotaMatches(existingMatchIds)
      setRecentMatches(rows)
      setOpenDotaStatus(rows.length ? '已拉取最近 10 场，可选择一场导入。' : 'OpenDota 没有返回最近对局。')
    } catch (e) {
      setRecentMatches([])
      setOpenDotaStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingRecentMatches(false)
    }
  }

  const handleImportRecentMatch = async (row: OpenDotaRecentMatch) => {
    if (row.recorded || matchLogs.some(l => l.matchId === row.matchId)) {
      setOpenDotaStatus('这场比赛已经记录过了。')
      return
    }
    setMatchId(row.matchId)
    setImportingOpenDota(true)
    setCanRequestParse(false)
    setOpenDotaStatus(`正在导入 ${row.heroName ?? '这场比赛'}…`)
    try {
      const data = await window.electronStore.importOpenDotaMatch(row.matchId)
      applyImportedOpenDota(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setImportedMatch(null)
      setCanRequestParse(message.includes('解析') || message.includes('HTTP 500') || message.includes('HTTP 404'))
      setOpenDotaStatus(message)
    } finally {
      setImportingOpenDota(false)
    }
  }

  const applyImportedOpenDota = (data: OpenDotaImportedMatch) => {
    setImportedMatch(data)
    setMatchId(data.matchId)
    setHero(getOpenDotaHeroName(data.heroId))
    setResult(data.result)
    setDurationMin(String(data.durationMin))
    if (data.csAt10 !== undefined) setCsAt10(String(data.csAt10))
    if (data.firstKeyItemMin !== undefined) setFirstKeyItemMin(String(data.firstKeyItemMin))
    if (data.laneResult) setLaneResult(data.laneResult)
    setShowOptional(true)

    const kda = [data.kills, data.deaths, data.assists]
      .map(v => v ?? '-')
      .join('/')
    const keyItem = data.firstKeyItemName && data.firstKeyItemMin
      ? ` · ${data.firstKeyItemName} ${data.firstKeyItemMin}分`
      : ''
    const laneText = data.laneResult
      ? ` · 对线${data.laneResult === 'dominated' ? '压制' : data.laneResult === 'even' ? '持平' : '被压'}`
      : ''
    setOpenDotaStatus(`已导入：${getOpenDotaHeroName(data.heroId)} · ${data.result === 'win' ? '胜利' : '失败'} · KDA ${kda}${laneText}${keyItem}`)
  }

  useEffect(() => {
    if (autoImportAttempted || importedMatch || matchId.trim()) return
    if (!appState?.openDota?.accountId?.trim()) return
    setAutoImportAttempted(true)
    handleAutoImportOpenDota(true)
  }, [autoImportAttempted, importedMatch, matchId, appState?.openDota?.accountId, matchLogs])

  const handleAnalyzeAndImportOpenDota = async () => {
    const cleanMatchId = matchId.trim()
    if (!cleanMatchId) {
      setOpenDotaStatus('请先输入 Match ID。')
      return
    }
    if (matchLogs.some(l => l.matchId === cleanMatchId)) {
      setOpenDotaStatus('这个 Match ID 已经记录过了。')
      return
    }

    setAnalyzingOpenDota(true)
    setOpenDotaStatus('已请求 OpenDota 分析录像，正在等待详细数据返回。通常需要几十秒到几分钟。')
    setCanRequestParse(false)
    try {
      const data = await window.electronStore.analyzeAndImportOpenDotaMatch(cleanMatchId)
      applyImportedOpenDota(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setImportedMatch(null)
      setCanRequestParse(message.includes('解析') || message.includes('HTTP 500') || message.includes('HTTP 404'))
      setOpenDotaStatus(message)
    } finally {
      setAnalyzingOpenDota(false)
    }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
  const btnBase = "px-4 py-2 rounded-lg text-sm font-medium border transition-all"
  const btnActive = "border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)]"
  const btnInactive = "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--accent-border)]"

  return (
    <div className="p-6 space-y-6 max-w-lg mx-auto pb-24">
      <div>
        <button type="button" onClick={() => navigate(-1)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3 flex items-center gap-1">
          ← 返回
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">赛后记录</h1>
        {pendingSetup && (
          <p className="text-sm text-[var(--accent-strong)] mt-1">
            关联赛前设定：{pendingSetup.hero} · {pendingSetup.trainingGoal}{pendingSetup.enemyCarry ? ` · 对方1号位 ${pendingSetup.enemyCarry}` : ''}
          </p>
        )}
      </div>

      {/* OpenDota 导入 */}
      <div className="space-y-2 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">OpenDota</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">进入页面会尝试同步最近一局；也可手动输入 Match ID</p>
          </div>
          {importedMatch && (
            <span className="text-xs px-2 py-1 rounded bg-[var(--bg-info)] text-[var(--text-info)] border border-[var(--border-info)]">
              已导入
            </span>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="text"
            inputMode="numeric"
            value={matchId}
            onChange={e => {
              setMatchId(e.target.value)
              if (importedMatch?.matchId !== e.target.value.trim()) setImportedMatch(null)
            }}
            placeholder="Match ID"
            className={inputCls}
          />
          <button
            type="button"
            onClick={handleImportOpenDota}
            disabled={importingOpenDota || autoImportingOpenDota || analyzingOpenDota || !matchId.trim()}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {importingOpenDota ? '导入中…' : '导入'}
          </button>
          <button
            type="button"
            onClick={() => handleAutoImportOpenDota(false)}
            disabled={importingOpenDota || autoImportingOpenDota || analyzingOpenDota}
            className="px-4 py-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-strong)] text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {autoImportingOpenDota ? '同步中…' : '同步最近一局'}
          </button>
        </div>
        <button
          type="button"
          onClick={handleLoadRecentOpenDotaMatches}
          disabled={loadingRecentMatches || importingOpenDota || autoImportingOpenDota || analyzingOpenDota}
          className="w-full py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium hover:border-[var(--accent-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loadingRecentMatches ? '拉取中…' : '查看最近 10 场'}
        </button>
        {recentMatches.length > 0 && (
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2">
            {recentMatches.map(row => (
              <button
                key={row.matchId}
                type="button"
                onClick={() => handleImportRecentMatch(row)}
                disabled={row.recorded || importingOpenDota || analyzingOpenDota}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-left transition-colors hover:border-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-[var(--text-primary)]">{row.heroName ?? `英雄 ${row.heroId ?? '-'}`}</span>
                  <span className={`text-xs ${row.result === 'win' ? 'text-[var(--text-success)]' : row.result === 'loss' ? 'text-[var(--text-danger)]' : 'text-[var(--text-muted)]'}`}>{row.recorded ? '已记录' : row.result === 'win' ? '胜' : row.result === 'loss' ? '败' : '未知'}</span>
                </div>
                <div className="number mt-1 text-xs text-[var(--text-muted)]">
                  {row.timestamp ? new Date(row.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '时间未知'} · {row.durationMin ? `${row.durationMin}m` : '时长未知'} · KDA {row.kills ?? '-'}/{row.deaths ?? '-'}/{row.assists ?? '-'} · {row.matchId}
                </div>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={handleAnalyzeAndImportOpenDota}
          disabled={importingOpenDota || analyzingOpenDota || !matchId.trim()}
          className="w-full py-2 rounded-lg border border-[var(--border-info)] bg-[var(--bg-info)] text-[var(--text-info)] text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {analyzingOpenDota ? '分析并等待数据中…' : '请求分析并自动导入'}
        </button>
        {openDotaStatus && (
          <p className={`text-xs ${importedMatch ? 'text-[var(--text-info)]' : 'text-[var(--text-warning)]'}`}>
            {openDotaStatus}
          </p>
        )}
        {canRequestParse && !importedMatch && (
          <button
            type="button"
            onClick={handleAnalyzeAndImportOpenDota}
            disabled={analyzingOpenDota}
            className="w-full py-2 rounded-lg border border-orange-500/50 bg-orange-500/10 text-orange-300 text-sm font-medium hover:bg-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {analyzingOpenDota ? '分析并等待数据中…' : '请求分析并自动导入'}
          </button>
        )}
        {importedMatch && (
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
            <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
              KDA <span className="text-[var(--text-primary)]">{importedMatch.kills ?? '-'}/{importedMatch.deaths ?? '-'}/{importedMatch.assists ?? '-'}</span>
            </div>
            <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
              GPM/XPM <span className="text-[var(--text-primary)]">{importedMatch.gpm ?? '-'}/{importedMatch.xpm ?? '-'}</span>
            </div>
            <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
              LH/DN <span className="text-[var(--text-primary)]">{importedMatch.lastHits ?? '-'}/{importedMatch.denies ?? '-'}</span>
            </div>
            <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] col-span-3">
              对线 <span className="text-[var(--text-primary)]">
                {importedMatch.laneResult
                  ? `${importedMatch.laneResult === 'dominated' ? '压制' : importedMatch.laneResult === 'even' ? '持平' : '被压'}${importedMatch.laneEfficiency !== undefined ? ` · 效率 ${Math.round(importedMatch.laneEfficiency)}%` : ''}${importedMatch.laneKills !== undefined ? ` · 对线单位击杀 ${importedMatch.laneKills}` : ''}`
                  : 'OpenDota 未返回对线明细'}
              </span>
            </div>
            <div className="px-2 py-1.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] col-span-3">
              关键装 <span className="text-[var(--text-primary)]">{importedMatch.firstKeyItemName && importedMatch.firstKeyItemMin ? `${importedMatch.firstKeyItemName} · ${importedMatch.firstKeyItemMin} 分` : '未命中规则'}</span>
            </div>
          </div>
        )}
      </div>

      {/* 必填：英雄 */}
      <HeroSelector
        label="本局英雄 *"
        value={hero}
        onChange={setHero}
        heroPool={heroPool.length > 0 ? heroPool : undefined}
      />

      {/* 必填：胜负 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">胜负 *</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setResult('win')} className={`${btnBase} flex-1 ${result === 'win' ? 'border-green-500 bg-[var(--bg-success)] text-[var(--text-success)]' : btnInactive}`}>胜利</button>
          <button type="button" onClick={() => setResult('loss')} className={`${btnBase} flex-1 ${result === 'loss' ? 'border-red-500 bg-[var(--bg-danger)] text-[var(--text-danger)]' : btnInactive}`}>失败</button>
        </div>
      </div>

      {/* 必填：时长 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">时长（分钟）*</label>
        <input type="number" value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="如：42" className={inputCls} />
      </div>

      {/* 必填：训练目标完成了吗 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          训练目标完成了吗？*
          {pendingSetup && <span className="ml-2 text-[var(--accent-strong)] font-normal normal-case">目标：{pendingSetup.trainingGoal}</span>}
        </label>
        <div className="flex gap-2">
          {(['yes', 'partial', 'no'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setTrainingGoalMet(v)}
              className={`${btnBase} flex-1 ${trainingGoalMet === v ? btnActive : btnInactive}`}
            >
              {v === 'yes' ? '完成' : v === 'partial' ? '部分' : '未完成'}
            </button>
          ))}
        </div>
      </div>

      {/* 必填：最大错误 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">最大错误（一句话）*</label>
        <textarea
          value={biggestMistake}
          onChange={e => setBiggestMistake(e.target.value)}
          placeholder="这局最大的失误是什么？"
          rows={2}
          className={`${inputCls} resize-none`}
        />
      </div>

      {/* 复盘归因 */}
      <div className="space-y-3">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">这局主要问题属于哪个判断？</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REVIEW_DIMENSIONS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setReviewDimension(item.id === reviewDimension ? '' : item.id)
                setReviewTopic('')
              }}
              className={`text-left px-3 py-2 rounded-lg border transition-all ${
                reviewDimension === item.id ? btnActive : btnInactive
              }`}
            >
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block text-xs opacity-80 mt-0.5">{item.description}</span>
            </button>
          ))}
        </div>
        {selectedReviewDimension && (
          <QuickSelect
            label="具体判断问题"
            options={selectedReviewDimension.topics}
            value={reviewTopic}
            onChange={setReviewTopic}
            placeholder="自定义判断问题…"
          />
        )}
      </div>

      {/* 必填：下局改进点 */}
      <QuickSelect
        label="下局唯一改进点 *"
        options={quickFocusOptions}
        value={nextGameFocus}
        onChange={setNextGameFocus}
        placeholder="自定义改进点…"
      />
      {lastSameHeroMatch && previousHeroFocus && (
        <p className="text-xs text-[var(--text-muted)] -mt-4">
          已提取上次使用 {selectedHero} 的改进点：{previousHeroFocus}
          <span className="ml-1">（{new Date(lastSameHeroMatch.timestamp).toLocaleDateString('zh-CN')}）</span>
        </p>
      )}

      {/* P1：3 片段复盘 */}
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">3 片段复盘</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">每个片段只写时间点和一句判断，下次复盘才有抓手。</p>
        </div>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[var(--text-muted)]">关键死亡片段</span>
          <textarea value={reviewClipDeath} onChange={e => setReviewClipDeath(e.target.value)} placeholder="如：18:40 红区收线没看到双辅助，应该先等线进塔。" rows={2} className={`${inputCls} resize-none`} />
        </label>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[var(--text-muted)]">关键团战片段</span>
          <textarea value={reviewClipFight} onChange={e => setReviewClipFight(e.target.value)} placeholder="如：26:10 先手目标错了，应该等对方核心露头。" rows={2} className={`${inputCls} resize-none`} />
        </label>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-[var(--text-muted)]">关键目标片段</span>
          <textarea value={reviewClipObjective} onChange={e => setReviewClipObjective(e.target.value)} placeholder="如：32:00 赢团后追人，没有转 Roshan 或推塔。" rows={2} className={`${inputCls} resize-none`} />
        </label>
      </div>

      {/* 选填折叠 */}
      <div>
        <button
          type="button"
          onClick={() => setShowOptional(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <span>选填项（对线结果、首件、补刀等）</span>
          <span>{showOptional ? '▲ 收起' : '▼ 展开'}</span>
        </button>

        {showOptional && (
          <div className="mt-3 space-y-4 px-1">
            {/* 死亡区域 */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">最蠢死亡区域</label>
              <div className="flex gap-2">
                {(['green', 'orange', 'red'] as const).map(z => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setWorstDeathZone(z === worstDeathZone ? '' : z)}
                    className={`${btnBase} flex-1 ${worstDeathZone === z ? btnActive : btnInactive}`}
                  >
                    {z === 'green' ? '绿区' : z === 'orange' ? '橙区' : '红区'}
                  </button>
                ))}
              </div>
            </div>

            {/* 对线结果 */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">对线结果</label>
              <div className="flex gap-2">
                {(['dominated', 'even', 'lost'] as const).map(lr => (
                  <button
                    key={lr}
                    type="button"
                    onClick={() => setLaneResult(lr === laneResult ? '' : lr)}
                    className={`${btnBase} flex-1 ${laneResult === lr ? btnActive : btnInactive}`}
                  >
                    {lr === 'dominated' ? '压制' : lr === 'even' ? '持平' : '被压'}
                  </button>
                ))}
              </div>
            </div>

            {/* 首件时间 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">第一件关键装（分钟）</label>
                <input type="number" value={firstKeyItemMin} onChange={e => setFirstKeyItemMin(e.target.value)} placeholder="如：18" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">10 分钟补刀</label>
                <input type="number" value={csAt10} onChange={e => setCsAt10(e.target.value)} placeholder="如：65" className={inputCls} />
              </div>
            </div>

            {/* 开团次数 + Draft 评分 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">开团成功次数</label>
                <input type="number" value={goodInitiations} onChange={e => setGoodInitiations(e.target.value)} placeholder="如：3" className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">Draft 评分（1-5）</label>
                <div className="flex gap-1">
                  {([1, 2, 3, 4, 5] as const).map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setDraftScore(draftScore === n ? 0 : n)}
                      className={`w-8 h-8 rounded text-sm font-medium border transition-all ${draftScore === n ? btnActive : btnInactive}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Match ID */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">Match ID</label>
              <input
                type="text"
                inputMode="numeric"
                value={matchId}
                onChange={e => setMatchId(e.target.value)}
                placeholder="可手动填写或从 OpenDota 导入"
                className={inputCls}
              />
            </div>

            {/* 备注 */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">备注</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="自由文本备注…"
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>
        )}
      </div>

      {/* 保存按钮 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[var(--bg)] border-t border-[var(--border)]">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full py-3 rounded-xl font-semibold text-sm bg-[var(--accent)] text-[var(--text-primary)] hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? '保存中…' : '保存对局记录'}
        </button>
      </div>
    </div>
  )
}

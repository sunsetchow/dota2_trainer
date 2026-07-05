import { useState, useEffect, useCallback } from 'react'
import type { AppState, MatchLog, PreGameSetup, DailyCheckin, MMRLog, HeroNote, TrainingCycle } from '../types'

// ── useAppState
export function useAppState() {
  const [appState, setAppState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const s = await window.electronStore.getAppState()
    setAppState(s)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const update = useCallback(async (partial: Partial<AppState>) => {
    await window.electronStore.setAppState(partial)
    await refresh()
  }, [refresh])

  return { appState, loading, refresh, update }
}

// ── useMatchLogs
export function useMatchLogs() {
  const [matchLogs, setMatchLogs] = useState<MatchLog[]>([])

  const refresh = useCallback(async () => {
    const logs = await window.electronStore.getMatchLogs()
    setMatchLogs(logs)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const add = useCallback(async (log: MatchLog) => {
    await window.electronStore.addMatchLog(log)
    await refresh()
  }, [refresh])

  const update = useCallback(async (id: string, patch: Partial<MatchLog>) => {
    await window.electronStore.updateMatchLog(id, patch)
    await refresh()
  }, [refresh])

  return { matchLogs, refresh, add, update }
}

// ── usePreGameSetups
export function usePreGameSetups() {
  const [setups, setSetups] = useState<PreGameSetup[]>([])

  const refresh = useCallback(async () => {
    const data = await window.electronStore.getPreGameSetups()
    setSetups(data)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const add = useCallback(async (setup: PreGameSetup) => {
    await window.electronStore.addPreGameSetup(setup)
    await refresh()
  }, [refresh])

  return { setups, refresh, add }
}

// ── useDailyCheckins
export function useDailyCheckins() {
  const [checkins, setCheckins] = useState<DailyCheckin[]>([])

  const refresh = useCallback(async () => {
    const data = await window.electronStore.getDailyCheckins()
    setCheckins(data)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const upsert = useCallback(async (checkin: DailyCheckin) => {
    await window.electronStore.upsertDailyCheckin(checkin)
    await refresh()
  }, [refresh])

  return { checkins, refresh, upsert, add: upsert }
}

// ── useMMRLogs
export function useMMRLogs() {
  const [mmrLogs, setMmrLogs] = useState<MMRLog[]>([])

  const refresh = useCallback(async () => {
    const data = await window.electronStore.getMMRLogs()
    setMmrLogs(data)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // 同一天已经有记录时替换掉（补录漏打的某一天），而不是不断堆出重复记录。
  const add = useCallback(async (log: MMRLog) => {
    await window.electronStore.upsertMMRLog(log)
    await refresh()
  }, [refresh])

  return { mmrLogs, refresh, add }
}

// ── useHeroNotes
export function useHeroNotes() {
  const [heroNotes, setHeroNotes] = useState<HeroNote[]>([])

  const refresh = useCallback(async () => {
    const data = await window.electronStore.getHeroNotes()
    setHeroNotes(data)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const upsert = useCallback(async (note: HeroNote) => {
    await window.electronStore.upsertHeroNote(note)
    await refresh()
  }, [refresh])

  return { heroNotes, refresh, upsert }
}

// ── useCycles
export function useCycles() {
  const [cycles, setCycles] = useState<TrainingCycle[]>([])

  const refresh = useCallback(async () => {
    const data = await window.electronStore.getCycles()
    setCycles(data)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const add = useCallback(async (cycle: TrainingCycle) => {
    await window.electronStore.addCycle(cycle)
    await refresh()
  }, [refresh])

  return { cycles, refresh, add }
}

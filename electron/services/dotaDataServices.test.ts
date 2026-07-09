import { beforeEach, describe, expect, it, vi } from 'vitest'

const storeState = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
}))

vi.mock('../store.ts', () => ({
  default: {
    get: vi.fn((key: string, defaultValue?: unknown) => storeState.values.get(key) ?? defaultValue),
    set: vi.fn((key: string, value: unknown) => storeState.values.set(key, value)),
  },
}))

import { createDotaDataServices } from './dotaDataServices.ts'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

describe('Dota data OpenDota recent match import', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    storeState.values.clear()
    storeState.values.set('appState', {
      openDota: {
        accountId: '42',
        apiKey: '',
      },
    })
  })

  it('skips match IDs already persisted in matchLogs even when renderer has not loaded them yet', async () => {
    storeState.values.set('matchLogs', [{ id: 'log-1', matchId: '111' }])
    const fetchMock = vi.fn(async (url: string | URL) => {
      const path = new URL(String(url)).pathname
      if (path === '/api/players/42/recentMatches') {
        return jsonResponse([
          { match_id: 111, hero_id: 2, start_time: 1, duration: 2400, radiant_win: true, player_slot: 0 },
          { match_id: 222, hero_id: 2, start_time: 2, duration: 1800, radiant_win: false, player_slot: 128 },
        ])
      }
      if (path === '/api/matches/222') {
        return jsonResponse({
          match_id: 222,
          duration: 1800,
          start_time: 2,
          radiant_win: false,
          players: [
            { account_id: 42, player_slot: 128, hero_id: 2, kills: 7, deaths: 3, assists: 11 },
            { account_id: 7, player_slot: 0, hero_id: 13 },
          ],
        })
      }
      if (path === '/api/benchmarks') {
        return jsonResponse({
          hero_id: 2,
          result: {
            gold_per_min: [{ percentile: 0.5, value: 400 }],
          },
        })
      }
      throw new Error(`unexpected fetch ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const imported = await createDotaDataServices().autoImportLatestOpenDotaMatch([])

    const fetchedPaths = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)

    expect(imported.matchId).toBe('222')
    expect(fetchedPaths).not.toContain('/api/matches/111')
    expect(fetchedPaths).toEqual([
      '/api/players/42/recentMatches',
      '/api/matches/222',
      '/api/benchmarks',
    ])
  })

  it('marks recent matches as recorded using persisted matchLogs when renderer passes a stale empty list', async () => {
    storeState.values.set('matchLogs', [{ id: 'log-1', matchId: '111' }])
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { match_id: 111, hero_id: 2, start_time: 1, duration: 2400, radiant_win: true, player_slot: 0 },
      { match_id: 222, hero_id: 13, start_time: 2, duration: 1800, radiant_win: false, player_slot: 128 },
    ])))

    const rows = await createDotaDataServices().listRecentOpenDotaMatches([])

    expect(rows.map(row => ({ matchId: row.matchId, recorded: row.recorded }))).toEqual([
      { matchId: '111', recorded: true },
      { matchId: '222', recorded: false },
    ])
  })
})


describe('Dota data OpenDota hero timing sync', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    storeState.values.clear()
    storeState.values.set('appState', { openDota: { accountId: '42', apiKey: '' } })
  })

  it('returns fresh hero timing cache without fetching', async () => {
    const syncedAt = Date.now()
    storeState.values.set('heroTimingCache', {
      source: 'opendota',
      syncedAt,
      date: '2026-07-03',
      version: 1,
      heroCount: 1,
      profiles: {
        '155': {
          heroId: 155,
          displayName: '朗戈',
          localizedName: 'Largo',
          early: { winRate: 0.52, games: 448 },
          mid: { winRate: 0.55, games: 618 },
          late: { winRate: null, games: 169 },
          veryLate: { winRate: null, games: 47 },
          timingLabel: 'mid',
          totalGames: 1282,
          confidence: 'medium',
        },
      },
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createDotaDataServices().syncHeroTimings(false)).resolves.toEqual({ cached: true, heroCount: 1, errors: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails fast when OpenDota durations are unavailable instead of looking stuck for every hero', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'forbidden' }, 403))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createDotaDataServices().syncHeroTimings(true)).rejects.toThrow(/OpenDota hero timing 数据同步失败/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns the previous timing cache immediately when a forced refresh cannot reach OpenDota durations', async () => {
    storeState.values.set('heroTimingCache', {
      source: 'opendota',
      syncedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
      date: '2026-07-03',
      version: 1,
      heroCount: 1,
      profiles: {
        '155': {
          heroId: 155,
          displayName: '朗戈',
          localizedName: 'Largo',
          early: { winRate: 0.52, games: 448 },
          mid: { winRate: 0.55, games: 618 },
          late: { winRate: null, games: 169 },
          veryLate: { winRate: null, games: 47 },
          timingLabel: 'mid',
          totalGames: 1282,
          confidence: 'medium',
        },
      },
    })
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'forbidden' }, 403))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createDotaDataServices().syncHeroTimings(true)).resolves.toMatchObject({
      cached: false,
      heroCount: 1,
      errors: [expect.stringContaining('OpenDota 请求失败')],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('syncs durations into canonical display-name timing profiles', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string | URL) => {
      const path = new URL(String(url)).pathname
      if (!path.endsWith('/durations')) throw new Error(`unexpected fetch ${path}`)
      return jsonResponse([
        { duration_bin: 900, games_played: 250, wins: 125 },
        { duration_bin: 1800, games_played: 220, wins: 120 },
        { duration_bin: 2400, games_played: 400, wins: 230 },
        { duration_bin: 3300, games_played: 80, wins: 45 },
      ])
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = createDotaDataServices().syncHeroTimings(true)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.cached).toBe(false)
    expect(result.heroCount).toBeGreaterThan(100)
    const cache = storeState.values.get('heroTimingCache') as any
    expect(cache.profiles['155']).toMatchObject({
      heroId: 155,
      displayName: '朗戈',
      localizedName: 'Largo',
      timingLabel: 'mid',
    })
    expect(cache.profiles['155'].late.winRate).toBeNull()
    vi.useRealTimers()
  })

  it('records a malformed hero duration response as an error without dropping other profiles', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        return jsonResponse([{ duration_bin: 900, games_played: 10, wins: 11 }])
      }
      return jsonResponse([
        { duration_bin: 900, games_played: 250, wins: 125 },
        { duration_bin: 1800, games_played: 220, wins: 120 },
        { duration_bin: 2400, games_played: 400, wins: 230 },
      ])
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = createDotaDataServices().syncHeroTimings(true)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.cached).toBe(false)
    expect(result.heroCount).toBeGreaterThan(100)
    expect(result.errors.some(error => error.includes('wins 大于 games_played'))).toBe(true)
    const cache = storeState.values.get('heroTimingCache') as any
    expect(cache.heroCount).toBe(result.heroCount)
    vi.useRealTimers()
  })
})

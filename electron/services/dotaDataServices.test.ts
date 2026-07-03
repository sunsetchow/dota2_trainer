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

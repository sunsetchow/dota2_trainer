import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import {
  applyStaleTimeout,
  deriveDraftSnapshot,
  GSI_STALE_AFTER_MS,
  INITIAL_DRAFT_GSI_SNAPSHOT,
  parseGsiDraftPayload,
} from './gsiDraft.ts'

// Fixtures are hand-written synthetic samples, not captured from a real Dota 2
// client — see electron/services/__fixtures__/gsiDraftSamples/FINDINGS.md.
// 30.0 (the mandatory feasibility PoC gate) was not performed in this environment.
function loadFixture(name: string): unknown[] {
  const path = fileURLToPath(
    new URL(`../../electron/services/__fixtures__/gsiDraftSamples/${name}.jsonl`, import.meta.url),
  )
  return readFileSync(path, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

describe('parseGsiDraftPayload', () => {
  it('returns null instead of throwing for non-object / garbage input', () => {
    expect(parseGsiDraftPayload('not an object')).toBeNull()
    expect(parseGsiDraftPayload(null)).toBeNull()
    expect(parseGsiDraftPayload(undefined)).toBeNull()
    expect(parseGsiDraftPayload(42)).toBeNull()
  })

  it('accepts a bare heartbeat payload with no draft field', () => {
    expect(parseGsiDraftPayload({ provider: { name: 'Dota 2' } })).not.toBeNull()
  })
})

describe('deriveDraftSnapshot', () => {
  it('walks the synthetic captains-mode fixture to 4 deduped enemy hero ids, ignoring picks that arrive after game start', () => {
    const lines = loadFixture('captains-mode')
    let snapshot = INITIAL_DRAFT_GSI_SNAPSHOT
    for (const raw of lines) {
      const payload = parseGsiDraftPayload(raw)
      expect(payload).not.toBeNull()
      snapshot = deriveDraftSnapshot(snapshot, payload!, 1_000)
    }
    expect(snapshot.enemyHeroIds).toEqual([14, 26, 44, 50])
  })

  it('does not update enemyHeroIds once map.game_state reports the game in progress', () => {
    const draftPayload = parseGsiDraftPayload({
      map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
      draft: { team2: { picks: [1, 2] } },
    })!
    const inProgressPayload = parseGsiDraftPayload({
      map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
      draft: { team2: { picks: [1, 2, 3, 4] } },
    })!

    const afterDraft = deriveDraftSnapshot(INITIAL_DRAFT_GSI_SNAPSHOT, draftPayload, 1_000)
    expect(afterDraft.enemyHeroIds).toEqual([1, 2])

    const afterProgress = deriveDraftSnapshot(afterDraft, inProgressPayload, 2_000)
    expect(afterProgress.enemyHeroIds).toEqual([1, 2])
  })

  it('deduplicates repeated hero ids seen across multiple payloads', () => {
    const first = deriveDraftSnapshot(
      INITIAL_DRAFT_GSI_SNAPSHOT,
      parseGsiDraftPayload({ draft: { team2: { picks: [5] } } })!,
      1_000,
    )
    expect(first.enemyHeroIds).toEqual([5])

    const second = deriveDraftSnapshot(
      first,
      parseGsiDraftPayload({ draft: { team2: { picks: [5, 9] } } })!,
      2_000,
    )
    expect(second.enemyHeroIds).toEqual([5, 9])
  })

  it('the synthetic all-pick fixture (unverified hypothesis: no draft field ever appears) never yields enemy hero ids', () => {
    const lines = loadFixture('all-pick')
    let snapshot = INITIAL_DRAFT_GSI_SNAPSHOT
    for (const raw of lines) {
      const payload = parseGsiDraftPayload(raw)
      expect(payload).not.toBeNull()
      snapshot = deriveDraftSnapshot(snapshot, payload!, 1_000)
    }
    expect(snapshot.enemyHeroIds).toEqual([])
  })

  it('the synthetic ranked-all-pick fixture (unverified hypothesis: intermittent coverage) parses every line without throwing and keeps the one pick it did see', () => {
    const lines = loadFixture('ranked-all-pick')
    let snapshot = INITIAL_DRAFT_GSI_SNAPSHOT
    for (const raw of lines) {
      const payload = parseGsiDraftPayload(raw)
      expect(payload).not.toBeNull()
      snapshot = deriveDraftSnapshot(snapshot, payload!, 1_000)
    }
    expect(snapshot.enemyHeroIds).toEqual([6])
  })
})

describe('applyStaleTimeout', () => {
  it('downgrades a connected/in_draft snapshot to stale once the heartbeat timeout elapses, without clearing enemyHeroIds', () => {
    const snapshot = deriveDraftSnapshot(
      INITIAL_DRAFT_GSI_SNAPSHOT,
      parseGsiDraftPayload({ draft: { team2: { picks: [5] } } })!,
      1_000,
    )
    expect(snapshot.status).toBe('in_draft')

    const stillFresh = applyStaleTimeout(snapshot, 1_000 + GSI_STALE_AFTER_MS - 1)
    expect(stillFresh.status).toBe('in_draft')

    const stale = applyStaleTimeout(snapshot, 1_000 + GSI_STALE_AFTER_MS + 1)
    expect(stale.status).toBe('stale')
    expect(stale.enemyHeroIds).toEqual([5])
  })

  it('leaves a disconnected snapshot untouched', () => {
    expect(applyStaleTimeout(INITIAL_DRAFT_GSI_SNAPSHOT, 999_999)).toEqual(INITIAL_DRAFT_GSI_SNAPSHOT)
  })
})

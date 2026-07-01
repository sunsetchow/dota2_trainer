import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const heroesPath = resolve(repoRoot, 'src/data/opendotaHeroes.json')
const snapshotPath = resolve(repoRoot, 'src/data/heroMatchupSnapshot.json')
const OPEN_DOTA_BASE_URL = 'https://api.opendota.com/api'
const STRATZ_GRAPHQL_URL = 'https://api.stratz.com/graphql'
// Stratz 在 Cloudflare 后面，默认 UA 会被当机器人拦截返回验证页而不是 JSON（已实测确认）。
const STRATZ_USER_AGENT = 'STRATZ_API'
const STRATZ_API_KEY = process.env.STRATZ_API_KEY
const STRATZ_RANK_BRACKET = process.env.STRATZ_RANK_BRACKET || 'ALL'
// Stratz 的 bracketBasicIds 枚举里没有真正代表"聚合全部分段"的值——传字面量 "ALL" 实测返回空数据，
// 要拿到聚合结果得显式列出四个真实分段（已用真实 API 核对，等价于完全不传该参数的默认行为）。
const STRATZ_ALL_BRACKETS = ['HERALD_GUARDIAN', 'CRUSADER_ARCHON', 'LEGEND_ANCIENT', 'DIVINE_IMMORTAL']
const STRATZ_BRACKET_ARG = STRATZ_RANK_BRACKET === 'ALL' ? STRATZ_ALL_BRACKETS : [STRATZ_RANK_BRACKET]
const USE_STRATZ = Boolean(STRATZ_API_KEY)
const RATE_LIMIT_DELAY_MS = Number(process.env.OPENDOTA_MATCHUP_DELAY_MS ?? (USE_STRATZ ? 250 : 1100))
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const HERO_VS_HERO_MATCHUP_QUERY = `
  query HeroVsHeroMatchup($heroId: Short!, $bracketBasicIds: [RankBracketBasicEnum]) {
    heroStats {
      heroVsHeroMatchup(heroId: $heroId, bracketBasicIds: $bracketBasicIds) {
        advantage {
          heroId
          matchCountVs
          vs { heroId2 winsAverage matchCount }
        }
      }
    }
  }
`

const args = new Set(process.argv.slice(2))
const validateOnly = args.has('--validate-only')
const missingOnly = args.has('--missing-only')
const allowPartial = args.has('--allow-partial')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function dateKeyFromDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getIsoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function heroDisplayName(hero) {
  return hero.displayName || hero.localizedName
}

function validateSnapshot(snapshot, heroes) {
  const expectedNames = new Set(heroes.map(heroDisplayName))
  const matchups = snapshot.matchups ?? {}
  const outerNames = new Set(Object.keys(matchups))
  const innerNames = new Set()
  const errors = []

  for (const [hero, row] of Object.entries(matchups)) {
    if (!expectedNames.has(hero)) errors.push(`Unexpected outer hero: ${hero}`)
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`Invalid matchup row for ${hero}`)
      continue
    }
    for (const [enemy, stats] of Object.entries(row)) {
      innerNames.add(enemy)
      if (!expectedNames.has(enemy)) errors.push(`Unexpected enemy hero: ${hero} -> ${enemy}`)
      if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
        errors.push(`Invalid stats object: ${hero} -> ${enemy}`)
        continue
      }
      const { gamesPlayed, wins, winRate, advantage } = stats
      if (!Number.isFinite(gamesPlayed) || gamesPlayed <= 0) errors.push(`Invalid gamesPlayed: ${hero} -> ${enemy}`)
      if (!Number.isFinite(wins) || wins < 0) errors.push(`Invalid wins: ${hero} -> ${enemy}`)
      if (!Number.isFinite(winRate)) errors.push(`Invalid winRate: ${hero} -> ${enemy}`)
      if (!Number.isFinite(advantage)) errors.push(`Invalid advantage: ${hero} -> ${enemy}`)
      if (Number.isFinite(winRate) && Number.isFinite(advantage) && Math.abs((winRate - 50) - advantage) > 1e-6) {
        errors.push(`Advantage mismatch: ${hero} -> ${enemy}`)
      }
    }
  }

  const missingOuter = [...expectedNames].filter(name => !outerNames.has(name)).sort()
  const missingInner = [...expectedNames].filter(name => !innerNames.has(name)).sort()
  const matchupCount = Object.values(matchups).reduce((sum, row) => sum + Object.keys(row ?? {}).length, 0)

  if (snapshot.heroCount !== outerNames.size) errors.push(`heroCount mismatch: metadata=${snapshot.heroCount}, actual=${outerNames.size}`)
  if (snapshot.matchupCount !== matchupCount) errors.push(`matchupCount mismatch: metadata=${snapshot.matchupCount}, actual=${matchupCount}`)
  if (missingOuter.length > 0) errors.push(`Missing outer heroes: ${missingOuter.join(', ')}`)
  if (missingInner.length > 0) errors.push(`Missing inner heroes: ${missingInner.join(', ')}`)
  if (snapshot.complete !== (missingOuter.length === 0 && (snapshot.errors?.length ?? 0) === 0)) {
    errors.push(`complete flag mismatch: metadata=${snapshot.complete}`)
  }

  return {
    errors,
    expectedHeroCount: expectedNames.size,
    outerHeroCount: outerNames.size,
    innerHeroCount: innerNames.size,
    matchupCount,
    missingOuter,
    missingInner,
  }
}

async function fetchHeroMatchups(hero, nameById) {
  const url = new URL(`${OPEN_DOTA_BASE_URL}/heroes/${hero.id}/matchups`)
  if (process.env.OPENDOTA_API_KEY) url.searchParams.set('api_key', process.env.OPENDOTA_API_KEY)

  const response = await fetch(url, {
    headers: { 'User-Agent': 'dota2-trainer-matchup-snapshot/1.0' },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${body}`)
  }

  const rows = await response.json()
  const heroMatchups = {}
  for (const row of rows) {
    if (!row.hero_id || !row.games_played || row.wins === undefined) continue
    const enemyName = nameById.get(row.hero_id)
    if (!enemyName) continue
    const winRate = (row.wins / row.games_played) * 100
    heroMatchups[enemyName] = {
      gamesPlayed: row.games_played,
      wins: row.wins,
      winRate,
      advantage: winRate - 50,
    }
  }
  return heroMatchups
}

async function fetchStratzHeroMatchups(hero, nameById) {
  const response = await fetch(STRATZ_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STRATZ_API_KEY}`,
      'User-Agent': STRATZ_USER_AGENT,
    },
    body: JSON.stringify({
      query: HERO_VS_HERO_MATCHUP_QUERY,
      variables: { heroId: hero.id, bracketBasicIds: STRATZ_BRACKET_ARG },
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${body}`)
  }

  const json = await response.json()
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '))

  // ⚠️ heroVsHeroMatchup 本身是个对象（不是数组），advantage 才是数组。
  const rows = json.data?.heroStats?.heroVsHeroMatchup?.advantage?.[0]?.vs ?? []
  const heroMatchups = {}
  for (const row of rows) {
    if (!row.heroId2 || !row.matchCount) continue
    const enemyName = nameById.get(row.heroId2)
    if (!enemyName) continue
    const winRate = row.winsAverage * 100
    heroMatchups[enemyName] = {
      gamesPlayed: row.matchCount,
      wins: Math.round(row.matchCount * row.winsAverage),
      winRate,
      advantage: winRate - 50,
    }
  }
  return heroMatchups
}

async function main() {
  const heroes = await readJson(heroesPath)
  const existingSnapshot = await readJson(snapshotPath).catch(() => ({ matchups: {} }))
  const nameById = new Map(heroes.map(hero => [hero.id, heroDisplayName(hero)]))

  if (validateOnly) {
    const result = validateSnapshot(existingSnapshot, heroes)
    console.log(JSON.stringify(result, null, 2))
    if (result.errors.length > 0) process.exit(1)
    return
  }

  const existingMatchups = existingSnapshot.matchups ?? {}
  const heroesToFetch = missingOnly
    ? heroes.filter(hero => !existingMatchups[heroDisplayName(hero)])
    : heroes

  const matchups = missingOnly ? { ...existingMatchups } : {}
  const errors = []

  console.log(USE_STRATZ ? `使用 Stratz（分段 ${STRATZ_RANK_BRACKET}）` : '使用 OpenDota（无 STRATZ_API_KEY 环境变量）')

  for (const [index, hero] of heroesToFetch.entries()) {
    const name = heroDisplayName(hero)
    process.stdout.write(`[${index + 1}/${heroesToFetch.length}] ${name} ... `)
    try {
      matchups[name] = USE_STRATZ
        ? await fetchStratzHeroMatchups(hero, nameById)
        : await fetchHeroMatchups(hero, nameById)
      console.log(`${Object.keys(matchups[name]).length} rows`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${name}: ${message}`)
      console.log(`ERROR ${message}`)
    }
    if (index < heroesToFetch.length - 1) await sleep(RATE_LIMIT_DELAY_MS)
  }

  const syncedAt = Date.now()
  const orderedMatchups = {}
  for (const hero of heroes) {
    const name = heroDisplayName(hero)
    if (matchups[name]) orderedMatchups[name] = matchups[name]
  }

  const snapshot = {
    source: USE_STRATZ ? 'stratz' : 'opendota',
    version: 1,
    syncedAt,
    date: dateKeyFromDate(new Date(syncedAt)),
    weekKey: getIsoWeekKey(new Date(syncedAt)),
    expiresAt: syncedAt + CACHE_TTL_MS,
    complete: errors.length === 0 && Object.keys(orderedMatchups).length === heroes.length,
    heroCount: Object.keys(orderedMatchups).length,
    matchupCount: Object.values(orderedMatchups).reduce((sum, row) => sum + Object.keys(row).length, 0),
    matchups: orderedMatchups,
    ...(errors.length > 0 && { errors: errors.slice(0, 12) }),
  }

  const validation = validateSnapshot(snapshot, heroes)
  if (validation.errors.length > 0) {
    console.error(JSON.stringify(validation, null, 2))
    process.exit(1)
  }
  if (!snapshot.complete && !allowPartial) {
    console.error(`Refusing to write partial snapshot (${snapshot.heroCount}/${heroes.length} heroes). Re-run later or pass --allow-partial.`)
    if (errors.length > 0) console.error(errors.join('\n'))
    process.exit(1)
  }

  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${snapshotPath}`)
  console.log(`week=${snapshot.weekKey} heroes=${snapshot.heroCount} matchups=${snapshot.matchupCount} complete=${snapshot.complete}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

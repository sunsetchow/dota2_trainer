import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const metaPath = resolve(repoRoot, 'src/data/positionMetaHeroes.json')
const heroesPath = resolve(repoRoot, 'src/data/opendotaHeroes.json')
const legacyHeroesPath = resolve(repoRoot, 'src/data/heroes.json')
const POSITIONS = ['1', '2', '3', '4', '5']
const VALID_SOURCES = new Set(['stratz', 'manual'])
const VALID_RANK_BRACKETS = new Set(['ALL', 'HERALD_GUARDIAN', 'CRUSADER_ARCHON', 'LEGEND_ANCIENT', 'DIVINE_IMMORTAL'])

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function buildAliasMap(openDotaHeroes, legacyHeroes) {
  const map = new Map()
  const allNames = openDotaHeroes.map(hero => hero.displayName || hero.localizedName)
  for (const hero of openDotaHeroes) {
    const display = hero.displayName || hero.localizedName
    const rawName = hero.name.replace('npc_dota_hero_', '').replace(/_/g, ' ')
    for (const alias of [display, hero.localizedName, rawName]) map.set(normalize(alias), display)
  }
  for (const [alias, canonical] of Object.entries(legacyHeroes.alias ?? {})) map.set(normalize(alias), canonical)
  for (const name of allNames) map.set(normalize(name), name)
  return map
}

function validatePositionMeta(snapshot, openDotaHeroes, legacyHeroes) {
  const errors = []
  const warnings = []
  const aliasMap = buildAliasMap(openDotaHeroes, legacyHeroes)
  const canonicalNames = new Set(openDotaHeroes.map(hero => hero.displayName || hero.localizedName))

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) errors.push('Snapshot must be an object')
  if (!VALID_SOURCES.has(snapshot.source)) errors.push(`Invalid source: ${snapshot.source}`)
  if (snapshot.rankBracket && !VALID_RANK_BRACKETS.has(snapshot.rankBracket)) errors.push(`Invalid rankBracket: ${snapshot.rankBracket}`)
  if (!snapshot.weekKey || typeof snapshot.weekKey !== 'string') errors.push('Missing weekKey')
  if (!Number.isFinite(snapshot.syncedAt) || snapshot.syncedAt <= 0) errors.push('Invalid syncedAt')
  if (!Number.isInteger(snapshot.topN) || snapshot.topN <= 0) errors.push('Invalid topN')
  if (!snapshot.positions || typeof snapshot.positions !== 'object' || Array.isArray(snapshot.positions)) errors.push('Missing positions object')

  const positions = snapshot.positions ?? {}
  const counts = {}
  for (const position of POSITIONS) {
    const heroes = positions[position]
    if (!Array.isArray(heroes)) {
      errors.push(`Missing position ${position}`)
      continue
    }
    counts[position] = heroes.length
    if (snapshot.topN && heroes.length < snapshot.topN) warnings.push(`Position ${position} has ${heroes.length}/${snapshot.topN} heroes`)

    const seen = new Set()
    for (const [index, item] of heroes.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`Invalid item at position ${position}[${index}]`)
        continue
      }
      const canonical = aliasMap.get(normalize(item.hero))
      if (!canonical || !canonicalNames.has(canonical)) errors.push(`Unresolvable hero at position ${position}[${index}]: ${item.hero}`)
      if (canonical && seen.has(canonical)) errors.push(`Duplicate hero at position ${position}: ${canonical}`)
      if (canonical) seen.add(canonical)
      if (!Number.isFinite(item.weight) || item.weight <= 0 || item.weight > 1.000001) errors.push(`Invalid weight for ${item.hero} at position ${position}: ${item.weight}`)
      if (item.pickRate !== undefined && (!Number.isFinite(item.pickRate) || item.pickRate < 0)) errors.push(`Invalid pickRate for ${item.hero}`)
      if (item.matchCount !== undefined && (!Number.isFinite(item.matchCount) || item.matchCount < 0)) errors.push(`Invalid matchCount for ${item.hero}`)
    }
  }

  for (const extra of Object.keys(positions).filter(key => !POSITIONS.includes(key))) warnings.push(`Unexpected position key: ${extra}`)

  return {
    errors,
    warnings,
    source: snapshot.source,
    rankBracket: snapshot.rankBracket,
    weekKey: snapshot.weekKey,
    topN: snapshot.topN,
    counts,
  }
}

async function main() {
  const [snapshot, openDotaHeroes, legacyHeroes] = await Promise.all([
    readJson(metaPath),
    readJson(heroesPath),
    readJson(legacyHeroesPath),
  ])
  const result = validatePositionMeta(snapshot, openDotaHeroes, legacyHeroes)
  console.log(JSON.stringify(result, null, 2))
  if (result.errors.length > 0) process.exit(1)
}

export { validatePositionMeta }

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}

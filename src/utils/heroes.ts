import heroesData from '../data/heroes.json'
import opendotaHeroes from '../data/opendotaHeroes.json'

interface OpenDotaHeroName {
  name: string;
  localizedName: string;
  displayName: string;
}

const openDotaHeroNames = opendotaHeroes as OpenDotaHeroName[]
const allHeroNames = openDotaHeroNames.map(hero => hero.displayName || hero.localizedName)
const maintainedCounterHeroes: string[] = Object.keys(heroesData.supMap)
const configuredPool = heroesData.pool as string[]
const SELECTABLE_HEROES: string[] = [...new Set(allHeroNames)]
const RESOLVABLE_HEROES: string[] = [...new Set([...allHeroNames, ...configuredPool, ...maintainedCounterHeroes])]

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>()

  for (const hero of openDotaHeroNames) {
    const display = hero.displayName || hero.localizedName
    const rawName = hero.name.replace('npc_dota_hero_', '').replace(/_/g, ' ')
    for (const alias of [display, hero.localizedName, rawName]) {
      map.set(normalize(alias), display)
    }
  }

  for (const [alias, canonical] of Object.entries(heroesData.alias as Record<string, string>)) {
    map.set(normalize(alias), canonical)
  }

  for (const hero of RESOLVABLE_HEROES) {
    map.set(normalize(hero), hero)
  }

  return map
}

const aliasMap = buildAliasMap()

export function resolve(input: string): string | null {
  const s = normalize(input)
  if (!s) return null
  const exact = aliasMap.get(s)
  if (exact) return exact
  return RESOLVABLE_HEROES.find(name => {
    const normalizedName = normalize(name)
    return normalizedName.includes(s) || s.includes(normalizedName)
  }) ?? null
}

export function getSugg(val = '', limit = 200): string[] {
  const v = normalize(val)
  if (!v) return SELECTABLE_HEROES.slice(0, limit)
  const r = new Set<string>()
  for (const [alias, canonical] of aliasMap.entries()) {
    if (alias.includes(v) || normalize(canonical).includes(v)) r.add(canonical)
  }
  for (const n of RESOLVABLE_HEROES) {
    if (normalize(n).includes(v)) r.add(n)
  }
  return [...r].filter(n => RESOLVABLE_HEROES.includes(n)).slice(0, limit)
}

export function getPool(): string[] {
  return SELECTABLE_HEROES
}

export function getSupMap(): Record<string, Record<string, number>> {
  return heroesData.supMap as Record<string, Record<string, number>>
}

export function getCounters(): Record<string, Record<string, number>> {
  return heroesData.counters as Record<string, Record<string, number>>
}

export function getCountered(): Record<string, Record<string, number>> {
  return heroesData.countered as Record<string, Record<string, number>>
}

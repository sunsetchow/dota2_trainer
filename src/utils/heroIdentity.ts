import heroesData from '../data/heroes.json'
import opendotaHeroes from '../data/opendotaHeroes.json'

interface OpenDotaHeroMetaJson {
  id: number
  name: string
  localizedName: string
  displayName: string
}

const heroes = opendotaHeroes as OpenDotaHeroMetaJson[]
const aliasData = heroesData.alias as Record<string, string>

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

const byId = new Map<number, OpenDotaHeroMetaJson>(heroes.map(hero => [hero.id, hero]))
const idByName = new Map<string, number>()

for (const hero of heroes) {
  const display = hero.displayName || hero.localizedName
  const rawName = hero.name.replace('npc_dota_hero_', '').replace(/_/g, ' ')
  for (const alias of [display, hero.localizedName, rawName, hero.name]) {
    idByName.set(normalize(alias), hero.id)
  }
}

for (const [alias, canonical] of Object.entries(aliasData)) {
  const id = idByName.get(normalize(canonical))
  if (id !== undefined) idByName.set(normalize(alias), id)
}

export function getHeroIdByName(heroName?: string | null): number | undefined {
  const normalized = normalize(heroName ?? '')
  if (!normalized) return undefined
  return idByName.get(normalized)
}

export function getHeroNameById(heroId?: number | null): string | undefined {
  if (heroId === undefined || heroId === null) return undefined
  const hero = byId.get(heroId)
  return hero?.displayName || hero?.localizedName
}

export function sameHeroReference(left: { hero?: string; heroId?: number }, right: { hero?: string; heroId?: number }): boolean {
  if (left.heroId !== undefined && right.heroId !== undefined) return left.heroId === right.heroId
  const leftId = left.heroId ?? getHeroIdByName(left.hero)
  const rightId = right.heroId ?? getHeroIdByName(right.hero)
  if (leftId !== undefined && rightId !== undefined) return leftId === rightId
  return Boolean(left.hero && right.hero && normalize(left.hero) === normalize(right.hero))
}

export function compactHeroIdMap(values: Record<string, string | undefined>): Record<string, number> | undefined {
  const entries = Object.entries(values)
    .map(([key, hero]) => [key, getHeroIdByName(hero)] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== undefined)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function compactHeroIds(values: Array<string | undefined>): number[] | undefined {
  const ids = values
    .map(hero => getHeroIdByName(hero))
    .filter((id): id is number => id !== undefined)
  return ids.length > 0 ? [...new Set(ids)] : undefined
}

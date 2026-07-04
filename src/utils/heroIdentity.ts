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

// 有些英雄改过官方译名（比如 id 155 "朗戈"，heroes.json 的 alias 表里还留着 "拉尔戈"/"拉戈"
// 这些旧译名），opendotaHeroes.json 的 displayName 只存当前名字，id→name 要过一遍 alias 表
// 才能兼容"看到旧名字也认得出是同一个英雄"这种场景。
const canonicalNameById = new Map<number, string>(
  heroes.map(hero => {
    const raw = hero.displayName || hero.localizedName
    return [hero.id, aliasData[raw] ?? raw]
  }),
)

const idByName = new Map<string, number>()

for (const hero of heroes) {
  const display = hero.displayName || hero.localizedName
  const rawName = hero.name.replace('npc_dota_hero_', '').replace(/_/g, ' ')
  // 也把 canonical 名注册进去：如果某个英雄的 canonical 名跟 opendotaHeroes.json 的
  // displayName 不一致，不注册的话 getHeroIdByName(canonical 名) 会查不到，下面按
  // alias 表转译历史名字时也会因为查不到 canonical 名对应的 id 而静默跳过。
  const canonical = canonicalNameById.get(hero.id)
  for (const alias of [display, hero.localizedName, rawName, hero.name, canonical]) {
    if (alias) idByName.set(normalize(alias), hero.id)
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
  if (canonicalNameById.has(heroId)) return canonicalNameById.get(heroId)
  const hero = byId.get(heroId)
  return hero?.displayName || hero?.localizedName
}

export function getCanonicalHeroName(heroName?: string | null): string | undefined {
  const heroId = getHeroIdByName(heroName)
  return getHeroNameById(heroId) ?? (heroName?.trim() || undefined)
}

export function getCanonicalHeroNameByReference(reference: { hero?: string; heroId?: number }): string | undefined {
  return getHeroNameById(reference.heroId) ?? getCanonicalHeroName(reference.hero)
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

import opendotaHeroes from '../data/opendotaHeroes.json'

export interface OpenDotaHeroMeta {
  id: number;
  name: string;
  localizedName: string;
  displayName: string;
}

const heroes = opendotaHeroes as OpenDotaHeroMeta[]
const byId = new Map<number, OpenDotaHeroMeta>(heroes.map(hero => [hero.id, hero]))

export function getOpenDotaHeroById(heroId?: number | null): OpenDotaHeroMeta | null {
  if (heroId === undefined || heroId === null) return null
  return byId.get(heroId) ?? null
}

export function getOpenDotaHeroName(heroId?: number | null): string {
  const hero = getOpenDotaHeroById(heroId)
  return hero?.displayName || hero?.localizedName || (heroId ? `Hero ${heroId}` : '')
}

export function getAllOpenDotaHeroNames(): string[] {
  return heroes.map(hero => hero.displayName || hero.localizedName)
}

export function getOpenDotaHeroSuggestions(query: string, limit = 8): string[] {
  const value = query.trim().toLowerCase()
  if (!value) return getAllOpenDotaHeroNames().slice(0, limit)

  return heroes
    .filter(hero => {
      const display = hero.displayName.toLowerCase()
      const localized = hero.localizedName.toLowerCase()
      const raw = hero.name.toLowerCase()
      return display.includes(value) || localized.includes(value) || raw.includes(value)
    })
    .map(hero => hero.displayName || hero.localizedName)
    .slice(0, limit)
}

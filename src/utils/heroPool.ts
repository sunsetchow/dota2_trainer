import positionHeroPoolsJson from '../data/positionHeroPools.json'
import type { DotaPosition, HeroConfig } from '../types'

export const HERO_POSITIONS = ['1', '2', '3', '4', '5'] as const satisfies readonly DotaPosition[]

export const HERO_POSITION_LABELS: Record<DotaPosition, string> = {
  '1': '1号位',
  '2': '2号位',
  '3': '3号位',
  '4': '4号位',
  '5': '5号位',
}

const DEFAULT_POSITION_POOLS = positionHeroPoolsJson as Record<DotaPosition, string[]>

export function getDefaultHeroPositions(hero: string): DotaPosition[] {
  return HERO_POSITIONS.filter(position => DEFAULT_POSITION_POOLS[position]?.includes(hero))
}

export function getConfiguredHeroPositions(hero: string, config?: HeroConfig): DotaPosition[] {
  return Array.isArray(config?.positions) ? config.positions : getDefaultHeroPositions(hero)
}

export function isHeroPlayableAtPosition(hero: string, position: DotaPosition, config?: HeroConfig): boolean {
  return getConfiguredHeroPositions(hero, config).includes(position)
}

export function getHeroPoolConfig(heroPool: HeroConfig[], hero: string): HeroConfig | undefined {
  return heroPool.find(config => config.name === hero)
}

export function tierRank(tier?: HeroConfig['tier']): number {
  if (tier === 'main') return 0
  if (tier === 'practice' || !tier) return 1
  if (tier === 'backup') return 2
  return 3
}

export function tierLabel(tier?: HeroConfig['tier'], active = true): string {
  if (!active) return '未启用'
  if (tier === 'main') return '主力'
  if (tier === 'backup') return '备用'
  return '练习'
}

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const poolsPath = resolve(repoRoot, 'src/data/positionHeroPools.json')
const heroesPath = resolve(repoRoot, 'src/data/opendotaHeroes.json')
const POSITIONS = ['1', '2', '3', '4', '5']

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  const [pools, heroes] = await Promise.all([readJson(poolsPath), readJson(heroesPath)])
  const canonicalNames = new Set(heroes.map(hero => hero.displayName || hero.localizedName))
  const errors = []
  const warnings = []
  const counts = {}

  for (const position of POSITIONS) {
    const list = pools[position]
    if (!Array.isArray(list)) {
      errors.push(`Missing position ${position}`)
      continue
    }
    counts[position] = list.length
    if (list.length === 0) errors.push(`Position ${position} is empty`)

    const seen = new Set()
    for (const [index, hero] of list.entries()) {
      if (typeof hero !== 'string' || !hero.trim()) {
        errors.push(`Invalid hero at position ${position}[${index}]`)
        continue
      }
      if (!canonicalNames.has(hero)) errors.push(`Unknown hero at position ${position}[${index}]: ${hero}`)
      if (seen.has(hero)) errors.push(`Duplicate hero at position ${position}: ${hero}`)
      seen.add(hero)
    }
  }

  for (const key of Object.keys(pools).filter(key => !POSITIONS.includes(key))) warnings.push(`Unexpected position key: ${key}`)

  const result = { errors, warnings, counts }
  console.log(JSON.stringify(result, null, 2))
  if (errors.length > 0) process.exit(1)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

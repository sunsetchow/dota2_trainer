import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { validatePositionMeta } from './validatePositionMetaHeroes.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const metaPath = resolve(repoRoot, 'src/data/positionMetaHeroes.json')
const heroesPath = resolve(repoRoot, 'src/data/opendotaHeroes.json')
const legacyHeroesPath = resolve(repoRoot, 'src/data/heroes.json')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  const args = process.argv.slice(2)
  const fromFileIndex = args.indexOf('--from-file')
  const sourcePath = fromFileIndex >= 0 ? args[fromFileIndex + 1] : null

  if (!sourcePath) {
    console.log('No Stratz position popularity endpoint is wired yet. Validating existing positionMetaHeroes.json snapshot instead.')
    console.log('To replace the snapshot with exported Stratz data, run: node scripts/updatePositionMetaHeroes.mjs --from-file /path/to/positionMetaHeroes.json')
  }

  const [candidate, openDotaHeroes, legacyHeroes] = await Promise.all([
    readJson(sourcePath ? resolve(process.cwd(), sourcePath) : metaPath),
    readJson(heroesPath),
    readJson(legacyHeroesPath),
  ])

  const validation = validatePositionMeta(candidate, openDotaHeroes, legacyHeroes)
  if (validation.errors.length > 0) {
    console.error(JSON.stringify(validation, null, 2))
    process.exit(1)
  }

  if (sourcePath) {
    await writeFile(metaPath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8')
    console.log(`Wrote ${metaPath}`)
  } else {
    console.log(JSON.stringify(validation, null, 2))
    console.log('Existing snapshot is valid; no file written.')
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

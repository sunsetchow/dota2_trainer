import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildGsiConfigContent,
  detectGsiCfgDirs,
  getGsiConfigPath,
  getGsiConfigStatus,
  installGsiConfig,
  uninstallGsiConfig,
} from './gsiConfig.ts'

describe('detectGsiCfgDirs', () => {
  it('returns only candidate paths that exist on disk, per platform', () => {
    const home = '/home/tester'
    const macCandidate = join(home, 'Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration')
    const found = detectGsiCfgDirs({ platform: 'darwin', home, exists: p => p === macCandidate })
    expect(found).toEqual([macCandidate])
  })

  it('returns an empty array when nothing is found', () => {
    expect(detectGsiCfgDirs({ platform: 'linux', home: '/home/nobody', exists: () => false })).toEqual([])
  })
})

describe('buildGsiConfigContent', () => {
  it('embeds the port and token into a localhost uri', () => {
    const content = buildGsiConfigContent(53411, 'abc123')
    expect(content).toContain('"uri"           "http://127.0.0.1:53411/gsi?token=abc123"')
  })
})

describe('installGsiConfig / uninstallGsiConfig / getGsiConfigStatus (real fs, tmp dir)', () => {
  it('installs, reports installed status, overwrites, then uninstalls cleanly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gsi-cfg-'))
    try {
      const configPath = installGsiConfig(dir, 53411, 'token-1')
      expect(configPath).toBe(getGsiConfigPath(dir))
      expect(readFileSync(configPath, 'utf-8')).toContain('token-1')

      const status = getGsiConfigStatus(dir, { exists: () => false })
      expect(status.installed).toBe(true)
      expect(status.configPath).toBe(configPath)

      // overwrite with a new token
      installGsiConfig(dir, 53411, 'token-2')
      expect(readFileSync(configPath, 'utf-8')).toContain('token-2')
      expect(readFileSync(configPath, 'utf-8')).not.toContain('token-1')

      uninstallGsiConfig(dir)
      expect(getGsiConfigStatus(dir, { exists: () => false }).installed).toBe(false)

      // uninstalling again is a no-op, not an error
      expect(() => uninstallGsiConfig(dir)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates the cfg dir recursively if missing', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gsi-cfg-parent-'))
    try {
      const nested = join(parent, 'a/b/gamestate_integration')
      const configPath = installGsiConfig(nested, 53411, 'token-x')
      expect(readFileSync(configPath, 'utf-8')).toContain('token-x')
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('surfaces a readable error when writing fails', () => {
    const failingFs = {
      existsSync: () => true,
      mkdirSync: () => undefined,
      writeFileSync: () => { throw new Error('EACCES: permission denied') },
      unlinkSync: () => undefined,
    }
    expect(() => installGsiConfig('/nope', 53411, 'tok', failingFs as any))
      .toThrow(/写入 GSI 配置文件失败.*EACCES/)
  })

  it('surfaces a readable error when deleting fails', () => {
    const failingFs = {
      existsSync: () => true,
      mkdirSync: () => undefined,
      writeFileSync: () => undefined,
      unlinkSync: () => { throw new Error('EBUSY: resource busy') },
    }
    expect(() => uninstallGsiConfig('/nope', failingFs as any))
      .toThrow(/删除 GSI 配置文件失败.*EBUSY/)
  })
})

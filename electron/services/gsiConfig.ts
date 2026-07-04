import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { GsiConfigStatus } from '../../src/types'

// Valve GSI cfg 文件名/位置是公开机制（Source/Source 2 通用），不依赖 30.0 未验证的
// payload 字段猜测——这里只负责让 Dota 客户端把 gamestate 数据 POST 到本地 server，
// 具体 payload 结构的验证状态见 electron/services/__fixtures__/gsiDraftSamples/FINDINGS.md。
export const GSI_CONFIG_FILENAME = 'gamestate_integration_dota2trainer.cfg'

export interface GsiConfigFs {
  existsSync: typeof existsSync
  mkdirSync: typeof mkdirSync
  writeFileSync: typeof writeFileSync
  unlinkSync: typeof unlinkSync
}

const defaultFs: GsiConfigFs = { existsSync, mkdirSync, writeFileSync, unlinkSync }

export interface GsiDetectDeps {
  exists?: (path: string) => boolean
  platform?: NodeJS.Platform
  home?: string
}

function candidateCfgDirsForPlatform(platform: NodeJS.Platform, home: string): string[] {
  const steamCommon = 'steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration'
  if (platform === 'darwin') {
    return [join(home, 'Library/Application Support/Steam', steamCommon)]
  }
  if (platform === 'win32') {
    return [
      join('C:/Program Files (x86)/Steam', steamCommon),
      join('C:/Program Files/Steam', steamCommon),
    ]
  }
  return [
    join(home, '.local/share/Steam', steamCommon),
    join(home, '.steam/steam', steamCommon),
  ]
}

/** 只做已知常见 Steam 安装路径的存在性探测；探测不到时前端会引导用户手动选择目录。 */
export function detectGsiCfgDirs(deps: GsiDetectDeps = {}): string[] {
  const exists = deps.exists ?? existsSync
  const platform = deps.platform ?? process.platform
  const home = deps.home ?? homedir()
  return candidateCfgDirsForPlatform(platform, home).filter(exists)
}

export function buildGsiConfigContent(port: number, authToken: string): string {
  return `"dota2-trainer-gsi"
{
    "uri"           "http://127.0.0.1:${port}/gsi?token=${authToken}"
    "timeout"       "5.0"
    "buffer"        "0.1"
    "throttle"      "0.1"
    "heartbeat"     "30.0"
    "data"
    {
        "provider"      "1"
        "map"           "1"
        "draft"         "1"
    }
}
`
}

export function getGsiConfigPath(cfgDir: string): string {
  return join(cfgDir, GSI_CONFIG_FILENAME)
}

function toReadableError(action: string, target: string, error: unknown): Error {
  return new Error(`${action}失败（${target}）：${error instanceof Error ? error.message : String(error)}`)
}

/** 覆盖写入；调用方（gsiService）负责在失败时回滚已经启动的 server。 */
export function installGsiConfig(cfgDir: string, port: number, authToken: string, fs: GsiConfigFs = defaultFs): string {
  const configPath = getGsiConfigPath(cfgDir)
  try {
    if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true })
    fs.writeFileSync(configPath, buildGsiConfigContent(port, authToken), 'utf-8')
    return configPath
  } catch (error) {
    throw toReadableError('写入 GSI 配置文件', cfgDir, error)
  }
}

export function uninstallGsiConfig(cfgDir: string, fs: GsiConfigFs = defaultFs): void {
  const configPath = getGsiConfigPath(cfgDir)
  if (!fs.existsSync(configPath)) return
  try {
    fs.unlinkSync(configPath)
  } catch (error) {
    throw toReadableError('删除 GSI 配置文件', configPath, error)
  }
}

export function getGsiConfigStatus(cfgDir: string | undefined, deps: GsiDetectDeps & { fs?: GsiConfigFs } = {}): GsiConfigStatus {
  const detectedSteamPaths = detectGsiCfgDirs(deps)
  const fs = deps.fs ?? defaultFs
  const configPath = cfgDir ? getGsiConfigPath(cfgDir) : null
  return {
    installed: configPath !== null && fs.existsSync(configPath),
    configPath,
    dotaCfgDirFound: detectedSteamPaths.length > 0,
    detectedSteamPaths,
  }
}

import { dialog, ipcMain } from 'electron'
import type { DraftGsiSnapshot, GsiEnableResult, GsiStatus } from '../../src/types'
import { detectGsiCfgDirs } from '../services/gsiConfig.ts'
import { disableGsi, enableGsi, getGsiStatus, setGsiBroadcast, type GsiServiceStore } from '../services/gsiService.ts'

export interface GsiWebContentsLike {
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

export function registerGsiIpcHandlers(store: GsiServiceStore, getWebContents: () => GsiWebContentsLike[]): void {
  setGsiBroadcast((snapshot: DraftGsiSnapshot) => {
    for (const wc of getWebContents()) {
      if (!wc.isDestroyed()) wc.send('gsi:snapshotUpdated', snapshot)
    }
  })

  ipcMain.handle('gsi:getStatus', (): GsiStatus => getGsiStatus(store))

  ipcMain.handle('gsi:enable', (_, options?: { cfgDir?: string; port?: number }): Promise<GsiEnableResult> =>
    enableGsi(store, options ?? {}))

  ipcMain.handle('gsi:disable', async (): Promise<void> => {
    await disableGsi(store)
  })

  ipcMain.handle('gsi:detectCfgDir', (): string[] => detectGsiCfgDirs())

  ipcMain.handle('gsi:chooseCfgDir', async (): Promise<string | null> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })
}

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import store from './store.ts'
import { registerStoreIpcHandlers, recoverPersistedStoreForStartup } from './ipc/storeIpc.ts'
import { registerOpenDotaIpcHandlers } from './ipc/opendotaIpc.ts'
import { createDotaDataServices, todayKey } from './services/dotaDataServices.ts'
import heroMatchupSnapshot from '../src/data/heroMatchupSnapshot.json'
import type { AppState, TrainingCycle, HeroMatchupCache } from '../src/types'
import { parseHeroMatchupCache } from '../src/schema/persistence.ts'
import { shouldSeedBundledHeroMatchupCache } from '../src/utils/heroMatchupCacheSeed.ts'

// ── 8 周主题常量
const DEFAULT_WEEK_THEMES: TrainingCycle['weekThemes'] = [
  {
    week: 0,
    theme: '建立基线',
    checklistItemIds: ['cs-10min', 'watch-video', 'replay-0-10', 'watch-replay', 'ranked-2', 'stop-2loss', 'death-replay', 'warmup-15', 'ranked-3', 'postmatch-review', 'key-10min', 'tomorrow-goal'],
  },
  {
    week: 1,
    theme: '对线基本功（补刀/消耗/不崩线）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'as-stop-drill', 'tower-cs', 'replay-lane', 'lane-mistake'],
  },
  {
    week: 2,
    theme: '对线基本功（补刀/消耗/不崩线）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'as-stop-drill', 'tower-cs', 'replay-lane', 'lane-mistake'],
  },
  {
    week: 3,
    theme: '地图资源（绿/橙/红区死亡分析）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'death-zone', 'safe-farm-first'],
  },
  {
    week: 4,
    theme: '地图资源（绿/橙/红区死亡分析）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'death-zone', 'safe-farm-first'],
  },
  {
    week: 5,
    theme: '兵线目标（中期30秒问题决策）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'wave-30s'],
  },
  {
    week: 6,
    theme: '兵线目标（中期30秒问题决策）',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'wave-30s'],
  },
  {
    week: 7,
    theme: '英雄池专项',
    checklistItemIds: ['cs-10min', 'watch-video', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'key-10min', 'hero-pool-note'],
  },
  {
    week: 8,
    theme: '冲分整合（排位纪律）',
    checklistItemIds: ['cs-10min', 'ranked-2', 'stop-2loss', 'death-replay', 'ranked-3', 'postmatch-review', 'key-10min', 'tomorrow-goal'],
  },
]

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// ── IPC Handlers

registerStoreIpcHandlers(store, todayKey)
registerOpenDotaIpcHandlers(store, createDotaDataServices())

app.whenReady().then(() => {
  recoverPersistedStoreForStartup(store)

  // 冷启动：确保 activeCycleId 始终存在
  const appState = store.get('appState') as AppState
  if (!appState.activeCycleId) {
    const defaultCycle: TrainingCycle = {
      cycleId: 'default',
      startDate: todayKey(),
      weekThemes: DEFAULT_WEEK_THEMES,
    }
    store.set('cycles', [defaultCycle])
    store.set('appState', { ...appState, activeCycleId: 'default' })
  }

  // 全新安装 / 刚从 git pull 下来：本地没有缓存，或本地缓存不如 repo 快照完整时，用仓库快照兜底
  const existingRaw = store.get('heroMatchupCache', null)
  const existingMatchupCache = existingRaw ? parseHeroMatchupCache(existingRaw) as HeroMatchupCache : null
  const bundledMatchupCache = parseHeroMatchupCache(heroMatchupSnapshot) as HeroMatchupCache
  const shouldSeedMatchupCache = shouldSeedBundledHeroMatchupCache(existingMatchupCache, bundledMatchupCache)
  if (shouldSeedMatchupCache) {
    store.set('heroMatchupCache', bundledMatchupCache)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

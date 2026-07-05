import { createRequire } from 'module'
import { CURRENT_SCHEMA_VERSION } from '../src/schema/persistence.ts'
const require = createRequire(import.meta.url)
const Store = require('electron-store')

// ⚠️ defaults 必须在构造函数里传，不能赋值给 store.defaults
const store = new Store({
  defaults: {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appState: {
      language: 'zh',
      activeCycleId: '',
      heroPool: [],
      currentStreak: 0,
      longestStreak: 0,
      pendingPreGameSetupId: undefined,
      checklistFreezeTokens: 0,
      freezeUsedDates: [],
      openDota: {
        accountId: '',
        apiKey: '',
      },
      stratz: {
        apiKey: '',
        rankBracket: 'ALL',
      },
    },
    cycles: [],
    matchLogs: [],
    preGameSetups: [],
    dailyCheckins: [],
    mmrLogs: [],
    heroNotes: [],
    heroMatchupCache: null,
    heroBenchmarkCache: {},
    heroTimingCache: null,
    positionMetaCache: null,
  }
})

export default store

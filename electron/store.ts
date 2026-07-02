import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const Store = require('electron-store')

// ⚠️ defaults 必须在构造函数里传，不能赋值给 store.defaults
const store = new Store({
  defaults: {
    schemaVersion: 1,
    appState: {
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
  }
})

export default store

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const Store = require('electron-store')

// ⚠️ defaults 必须在构造函数里传，不能赋值给 store.defaults
const store = new Store({
  defaults: {
    appState: {
      activeCycleId: '',
      heroPool: [],
      currentStreak: 0,
      longestStreak: 0,
      pendingPreGameSetupId: undefined,
      openDota: {
        accountId: '',
        apiKey: '',
      },
    },
    cycles: [],
    matchLogs: [],
    preGameSetups: [],
    dailyCheckins: [],
    mmrLogs: [],
    heroNotes: [],
    heroMatchupCache: null,
  }
})

export default store

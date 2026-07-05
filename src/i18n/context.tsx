import React, { createContext, useCallback, useContext, useMemo } from 'react'
import zh from './zh.ts'
import en from './en.ts'
import { useAppState } from '../store/useStore.ts'

export type Language = 'zh' | 'en'

const dictionaries = { zh, en }

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`))
}

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => Promise<void>
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'zh',
  setLanguage: async () => {},
})

// 全 app 唯一读写 appState.language 的地方：useAppState() 每个调用点各自独立 fetch，
// 互相不同步（update() 只刷新自己那份）；如果 Settings 和 AppShell 各自单独调用
// useAppState() 来读语言，Settings 切换语言后 AppShell 不会跟着刷新。这里统一由
// LanguageProvider 一个实例持有，其他组件一律通过 useLanguage()/useSetLanguage()
// 读写，保证语言切换全局瞬时生效。
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { appState, update } = useAppState()
  const language: Language = appState?.language ?? 'zh'
  const setLanguage = useCallback(async (next: Language) => {
    await update({ language: next })
  }, [update])
  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): Language {
  return useContext(LanguageContext).language
}

export function useSetLanguage(): (language: Language) => Promise<void> {
  return useContext(LanguageContext).setLanguage
}

export function useT() {
  const language = useLanguage()
  const dict = dictionaries[language]
  return useMemo(() => {
    return function t(path: string, vars?: Record<string, string | number>): string {
      const value = path.split('.').reduce<unknown>((obj, key) => (obj as Record<string, unknown> | undefined)?.[key], dict)
      return typeof value === 'string' ? format(value, vars) : path
    }
  }, [dict])
}

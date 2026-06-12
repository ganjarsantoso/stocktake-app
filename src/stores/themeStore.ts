import { create } from 'zustand'

interface ThemeState {
  theme: 'dark' | 'light'
  keyboardVisible: boolean
  keyboardSize: 'small' | 'medium' | 'large'
  toggleTheme: () => void
  setTheme: (theme: 'dark' | 'light') => void
  setKeyboardVisible: (visible: boolean) => void
  setKeyboardSize: (size: 'small' | 'medium' | 'large') => void
}

const getInitialTheme = (): 'dark' | 'light' => {
  const stored = localStorage.getItem('stocktake-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark'
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  keyboardVisible: localStorage.getItem('stocktake-kb-visible') !== 'false',
  keyboardSize: (localStorage.getItem('stocktake-kb-size') as 'small' | 'medium' | 'large') || 'medium',
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('stocktake-theme', next)
      return { theme: next }
    }),
  setTheme: (theme) => {
    localStorage.setItem('stocktake-theme', theme)
    set({ theme })
  },
  setKeyboardVisible: (visible) => {
    localStorage.setItem('stocktake-kb-visible', String(visible))
    set({ keyboardVisible: visible })
  },
  setKeyboardSize: (size) => {
    localStorage.setItem('stocktake-kb-size', size)
    set({ keyboardSize: size })
  },
}))

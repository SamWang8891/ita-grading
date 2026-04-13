import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const ThemeCtx = createContext({ theme: 'system', resolved: 'light', setTheme: () => {}, cycle: () => {} })

const STORAGE_KEY = 'theme'

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch (_) {}
  return 'system'
}

function systemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyDarkClass(isDark) {
  const root = document.documentElement
  if (isDark) root.classList.add('dark')
  else root.classList.remove('dark')
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored)
  const [sysDark, setSysDark] = useState(systemPrefersDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setSysDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const resolved = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme

  useEffect(() => { applyDarkClass(resolved === 'dark') }, [resolved])

  const setTheme = useCallback((t) => {
    setThemeState(t)
    try { localStorage.setItem(STORAGE_KEY, t) } catch (_) {}
  }, [])

  const cycle = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setTheme])

  return (
    <ThemeCtx.Provider value={{ theme, resolved, setTheme, cycle }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeCtx)
}

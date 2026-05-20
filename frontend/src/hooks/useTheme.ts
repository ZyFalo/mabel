import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { usePreferencesStore } from '../stores/preferencesStore'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'mabel_theme'

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'auto'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
  return 'auto'
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolve(theme: ThemeMode): ResolvedTheme {
  if (theme === 'auto') return systemPrefersDark() ? 'dark' : 'light'
  return theme
}

function applyTheme(theme: ThemeMode): ResolvedTheme {
  const resolved = resolve(theme)
  if (typeof document !== 'undefined') {
    // Set the literal mode (light/dark/auto) — CSS handles 'auto' via @media query
    document.documentElement.setAttribute('data-theme', theme)
  }
  return resolved
}

/**
 * useTheme — theme manager hook.
 *
 * Reads initial value from localStorage (`mabel_theme`), defaulting to 'auto'.
 * Writes `data-theme` to <html> on every change.
 * When theme === 'auto', listens to prefers-color-scheme changes.
 * If user is authenticated, silently persists choice to preferences backend.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(readStoredTheme()))

  // Apply theme to <html> whenever theme changes; recompute resolved.
  useEffect(() => {
    const resolved = applyTheme(theme)
    setResolvedTheme(resolved)
  }, [theme])

  // Listen to OS preference when in 'auto' mode.
  useEffect(() => {
    if (theme !== 'auto') return
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? 'dark' : 'light')
    }

    // Modern + legacy listener support.
    if (mql.addEventListener) mql.addEventListener('change', handler)
    else mql.addListener(handler)

    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler)
      else mql.removeListener(handler)
    }
  }, [theme])

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore quota errors
    }

    // Silently persist to backend when authenticated.
    const { isAuthenticated } = useAuthStore.getState()
    if (isAuthenticated) {
      const { preferences, updatePreferences } = usePreferencesStore.getState()
      const prevAccessibility = (preferences?.accessibility ?? {}) as Record<string, unknown>
      updatePreferences({
        accessibility: { ...prevAccessibility, theme: next },
      }).catch(() => {
        /* silent — UX should not break on backend failure */
      })
    }
  }, [])

  return { theme, setTheme, resolvedTheme }
}

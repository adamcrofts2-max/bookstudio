import { useEffect, useMemo } from 'react'

import { useUiStore } from '@/store/uiStore'

/**
 * Resolves the current appearance mode ('light' | 'dark' | 'system') to an
 * actual light/dark value, keeps it in sync with the OS when 'system' is
 * selected, and reflects it onto <html class="dark"> so Tailwind's `dark:`
 * variant and our CSS custom properties respond instantly.
 */
export function useTheme() {
  const appearance = useUiStore((s) => s.appearance)
  const setAppearance = useUiStore((s) => s.setAppearance)

  const systemPrefersDark = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
    [],
  )

  const resolved: 'light' | 'dark' =
    appearance === 'system' ? (systemPrefersDark ? 'dark' : 'light') : appearance

  useEffect(() => {
    const root = document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const shouldUseDark = appearance === 'system' ? mediaQuery.matches : appearance === 'dark'
      root.classList.toggle('dark', shouldUseDark)
    }

    apply()

    if (appearance === 'system') {
      mediaQuery.addEventListener('change', apply)
      return () => mediaQuery.removeEventListener('change', apply)
    }
  }, [appearance])

  return { appearance, resolved, setAppearance }
}

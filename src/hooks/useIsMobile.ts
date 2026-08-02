import { useEffect, useState } from 'react'

/**
 * Below this width, `EditorPage` swaps the fixed-page desktop editor
 * (`AppShell`'s 3-column shell, built around a print-precise WYSIWYG page
 * canvas — see `AppShell.tsx`'s "this layout never moves" doc comment) for
 * `MobileWorkspace` — a simplified single-column writing + Idea-capture
 * experience. 640px matches Tailwind's `sm` breakpoint: wide enough to
 * exclude most small tablets (which can reasonably use the desktop shell in
 * landscape), narrow enough to reliably catch phones in both orientations.
 */
const MOBILE_BREAKPOINT_PX = 640

/**
 * Reports whether the viewport is at or below the mobile breakpoint, live —
 * modelled on `useTheme.ts`'s `matchMedia` + `change`-listener pattern (the
 * only existing precedent for viewport/OS-state hooks in this codebase).
 * Unlike `useTheme`, there's no store-persisted override here: "mobile mode"
 * is purely a function of viewport width, not a user preference, so a
 * browser window resized across the breakpoint switches shells live with no
 * separate setting to keep in sync.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
    const apply = () => setIsMobile(mediaQuery.matches)
    apply()
    mediaQuery.addEventListener('change', apply)
    return () => mediaQuery.removeEventListener('change', apply)
  }, [])

  return isMobile
}

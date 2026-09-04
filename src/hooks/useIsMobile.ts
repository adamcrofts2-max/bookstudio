import { useEffect, useState } from 'react'

/**
 * Below this width, `EditorPage` swaps the fixed-page desktop editor
 * (`AppShell`'s 3-column shell, built around a print-precise WYSIWYG page
 * canvas — see `AppShell.tsx`'s "this layout never moves" doc comment) for
 * `MobileWorkspace` — a simplified single-column writing + Idea-capture
 * experience. 640px matches Tailwind's `sm` breakpoint.
 */
const MOBILE_BREAKPOINT_PX = 640

/**
 * Width alone is not enough, and assuming it was produced a real bug: a phone
 * rotated to landscape is roughly 844x390, so it sailed past the 640px width
 * test and was handed the full three-column desktop shell — sidebar, page
 * canvas and Inspector — inside 390px of height. Verified in Chromium at
 * 844x390: the toolbar clips mid-word and the page preview is reduced to an
 * unusable sliver. Rotating the phone silently dropped the author out of the
 * mobile app.
 *
 * A short viewport combined with a coarse pointer is the signal that
 * distinguishes that case from a genuinely small desktop window, which is
 * only ever short because the user chose to make it so and still has a mouse.
 * `pointer: coarse` is true for touch devices and false for a trackpad or
 * mouse, so a laptop with a short window keeps the desktop shell exactly as
 * before.
 */
const MOBILE_MAX_HEIGHT_PX = 500

/** Exported so `scripts/smoke-test.ts` can evaluate the real query against
 * known device viewports rather than restating the rule in the test. */
export const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px), (max-height: ${MOBILE_MAX_HEIGHT_PX}px) and (pointer: coarse)`

/**
 * Reports whether the viewport is at or below the mobile breakpoint, live —
 * modelled on `useTheme.ts`'s `matchMedia` + `change`-listener pattern (the
 * only existing precedent for viewport/OS-state hooks in this codebase).
 * Unlike `useTheme`, there's no store-persisted override here: "mobile mode"
 * is purely a function of the viewport and input device, not a user
 * preference, so a window resized — or a phone rotated — across the
 * threshold switches shells live with no separate setting to keep in sync.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY)
    const apply = () => setIsMobile(mediaQuery.matches)
    apply()
    mediaQuery.addEventListener('change', apply)
    return () => mediaQuery.removeEventListener('change', apply)
  }, [])

  return isMobile
}

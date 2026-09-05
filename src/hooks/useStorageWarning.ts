import { useEffect, useState } from 'react'

import { readStorageEstimate, STORAGE_WARNING_RATIO } from '@/lib/storageHealth'

/** Storage doesn't fill up in seconds; polling like it does would be waste. */
const RECHECK_MS = 5 * 60 * 1000

/**
 * Whether this device is close enough to full that the app should say so
 * before a save fails rather than after.
 *
 * Deliberately surfaced where a person will actually see it — the toolbar's
 * overflow button and the mobile More list, both of which are on screen at
 * all times — rather than only inside the Backups dialog, which is the one
 * place someone in trouble has no particular reason to open.
 */
export function useStorageWarning(): { tight: boolean; ratio: number } {
  const [ratio, setRatio] = useState(0)

  useEffect(() => {
    let cancelled = false
    const check = () => {
      void readStorageEstimate().then((estimate) => {
        if (!cancelled && estimate) setRatio(estimate.ratio)
      })
    }
    check()
    const id = window.setInterval(check, RECHECK_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return { tight: ratio >= STORAGE_WARNING_RATIO, ratio }
}

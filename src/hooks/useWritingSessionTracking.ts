import { useEffect } from 'react'

import { useManuscriptWordCount } from '@/hooks/useManuscriptWordCount'
import { useWritingSessionStore } from '@/store/writingSessionStore'

/**
 * Feeds the live manuscript word count into `writingSessionStore` every
 * time it changes — no separate polling loop, since `useManuscriptWordCount`
 * already recomputes on every manuscript edit. Mounted once in
 * `Toolbar.tsx` (already reads the same live count for display), so the
 * daily log stays current for the whole time a project is open without any
 * other component needing to know this tracking exists.
 */
export function useWritingSessionTracking(projectId: string): void {
  const wordCount = useManuscriptWordCount(projectId)
  const recordWordCount = useWritingSessionStore((s) => s.recordWordCount)

  useEffect(() => {
    recordWordCount(projectId, wordCount)
  }, [projectId, wordCount, recordWordCount])
}

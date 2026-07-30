import { useEffect, useRef } from 'react'

import { useContentStore } from '@/store/contentStore'
import { useVersionStore } from '@/store/versionStore'

/** Adjustable default, not a hard requirement — see docs/STATUS.md. */
const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000

/**
 * Periodic version-history trigger — a coarse safety net that complements,
 * not replaces, Phase 14's in-session undo/redo. Mount once per active
 * project, alongside `useKeyboardShortcuts` (see `AppShell.tsx`).
 *
 * On a real interval (not a re-render-driven timer, so it keeps firing even
 * if the project sits untouched and nothing re-renders this component),
 * checks whether `contentStore.revisionByProject[projectId]` has moved
 * since the last snapshot taken for this project. If so, takes an auto
 * snapshot; if the user hasn't touched anything, skips — no empty/duplicate
 * snapshots.
 */
export function useAutosaveSnapshots(projectId: string | null) {
  // Revision is still read reactively so the ref below always sees the
  // latest value inside the interval callback without re-subscribing it.
  const revision = useContentStore((s) => (projectId ? s.getRevision(projectId) : 0))
  const revisionRef = useRef(revision)
  revisionRef.current = revision

  const lastSnapshottedRevisionRef = useRef<number | null>(null)

  useEffect(() => {
    // Reset tracking whenever the active project changes, so switching
    // projects doesn't carry over another project's revision baseline —
    // seed it with the revision at mount time, so the very first interval
    // tick only snapshots if something actually changed since then (not
    // unconditionally, just because no snapshot has been taken yet).
    lastSnapshottedRevisionRef.current = revisionRef.current

    if (!projectId) return

    const id = window.setInterval(() => {
      const currentRevision = revisionRef.current
      if (lastSnapshottedRevisionRef.current === currentRevision) return
      lastSnapshottedRevisionRef.current = currentRevision
      void useVersionStore.getState().createSnapshot(projectId, 'auto')
    }, AUTOSAVE_INTERVAL_MS)

    return () => window.clearInterval(id)
  }, [projectId])
}

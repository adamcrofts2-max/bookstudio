import { useEffect, useRef } from 'react'

import { useContentStore } from '@/store/contentStore'
import { useBackupStore } from '@/store/backupStore'
import { loadBackupStatus, writeBackupNow, backupsSupported } from '@/projectFile/backupService'
import { requestPersistentStorage } from '@/lib/storageHealth'
import type { Project } from '@/types'

/** Often enough that losing the gap would cost minutes of writing, rare
 * enough that a book with a hundred images isn't rezipped every time
 * someone types. Only fires at all when something actually changed. */
const BACKUP_INTERVAL_MS = 2 * 60 * 1000

/**
 * Keeps a project's on-disk copy current, and asks the browser to stop
 * treating the manuscript as disposable.
 *
 * Deliberately shaped like `useAutosaveSnapshots` — mount once per active
 * project in each shell, drive it from a real interval rather than
 * re-renders, and skip entirely when `contentStore`'s revision hasn't
 * moved. The difference is where the copy lands: a snapshot goes to
 * IndexedDB, which is inside the thing it protects against; this writes a
 * real file the user chose, outside the browser altogether.
 *
 * Also writes on the way out (`visibilitychange` → hidden), which is the
 * closest thing a web app gets to "on close". Best effort by nature: the
 * write is asynchronous and the tab may not survive long enough. It is a
 * backstop for the interval, never the only path.
 */
export function useAutoBackup(project: Project | null) {
  const projectId = project?.id ?? null
  const revision = useContentStore((s) => (projectId ? s.getRevision(projectId) : 0))
  const revisionRef = useRef(revision)
  revisionRef.current = revision

  const projectRef = useRef(project)
  projectRef.current = project

  const lastBackedUpRevisionRef = useRef<number | null>(null)

  // Ask once per install for storage that browsers won't quietly evict.
  // Cheap, silent in Chromium, a visible prompt in Firefox — which is why
  // the "already asked" flag is persisted rather than kept in a ref.
  useEffect(() => {
    if (!projectId) return
    if (useBackupStore.getState().persistenceRequested) return
    useBackupStore.getState().markPersistenceRequested()
    void requestPersistentStorage()
  }, [projectId])

  useEffect(() => {
    lastBackedUpRevisionRef.current = revisionRef.current
    if (!projectId) return
    void loadBackupStatus(projectId)
  }, [projectId])

  useEffect(() => {
    if (!projectId || !backupsSupported()) return

    const backupIfChanged = () => {
      const current = projectRef.current
      if (!current) return
      const status = useBackupStore.getState().byProject[current.id]
      // No file chosen, or the browser is waiting for a click it can only
      // get from the Backups dialog — either way a timer can do nothing.
      if (!status || status.needsPermission) return
      if (lastBackedUpRevisionRef.current === revisionRef.current) return
      const attemptedRevision = revisionRef.current
      void writeBackupNow(current).then((ok) => {
        if (ok) lastBackedUpRevisionRef.current = attemptedRevision
      })
    }

    const id = window.setInterval(backupIfChanged, BACKUP_INTERVAL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') backupIfChanged()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [projectId])
}

import { PROJECT_FILE_EXTENSION } from '@/types/projectFile'
import { readProjectFileSource, projectFileName } from '@/projectFile/readProjectFileSource'
import { deleteBackupTarget, getBackupTarget, putBackupTarget, type FileSystemFileHandleish } from '@/store/backupDb'
import { useBackupStore } from '@/store/backupStore'
import type { Project } from '@/types'

/**
 * Keeping a copy of the book somewhere that isn't the browser.
 *
 * `.bookstudio` export has existed since Phase 51, and it has always had
 * one flaw as a safety net: you have to remember it. Everything else in
 * this app — the manuscript, the assets, even the version snapshots meant
 * to protect them — lives in a single browser profile, so "I'll save a copy
 * later" is the difference between a book and no book. This module turns
 * that copy into a decision made once: the author picks a file, and from
 * then on the app writes to it in the background whenever the manuscript
 * has actually changed.
 *
 * The mechanism is the File System Access API. A `FileSystemFileHandle`
 * survives reloads (kept in `backupDb.ts`), so the file is chosen once
 * rather than once per session — but the *permission* to write it does not
 * always survive: a restored handle usually comes back in `'prompt'` state,
 * and permission can only be requested from a real user gesture. That is
 * the entire reason `needsPermission` exists in the status, and why
 * `resumeBackups` is separate from `writeBackupNow`: one is something a
 * button does, the other is something a timer does.
 *
 * Safari implements none of this. `backupsSupported()` says so plainly and
 * the UI offers the manual save instead of pretending — an automatic
 * backup that silently never runs would be worse than none at all.
 */

interface FilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<FileSystemFileHandleish>
}

export function backupsSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as FilePickerWindow).showSaveFilePicker === 'function'
}

/** One write at a time per project: the interval, a visibility change and a
 * manual "Back up now" can all land together, and two writables open on the
 * same file is how a file ends up truncated. */
const inFlight = new Set<string>()

async function permissionState(handle: FileSystemFileHandleish, request: boolean): Promise<PermissionState> {
  const descriptor = { mode: 'readwrite' as const }
  try {
    const current = (await handle.queryPermission?.(descriptor)) ?? 'granted'
    if (current === 'granted' || !request) return current
    return (await handle.requestPermission?.(descriptor)) ?? 'denied'
  } catch {
    return 'denied'
  }
}

/**
 * Reads the stored target back into `backupStore` so the UI can render it
 * without awaiting IndexedDB, and records up front whether writing will
 * need a click. Called once per project mount.
 */
export async function loadBackupStatus(projectId: string): Promise<void> {
  const store = useBackupStore.getState()
  try {
    const target = await getBackupTarget(projectId)
    if (!target) {
      store.clearStatus(projectId)
      return
    }
    const state = await permissionState(target.handle, false)
    store.setStatus(projectId, {
      fileName: target.fileName,
      lastBackupAt: target.lastBackupAt,
      needsPermission: state !== 'granted',
    })
  } catch {
    // An unreadable backup database must never stop the editor opening.
    store.clearStatus(projectId)
  }
}

/**
 * Writes the project to its backup file. Returns false (and records a
 * readable error) rather than throwing: this runs from a timer, and a
 * failed backup is information, not a crash.
 *
 * `interactive` is what separates the button from the timer — only a real
 * click may prompt for permission.
 */
export async function writeBackupNow(project: Project, { interactive = false } = {}): Promise<boolean> {
  const projectId = project.id
  if (inFlight.has(projectId)) return false
  inFlight.add(projectId)
  const store = useBackupStore.getState()
  try {
    const target = await getBackupTarget(projectId)
    if (!target) {
      store.clearStatus(projectId)
      return false
    }

    const state = await permissionState(target.handle, interactive)
    if (state !== 'granted') {
      store.setStatus(projectId, {
        fileName: target.fileName,
        lastBackupAt: target.lastBackupAt,
        needsPermission: true,
        error: interactive ? 'This browser would not give permission to write that file.' : undefined,
      })
      return false
    }

    const { buildProjectFile } = await import('@/projectFile/exportProjectFile')
    const blob = await buildProjectFile(readProjectFileSource(project))
    const writable = await target.handle.createWritable()
    await writable.write(blob)
    await writable.close()

    const lastBackupAt = new Date().toISOString()
    await putBackupTarget({ ...target, lastBackupAt })
    store.setStatus(projectId, { fileName: target.fileName, lastBackupAt })
    return true
  } catch (err) {
    console.error(err)
    const existing = useBackupStore.getState().byProject[projectId]
    if (existing) {
      store.patchStatus(projectId, {
        // A file the user moved, renamed or deleted is by far the most
        // likely cause, and it is the one the user can actually fix.
        error: 'Could not write the backup file — it may have been moved, renamed or deleted.',
      })
    }
    return false
  } finally {
    inFlight.delete(projectId)
  }
}

/**
 * The opt-in: pick a file once, and write it immediately so "backup on" and
 * "a backup exists" are true at the same moment rather than up to an
 * interval apart.
 */
export async function chooseBackupFile(project: Project): Promise<boolean> {
  const win = window as FilePickerWindow
  if (!win.showSaveFilePicker) return false
  try {
    const handle = await win.showSaveFilePicker({
      suggestedName: projectFileName(project, PROJECT_FILE_EXTENSION),
      types: [{ description: 'Book Studio Project', accept: { 'application/zip': [PROJECT_FILE_EXTENSION] } }],
    })
    await putBackupTarget({ projectId: project.id, handle, fileName: handle.name })
    useBackupStore.getState().setStatus(project.id, { fileName: handle.name })
    return await writeBackupNow(project, { interactive: true })
  } catch (err) {
    // Cancelling the picker is not an error worth reporting.
    if (err instanceof DOMException && err.name === 'AbortError') return false
    console.error(err)
    useBackupStore.getState().setStatus(project.id, {
      fileName: '',
      error: 'Could not set up the backup file.',
    })
    return false
  }
}

/** Re-grants write permission to a handle restored from a previous session.
 * Must be called from a user gesture — that is the browser's rule, not
 * this app's. */
export async function resumeBackups(project: Project): Promise<boolean> {
  return writeBackupNow(project, { interactive: true })
}

export async function stopBackingUp(projectId: string): Promise<void> {
  await deleteBackupTarget(projectId)
  useBackupStore.getState().clearStatus(projectId)
}

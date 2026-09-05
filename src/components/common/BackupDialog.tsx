import { useEffect, useState } from 'react'
import { HardDrive, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useBackupStore } from '@/store/backupStore'
import { backupsSupported, chooseBackupFile, resumeBackups, stopBackingUp, writeBackupNow } from '@/projectFile/backupService'
import { useExportProjectFile } from '@/projectFile/useExportProjectFile'
import {
  formatBytes,
  readPersistenceState,
  readStorageEstimate,
  STORAGE_WARNING_RATIO,
  type PersistenceState,
  type StorageEstimate,
} from '@/lib/storageHealth'
import type { Project } from '@/types'

interface BackupDialogProps {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatWhen(iso?: string): string {
  if (!iso) return 'not yet'
  const at = new Date(iso)
  const minutes = Math.round((Date.now() - at.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  return at.toLocaleString()
}

/**
 * Where this book actually lives, and what to do about it.
 *
 * The honest disclosure at the top is the part that matters most and the
 * part that did not exist before Phase 158: a browser-only app that never
 * says so leaves every author to discover it the hard way. Everything
 * below is the remedy — one file, chosen once, written automatically —
 * plus the two facts a person needs to judge whether they're safe: whether
 * the browser has agreed not to evict this origin, and how close the
 * storage is to full.
 */
export function BackupDialog({ project, open, onOpenChange }: BackupDialogProps) {
  const status = useBackupStore((s) => s.byProject[project.id])
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)
  const [persistence, setPersistence] = useState<PersistenceState>('unsupported')
  const [busy, setBusy] = useState(false)
  const manualSave = useExportProjectFile(project)
  const supported = backupsSupported()

  useEffect(() => {
    if (!open) return
    void readStorageEstimate().then(setEstimate)
    void readPersistenceState().then(setPersistence)
  }, [open, status?.lastBackupAt])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const tight = estimate !== null && estimate.ratio >= STORAGE_WARNING_RATIO

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Backups</DialogTitle>
          <DialogDescription>
            This book is stored inside this browser, on this device — including its version history. Clearing site data,
            switching browser, or losing the machine loses the book with it. A backup file is the copy that survives all
            three.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <HardDrive className="size-4 text-text-secondary" />
              Automatic backup
            </div>

            {!supported && (
              <>
                <p className="text-xs text-text-secondary">
                  This browser can&apos;t write to a file in the background — Safari and most phone browsers don&apos;t offer
                  it. Saving a copy by hand is the whole safety net here, so it&apos;s worth doing after every real
                  session of writing.
                </p>
                <Button type="button" variant="secondary" size="sm" disabled={manualSave.busy} onClick={() => void manualSave.runExport()}>
                  {manualSave.busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {manualSave.error ?? 'Save a copy now'}
                </Button>
              </>
            )}

            {supported && !status && (
              <>
                <p className="text-xs text-text-secondary">
                  Choose a file once and Book Studio keeps it up to date on its own, whenever the manuscript has changed.
                  Everything a project file holds goes into it: manuscript, pages, notes, images and planning.
                </p>
                <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => chooseBackupFile(project))}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Choose a backup file…
                </Button>
              </>
            )}

            {supported && status && (
              <>
                <p className="text-xs text-text-secondary">
                  Backing up to <span className="font-medium text-text-primary">{status.fileName || 'a file you chose'}</span> ·
                  last written {formatWhen(status.lastBackupAt)}.
                </p>
                {status.needsPermission && (
                  <p className="text-xs text-[var(--color-warning)]">
                    This browser needs your permission again before it can write that file — it asks once per session.
                  </p>
                )}
                {status.error && <p className="text-xs text-danger">{status.error}</p>}
                <div className="flex flex-wrap gap-2">
                  {status.needsPermission ? (
                    <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => resumeBackups(project))}>
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      Resume backups
                    </Button>
                  ) : (
                    <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => writeBackupNow(project, { interactive: true }))}>
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      Back up now
                    </Button>
                  )}
                  <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void run(() => chooseBackupFile(project))}>
                    Change file…
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => stopBackingUp(project.id))}>
                    Stop
                  </Button>
                </div>
              </>
            )}
          </section>

          <section className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              {tight ? <TriangleAlert className="size-4 text-[var(--color-warning)]" /> : <ShieldCheck className="size-4 text-text-secondary" />}
              Storage on this device
            </div>
            {estimate ? (
              <p className="text-xs text-text-secondary">
                Using {formatBytes(estimate.usageBytes)} of about {formatBytes(estimate.quotaBytes)} available
                {estimate.quotaBytes > 0 ? ` (${Math.round(estimate.ratio * 100)}%)` : ''}.
              </p>
            ) : (
              <p className="text-xs text-text-secondary">This browser doesn&apos;t report how much storage is left.</p>
            )}
            {tight && (
              <p className="text-xs text-[var(--color-warning)]">
                Nearly full. Save a backup now, then delete a finished project or unused images — a save that runs out of
                room can fail part-way.
              </p>
            )}
            <p className="text-xs text-text-muted">
              {persistence === 'persisted'
                ? 'This browser has agreed not to clear Book Studio’s data automatically.'
                : persistence === 'denied'
                  ? 'This browser may clear Book Studio’s data if the device runs low on space.'
                  : 'This browser doesn’t say whether it might clear stored data.'}
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

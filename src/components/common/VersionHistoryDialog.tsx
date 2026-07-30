import { useEffect, useState } from 'react'
import { History, Save, Trash2 } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/common/EmptyState'
import { cn } from '@/lib/utils'
import { useVersionStore } from '@/store/versionStore'
import type { Snapshot } from '@/store/snapshotDb'

interface VersionHistoryDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const KIND_STYLE: Record<Snapshot['kind'], string> = {
  auto: 'bg-background-secondary text-text-secondary',
  manual: 'bg-accent/15 text-accent',
}

/**
 * Version History — a coarse, occasional, whole-manuscript-plus-settings
 * safety net (periodic autosave snapshots + manual named saves), separate
 * from Phase 14's fine-grained, in-session undo/redo. Mirrors
 * `KeyboardShortcutsDialog.tsx`'s structure and `VirtualEditorWorkspace.tsx`'s
 * revision-history list style/tone.
 */
export function VersionHistoryDialog({ projectId, open, onOpenChange }: VersionHistoryDialogProps) {
  const snapshots = useVersionStore((s) => s.getSnapshots(projectId))
  const listSnapshots = useVersionStore((s) => s.listSnapshots)
  const createSnapshot = useVersionStore((s) => s.createSnapshot)
  const restoreSnapshot = useVersionStore((s) => s.restoreSnapshot)
  const deleteSnapshot = useVersionStore((s) => s.deleteSnapshot)

  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) void listSnapshots(projectId)
  }, [open, projectId, listSnapshots])

  const handleSaveNow = async () => {
    setBusy(true)
    try {
      await createSnapshot(projectId, 'manual', label)
      setLabel('')
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async (snapshot: Snapshot) => {
    if (!window.confirm(`Restore "${snapshot.label}"? Your current manuscript and settings will be replaced — a safety snapshot of what you have now will be saved first, so this can be undone by restoring again.`)) {
      return
    }
    setBusy(true)
    try {
      await restoreSnapshot(projectId, snapshot.id)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (snapshot: Snapshot) => {
    if (!window.confirm(`Delete the saved version "${snapshot.label}"? This cannot be undone.`)) return
    await deleteSnapshot(projectId, snapshot.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            Book Studio automatically saves a version periodically while you work. Save one manually before a big
            change, and restore any earlier version if something goes wrong.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-4">
          <Input
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
          />
          <Button variant="secondary" size="sm" className="shrink-0 gap-1.5" onClick={handleSaveNow} disabled={busy}>
            <Save className="size-3.5" />
            Save a version now
          </Button>
        </div>

        {snapshots.length === 0 ? (
          <EmptyState
            icon={History}
            title="No saved versions yet"
            description="Book Studio automatically saves one periodically while you work."
          />
        ) : (
          <ScrollArea className="h-80 -mx-1 pr-1">
            <div className="flex flex-col gap-2 px-1">
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-panel p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-text-primary">{snapshot.label}</p>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize', KIND_STYLE[snapshot.kind])}>
                        {snapshot.kind}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted">{new Date(snapshot.createdAt).toLocaleString()}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleRestore(snapshot)} disabled={busy}>
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete saved version "${snapshot.label}"`}
                    onClick={() => handleDelete(snapshot)}
                    disabled={busy}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}

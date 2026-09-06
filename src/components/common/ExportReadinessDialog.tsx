import { AlertTriangle } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Finding } from '@/virtualEditor/types'

interface ExportReadinessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  findings: Finding[]
  /**
   * Which export was asked for. The dialog names it, rather than taking a
   * pre-written label: the two shells used to pass their own ("the PDF" on
   * desktop, "PDF" on mobile) and one of them read ungrammatically —
   * "You can export PDF anyway" (Phase 161).
   */
  format: 'pdf' | 'epub' | 'html'
  onExportAnyway: () => void
}

/**
 * Shown before an export proceeds when `useExportReadiness` finds
 * `critical`/`major` print-readiness or commercial-quality issues — the
 * concrete surface for `docs/ROADMAP.md` Phase D's "Print-on-demand
 * validation profiles" item. Never blocks the export outright (per
 * `CLAUDE.md`'s "AI assists, never replaces" spirit extended to this
 * gate): the user can always choose "Export anyway" — this is a warning,
 * not a lock.
 */
const FORMAT_LABEL: Record<'pdf' | 'epub' | 'html', string> = {
  pdf: 'the PDF',
  epub: 'the EPUB',
  html: 'the web page',
}

export function ExportReadinessDialog({ open, onOpenChange, findings, format, onExportAnyway }: ExportReadinessDialogProps) {
  const blocking = findings.filter((f) => f.severity === 'critical' || f.severity === 'major')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            Before you export
          </DialogTitle>
          <DialogDescription>
            This book has {blocking.length} print-readiness/commercial-quality issue{blocking.length === 1 ? '' : 's'} that
            print-on-demand platforms like Amazon KDP or IngramSpark typically flag. You can export {FORMAT_LABEL[format]} anyway —
            these are warnings, not a hard block.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {blocking.map((finding) => (
            <div key={finding.id} className="rounded-[var(--radius-card)] border border-border bg-background-secondary p-3">
              <p className="text-sm font-medium text-text-primary">{finding.message}</p>
              <p className="mt-1 text-xs text-text-secondary">{finding.whyItMatters}</p>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Go back and fix
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onOpenChange(false)
              onExportAnyway()
            }}
          >
            Export anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

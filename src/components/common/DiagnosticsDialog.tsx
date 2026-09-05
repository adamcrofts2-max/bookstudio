import { useState } from 'react'
import { AlertTriangle, Check, Copy, Trash2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { useErrorLogStore, type LoggedError } from '@/store/errorLogStore'
import { saveBlob } from '@/utils/saveBlob'

interface DiagnosticsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SOURCE_LABEL: Record<LoggedError['source'], string> = {
  render: 'while drawing the screen',
  window: 'in a button or gesture',
  'unhandled-rejection': 'in a background task',
}

/**
 * Everything a useful bug report needs, in one place, with the app's own
 * name for each thing rather than the browser's.
 *
 * Version and build date are deliberately absent: this app has no release
 * pipeline stamping them in, and a hardcoded string that drifts is worse
 * than no string. What is here is all directly observable and all relevant
 * to reproducing a fault.
 */
function buildReport(errors: LoggedError[]): string {
  const lines: string[] = ['Book Studio — diagnostics', '']
  lines.push(`Generated: ${new Date().toISOString()}`)
  if (typeof window !== 'undefined') {
    lines.push(`Page: ${window.location.pathname}`)
    lines.push(`Screen: ${window.innerWidth}x${window.innerHeight} @ ${window.devicePixelRatio}x`)
    lines.push(`Touch: ${window.matchMedia('(hover: none)').matches ? 'yes' : 'no'}`)
    lines.push(`Browser: ${navigator.userAgent}`)
    lines.push(`Language: ${navigator.language}`)
    lines.push(`Online: ${navigator.onLine ? 'yes' : 'no'}`)
  }
  lines.push('')
  lines.push(errors.length === 0 ? 'No errors recorded.' : `${errors.length} error(s), newest first:`)
  for (const error of errors) {
    lines.push('')
    lines.push('----------------------------------------')
    lines.push(`${error.at}  [${error.source}${error.area ? ` — ${error.area}` : ''}]`)
    if (error.path) lines.push(`on ${error.path}`)
    lines.push(`${error.name}: ${error.message}`)
    if (error.stack) lines.push(error.stack.trim())
  }
  return lines.join('\n')
}

/**
 * "Report a problem" — the local error log, readable and handed over in one
 * action.
 *
 * Book Studio has no crash-reporting service and will not have one before
 * Phase G. This is what can be built without one, and it turns out to be the
 * part that was actually missing: the Phase 134 mobile crash reached the
 * author as a **photograph of a phone screen**, because there was no way to
 * get the message off the device. Copy puts a full report on the clipboard;
 * Save writes it to a file, which is the only route that works when a phone
 * keyboard is in the way of a long paste.
 */
export function DiagnosticsDialog({ open, onOpenChange }: DiagnosticsDialogProps) {
  const errors = useErrorLogStore((s) => s.errors)
  const clear = useErrorLogStore((s) => s.clear)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(buildReport(errors))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused outright (an insecure context, a
      // permission prompt declined). Saving the file always works, and the
      // button for it is right there — so this fails quietly rather than
      // throwing an error into the dialog that exists to report errors.
    }
  }

  const handleSave = () =>
    void saveBlob(
      new Blob([buildReport(errors)], { type: 'text/plain' }),
      'book-studio-diagnostics.txt',
      'Diagnostics',
      'text/plain',
      '.txt',
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4" />
            Report a problem
          </DialogTitle>
          <DialogDescription>
            Anything that has gone wrong on this device, kept locally and never sent anywhere. Copy or save it
            to include in a bug report.
          </DialogDescription>
        </DialogHeader>

        {errors.length === 0 ? (
          <EmptyState
            icon={Check}
            title="Nothing has gone wrong"
            description="No errors have been recorded on this device. If something breaks, it will show up here."
            className="py-10"
          />
        ) : (
          <ul className="flex max-h-[min(22rem,50vh)] flex-col gap-2 overflow-y-auto">
            {errors.map((error) => (
              <li key={error.id} className="rounded-[var(--radius-card)] border border-border bg-panel p-3">
                <p className="text-sm font-medium text-text-primary">
                  {error.name}: {error.message}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {new Date(error.at).toLocaleString()} · {SOURCE_LABEL[error.source]}
                  {error.area ? ` · ${error.area}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="flex-wrap">
          {errors.length > 0 && (
            <Button variant="ghost" className="gap-1.5 text-text-secondary hover:text-danger" onClick={clear}>
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          )}
          <Button variant="secondary" onClick={handleSave} disabled={errors.length === 0}>
            Save as a file
          </Button>
          <Button variant="primary" className="gap-1.5" onClick={handleCopy} disabled={errors.length === 0}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

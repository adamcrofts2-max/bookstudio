import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Ctrl/⌘ Z', label: 'Undo' },
  { keys: 'Ctrl/⌘ Shift+Z', label: 'Redo' },
  { keys: '[', label: 'Toggle sidebar' },
  { keys: ']', label: 'Toggle inspector' },
  { keys: 'V', label: 'Toggle spread / single page view' },
  { keys: '+ / -', label: 'Zoom in / out' },
  { keys: '0', label: 'Reset zoom to 100%' },
  { keys: 'Esc', label: 'Deselect' },
]

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Available while the editor is focused (not while typing in a field).</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col divide-y divide-border">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between py-2">
              <span className="text-sm text-text-secondary">{s.label}</span>
              <kbd className="rounded-md border border-border bg-background-secondary px-2 py-0.5 text-xs font-medium text-text-primary">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

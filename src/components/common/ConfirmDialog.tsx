import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** What is about to happen, in the user's terms. Name the thing being
   * destroyed — "Delete The Hidden Library?" tells you which book; "Are you
   * sure?" does not. */
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
}

/**
 * One shared "this cannot be undone" gate.
 *
 * The app's long-standing convention was to delete on a single click with no
 * confirmation, which was survivable while every delete control was revealed
 * by hover — a mouse pointer has to travel there deliberately. It stopped
 * being survivable the moment those controls became permanently visible on
 * touch (see the `can-hover:` variant in `index.css`), because on a phone the
 * bin icon sits under the thumb the whole time the list is being scrolled.
 *
 * Used for the two deletes that destroy work the user cannot get back: a
 * project (the manuscript itself) and a saved template. Deletes that only
 * remove a reference — a block, a page, a node — stay single-click, because
 * undo already covers them.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* Cancel takes focus, not Delete: the dialog exists to make the
              destructive path deliberate, and a focused Delete would make
              Enter destroy the thing faster than clicking ever could. */}
          <Button variant="secondary" autoFocus onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

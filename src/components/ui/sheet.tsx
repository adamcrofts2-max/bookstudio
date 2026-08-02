import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A bottom sheet — same Radix `Dialog` primitive as `dialog.tsx` (focus
 * trap, `Escape`-to-close, overlay-click-to-close, all identical), just
 * anchored to the bottom edge and full-width instead of centered, for
 * `MobileWorkspace`'s chapter switcher. Forked rather than parameterising
 * `DialogContent` itself: the positioning/animation classes are different
 * enough (`bottom-0 inset-x-0` + slide vs. `top-1/2 -translate-y-1/2` +
 * zoom) that a shared component would need a `variant` prop threading
 * through every className, for a primitive only ever used by one mobile
 * surface today.
 */
const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetPortal = DialogPrimitive.Portal
const SheetClose = DialogPrimitive.Close

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] w-full flex-col',
        'rounded-t-[var(--radius-dialog)] border-t border-border bg-panel shadow-[var(--shadow-md)]',
        'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
        'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom',
        'duration-200 ease-[var(--ease-standard)]',
        className,
      )}
      {...props}
    >
      <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border" />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1.5 text-text-muted transition-colors duration-150 hover:bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">
        <X className="size-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-3 flex flex-col gap-1', className)} {...props} />
)

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-h5 font-semibold text-text-primary', className)} {...props} />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

export { Sheet, SheetTrigger, SheetPortal, SheetClose, SheetOverlay, SheetContent, SheetHeader, SheetTitle }

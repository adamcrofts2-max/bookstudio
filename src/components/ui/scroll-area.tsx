import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'

import { cn } from '@/lib/utils'

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    {/* Radix's Viewport wraps whatever we pass as `children` in its own
       internal div styled `{ minWidth: '100%', display: 'table' }` (see
       @radix-ui/react-scroll-area's source) — it uses table auto-layout to
       measure content size for the scrollbar math. Table layout sizes a
       column to the *max-content* width of its contents unless something
       overrides it, which quietly defeats `min-w-0` + `truncate` on any
       row we render inside a ScrollArea: `white-space: nowrap` (part of
       `truncate`) makes a label's min-content width equal its full
       unwrapped width, so the table wrapper grows the row to fit the whole
       label instead of letting it ellipsize, pushing anything after it
       (action buttons) wider than the 264px sidebar. Because this
       Viewport's `overflow-x` is `hidden` (not `scroll` — only a vertical
       scrollbar is wired up below), that overflow isn't reachable by
       scrolling either: it's simply clipped off, invisible and unusable.
       This is why Phase 98/204's `min-w-0` on the row itself didn't
       actually fix "Acknowledgements pushes copy/delete off the sidebar"
       (user report, 2026-08-02) — the real constraint being violated lived
       one level up, inside a node this file doesn't render and can't pass
       props to. `[&>div]:!block` overrides Radix's inline `display: table`
       (Tailwind's `!important` beats an inline style) on that one
       generated wrapper, restoring normal block sizing — width simply
       follows the parent's 100% instead of the content's preferred width —
       so every consumer's existing `min-w-0`/`truncate` works the way it
       already looks like it should, with no per-row workaround needed. */}
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors duration-150',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-px',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-px',
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-9 items-center gap-1 rounded-[var(--radius-button)] bg-background-secondary p-1 text-text-secondary',
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // min-w-0 is the fix, not decoration: a flex item's default min-width
      // is "auto" (its content's natural size), so a `flex-1` trigger row
      // that doesn't fit at every label's full nowrap width silently
      // overflows its container instead of shrinking — the last trigger(s)
      // render off the visible edge with no scrollbar or visual sign
      // anything is wrong. Sidebar's 4-tab row (Chapters/Structure/Assets/
      // Search) hit exactly this once Search was added as a 4th tab.
      // `truncate` is the matching fallback for when even a shrunk trigger
      // still can't fit its label — an ellipsis instead of the same
      // silent-overflow failure one level down.
      'inline-flex min-w-0 items-center justify-center truncate rounded-[calc(var(--radius-button)_-_4px)] px-3 py-1 text-sm font-medium transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:bg-panel data-[state=active]:text-text-primary data-[state=active]:shadow-[var(--shadow-sm)]',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-3 focus-visible:outline-none',
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }

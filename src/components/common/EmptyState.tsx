import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** A calm, centred empty state — used whenever a panel has nothing to show yet. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-8 py-16 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-background-secondary">
        <Icon className="size-5 text-text-muted" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {description && <p className="max-w-[32ch] text-sm text-text-secondary">{description}</p>}
      </div>
      {action}
    </div>
  )
}

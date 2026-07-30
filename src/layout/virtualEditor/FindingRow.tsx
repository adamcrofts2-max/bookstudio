import { CheckCircle2, EyeOff, Layers, Pencil, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Finding, FindingStatus } from '@/virtualEditor/types'

const SEVERITY_STYLE: Record<Finding['severity'], string> = {
  critical: 'bg-danger text-danger-foreground',
  major: 'bg-danger/15 text-danger',
  minor: 'bg-warning/15 text-warning',
  suggestion: 'bg-background-secondary text-text-secondary',
}

interface FindingRowProps {
  finding: Finding
  status: FindingStatus
  chapterTitle: string
  onLocate: () => void
  onAccept: () => void
  onEdit: () => void
  onStatus: (status: FindingStatus) => void
  onIgnoreSimilar: () => void
}

/**
 * One finding in the Editorial Dashboard's review list. Every row states
 * what's wrong and why it matters (the spec's non-negotiable "never a
 * black box") and exposes the full action set: Accept / Reject / Edit /
 * Ignore / Ignore Similar / Apply to Chapter / Apply to Book. Apply to
 * Chapter/Book are visibly disabled — batch-apply isn't built yet, and
 * this milestone would rather say so than fake it. Edit switches back to
 * the manuscript workspace, selects the finding's block and enters inline
 * edit mode on it directly (see `BlockContent.tsx`'s `autoEdit` prop).
 */
export function FindingRow({
  finding,
  status,
  chapterTitle,
  onLocate,
  onAccept,
  onEdit,
  onStatus,
  onIgnoreSimilar,
}: FindingRowProps) {
  const resolved = status !== 'new'
  const canEdit = Boolean(finding.location.blockId)

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-panel p-4',
        resolved && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', SEVERITY_STYLE[finding.severity])}>
          {finding.severity}
        </span>
        <span className="text-xs uppercase tracking-wide text-text-muted">{formatCategory(finding.category)}</span>
        <span className="text-xs text-text-muted">· {Math.round(finding.confidence * 100)}% confidence</span>
        <button type="button" onClick={onLocate} className="ml-auto text-xs font-medium text-accent hover:underline">
          {chapterTitle} →
        </button>
      </div>

      <p className="text-sm font-medium text-text-primary">{finding.message}</p>
      <p className="text-xs text-text-secondary">
        <span className="font-medium text-text-primary">Why it matters: </span>
        {finding.whyItMatters}
      </p>

      {finding.suggestedFix && (
        <p className="text-xs text-text-secondary">
          <span className="font-medium text-text-primary">Suggested fix: </span>
          {finding.suggestedFix.summary}
        </p>
      )}

      {status === 'new' ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {finding.suggestedFix && (
            <Button variant="primary" size="sm" className="gap-1.5" onClick={onAccept}>
              <CheckCircle2 className="size-3.5" />
              Accept
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onStatus('rejected')}>
            <XCircle className="size-3.5" />
            Reject
          </Button>
          {canEdit ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="ghost" size="sm" disabled className="gap-1.5">
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>This finding describes a book-wide pattern, not a single block — there's nothing to jump to directly</TooltipContent>
            </Tooltip>
          )}
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onStatus('ignored')}>
            <EyeOff className="size-3.5" />
            Ignore
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onIgnoreSimilar}>
            <Layers className="size-3.5" />
            Ignore similar
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="ghost" size="sm" disabled>
                  Apply to chapter
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Not yet implemented — batch apply lands in a later milestone</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="ghost" size="sm" disabled>
                  Apply to book
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Not yet implemented — batch apply lands in a later milestone</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <p className="pt-1 text-xs font-medium capitalize text-text-muted">{formatStatus(status)}</p>
      )}
    </div>
  )
}

function formatCategory(category: string): string {
  return category.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function formatStatus(status: FindingStatus): string {
  if (status === 'ignoredSimilar') return 'Ignored (similar findings)'
  return status
}

import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useBlockStyleStore } from '@/store/blockStyleStore'
import { BLOCK_LEADING_STEPS, BLOCK_SIZE_STEPS, isDefaultOverride } from '@/types/blockStyle'
import { cn } from '@/lib/utils'

interface BlockTypographyControlsProps {
  projectId: string
  blockId: string
}

function StepRow({
  label,
  steps,
  current,
  onPick,
}: {
  label: string
  steps: readonly { value: number; label: string }[]
  current: number
  onPick: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {steps.map((step) => (
          <button
            key={step.value}
            type="button"
            aria-pressed={current === step.value}
            onClick={() => onPick(step.value)}
            className={cn(
              'rounded-[var(--radius-button)] border px-2 py-2 text-[13px] font-medium transition-colors',
              current === step.value
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-border text-text-secondary hover:text-text-primary',
            )}
          >
            {step.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * One block's departure from the book's typography — a step smaller or
 * larger, a step tighter or looser — shared verbatim by the desktop
 * Inspector's Type tab and mobile's block sheet (Phase 171).
 *
 * Shared rather than written twice because the two shells must offer the
 * *same* steps: a book edited on a phone and finished on a laptop is one
 * book, and a mobile-only 0.95 that desktop cannot name would be a value no
 * one could set again. That is also why the steps are discrete — see
 * `types/blockStyle.ts`.
 *
 * `docs/ROADMAP.md` carried this as a mobile item, "deliberately not built
 * with the other two: a phone is where prose gets written, not where a
 * single paragraph's leading gets tuned". The first half of that is still
 * right, and it is why this sits below the block's own content in the
 * sheet rather than above it. The mistake in the framing was that the
 * feature did not exist on *either* shell — it was filed as a mobile gap
 * when it was a whole-app one.
 */
export function BlockTypographyControls({ projectId, blockId }: BlockTypographyControlsProps) {
  const override = useBlockStyleStore((s) => s.byProject[projectId]?.[blockId])
  const setOverride = useBlockStyleStore((s) => s.setOverride)
  const clearOverride = useBlockStyleStore((s) => s.clearOverride)

  const size = override?.sizeScale ?? 1
  const leading = override?.leadingScale ?? 1
  const customised = !isDefaultOverride(override)

  return (
    <div className="flex flex-col gap-3">
      <StepRow
        label="Size"
        steps={BLOCK_SIZE_STEPS}
        current={size}
        onPick={(sizeScale) => setOverride(projectId, blockId, { sizeScale, leadingScale: leading })}
      />
      <StepRow
        label="Leading"
        steps={BLOCK_LEADING_STEPS}
        current={leading}
        onPick={(leadingScale) => setOverride(projectId, blockId, { sizeScale: size, leadingScale })}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-secondary">
          {customised ? 'This block departs from the book’s typography.' : 'Following the book’s typography.'}
        </p>
        {customised && (
          <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={() => clearOverride(projectId, blockId)}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        )}
      </div>
    </div>
  )
}

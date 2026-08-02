import { IdeaInboxPanel } from '@/layout/planning/IdeaInboxPanel'
import { useUiStore } from '@/store/uiStore'

interface MobileIdeasViewProps {
  projectId: string
}

/**
 * Mobile "Ideas" tab (Phase 95) — `IdeaInboxPanel` (List/Board, Map removed
 * Phase 99) already renders as a self-contained, reasonably narrow-friendly
 * column (its own header, filter pills, and List/Board toggle all wrap
 * rather than overflow; Board's `columns-2 sm:columns-3` already has a
 * narrow-screen fallback). No mobile-specific fork needed — this wrapper
 * exists so `MobileWorkspace`'s tab tree has a named, mobile-owned mount
 * point rather than reaching into `layout/planning` directly, keeping the
 * door open for mobile-only Ideas affordances later without touching the
 * shared desktop component.
 *
 * "Open Book Graph" (Phase 99) drops out of the dedicated mobile shell into
 * Develop mode, same as `PlanningShell.tsx`'s desktop version — Develop
 * isn't mobile-optimised yet (tracked as follow-up work, not this pass),
 * but that's still strictly better than a dead button with nowhere to go.
 */
export function MobileIdeasView({ projectId }: MobileIdeasViewProps) {
  const setAppMode = useUiStore((s) => s.setAppMode)
  return (
    <div className="h-full overflow-y-auto">
      <IdeaInboxPanel projectId={projectId} onOpenBookGraph={() => setAppMode('planning')} />
    </div>
  )
}

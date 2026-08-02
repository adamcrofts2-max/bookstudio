import { IdeaInboxPanel } from '@/layout/planning/IdeaInboxPanel'

interface MobileIdeasViewProps {
  projectId: string
}

/**
 * Mobile "Ideas" tab (Phase 95) — `IdeaInboxPanel` (List/Board/Map, Phases
 * 78-94) already renders as a self-contained, reasonably narrow-friendly
 * column (its own header, filter pills, and List/Board/Map toggle all wrap
 * rather than overflow; Board's `columns-2 sm:columns-3` already has a
 * narrow-screen fallback). No mobile-specific fork needed — this wrapper
 * exists so `MobileWorkspace`'s tab tree has a named, mobile-owned mount
 * point rather than reaching into `layout/planning` directly, keeping the
 * door open for mobile-only Ideas affordances later without touching the
 * shared desktop component.
 */
export function MobileIdeasView({ projectId }: MobileIdeasViewProps) {
  return (
    <div className="h-full overflow-y-auto">
      <IdeaInboxPanel projectId={projectId} />
    </div>
  )
}

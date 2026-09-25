import { ChevronLeft } from 'lucide-react'

import { SearchPanel } from '@/layout/SearchPanel'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import type { Project } from '@/types'

interface MobileSearchViewProps {
  project: Project
  onBack: () => void
}

/**
 * Find and replace on a phone. `SearchPanel` takes only a `project` and is
 * already a narrow single-column panel (it lives in a ~320px sidebar tab), so
 * it needs a back header and nothing else — the same reuse that gave mobile
 * the structural-page editor and the Virtual Editor.
 *
 * Worth having on mobile specifically because scrolling is the only other way
 * to find a phrase in a manuscript there: desktop at least has a wide chapter
 * list to scan.
 */
export function MobileSearchView({ project, onBack }: MobileSearchViewProps) {
  return (
    <div className="flex h-full flex-col bg-background">
      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-1.5 border-b border-border bg-panel px-3 py-3 text-left active:bg-hover"
      >
        <ChevronLeft className="size-4 shrink-0 text-text-muted" />
        <span className="text-[15px] font-medium text-text-secondary">More</span>
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ErrorBoundary area="search">
          <SearchPanel project={project} />
        </ErrorBoundary>
      </div>
    </div>
  )
}

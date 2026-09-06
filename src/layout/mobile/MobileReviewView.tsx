import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { VirtualEditorWorkspace } from '@/layout/virtualEditor/VirtualEditorWorkspace'
import type { Project } from '@/types'

interface MobileReviewViewProps {
  project: Project
}

/**
 * The Virtual Editor on a phone.
 *
 * `VirtualEditorWorkspace` takes only a `project` and reads everything else
 * from stores, so this is a thin host rather than a mobile reimplementation —
 * the same reuse that gave mobile the structural-page editor in Phase 136.
 * Running the real thing also means a review run on a phone applies exactly
 * the same checkers and scoring as on desktop; a cut-down mobile "review"
 * that scored differently would be worse than none.
 *
 * The boundary is here rather than inside the workspace because a review runs
 * user manuscript text through every checker at once, which is the most
 * likely place in the app to meet an input nobody anticipated. A crash should
 * cost the review, not the tab bar underneath it.
 */
export function MobileReviewView({ project }: MobileReviewViewProps) {
  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-background">
      <ErrorBoundary area="the Virtual Editor">
        <VirtualEditorWorkspace project={project} />
      </ErrorBoundary>
    </div>
  )
}

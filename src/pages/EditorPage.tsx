import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/layout/AppShell'
import { PlanningShell } from '@/layout/planning/PlanningShell'
import { MobileWorkspace } from '@/layout/mobile/MobileWorkspace'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useProjectStore } from '@/store/projectStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useUiStore } from '@/store/uiStore'

/** Resolves the active project from the route and renders the editor shell.
 * First branches on viewport width (`useIsMobile`) — a phone-width screen
 * always gets `MobileWorkspace` (Phase 95), the simplified single-column
 * writing + Idea-capture mode, regardless of `appMode`: the desktop
 * Write/Develop split doesn't apply once the page canvas and Layer 0
 * planning tools aren't there to switch between. Above that width, branches
 * on `uiStore.appMode` as before to decide between `AppShell` (the
 * manuscript editor) and `PlanningShell` (Layer 0), per the "new top-level
 * mode/tab, not a sidebar section" decision in `docs/AI_WORKSPACE_VISION.md`.
 * A pure-manuscript desktop user who never switches modes never mounts
 * `PlanningShell` at all; a phone user never mounts either desktop shell. */
export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const project = useProjectStore((s) => (projectId ? s.getProject(projectId) : undefined))
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const clearSelection = useSelectionStore((s) => s.clear)
  const appMode = useUiStore((s) => s.appMode)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (projectId) setActiveProject(projectId)
    return () => setActiveProject(null)
  }, [projectId, setActiveProject])

  // A block/chapter selection is only meaningful within the project that
  // produced it — never let it leak into the next project opened.
  useEffect(() => {
    return () => clearSelection()
  }, [projectId, clearSelection])

  useEffect(() => {
    if (!project) navigate('/', { replace: true })
  }, [project, navigate])

  if (!project) return null

  if (isMobile) return <MobileWorkspace project={project} />

  return appMode === 'planning' ? <PlanningShell project={project} /> : <AppShell project={project} />
}

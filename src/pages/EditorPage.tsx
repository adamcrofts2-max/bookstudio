import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/layout/AppShell'
import { useProjectStore } from '@/store/projectStore'

/** Resolves the active project from the route and renders the editor shell. */
export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const project = useProjectStore((s) => (projectId ? s.getProject(projectId) : undefined))
  const setActiveProject = useProjectStore((s) => s.setActiveProject)

  useEffect(() => {
    if (projectId) setActiveProject(projectId)
    return () => setActiveProject(null)
  }, [projectId, setActiveProject])

  useEffect(() => {
    if (!project) navigate('/', { replace: true })
  }, [project, navigate])

  if (!project) return null

  return <AppShell project={project} />
}

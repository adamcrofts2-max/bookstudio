import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Moon, Plus, Sun, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/common/EmptyState'
import { Logo } from '@/components/common/Logo'
import { useProjectStore } from '@/store/projectStore'
import { useTheme } from '@/hooks/useTheme'
import { formatRelativeTime } from '@/utils'
import { NewProjectDialog } from '@/pages/NewProjectDialog'

/** Home screen: the library of projects. First screen a user ever sees. */
export function ProjectsPage() {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const { resolved, setAppearance } = useTheme()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
      <div className="min-h-dvh bg-background">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <Logo withWordmark />
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Toggle appearance"
                  onClick={() => setAppearance(resolved === 'dark' ? 'light' : 'dark')}
                >
                  {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle appearance</TooltipContent>
            </Tooltip>
            <Button variant="primary" size="md" className="gap-1.5" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              New Project
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-8 pb-16">
          {projects.length === 0 ? (
            <div className="mt-12 rounded-[var(--radius-card)] border border-dashed border-border">
              <EmptyState
                icon={BookOpen}
                title="Your library is empty"
                description="Create your first project to start designing a beautiful, print-ready book."
                action={
                  <Button variant="primary" className="mt-2 gap-1.5" onClick={() => setDialogOpen(true)}>
                    <Plus className="size-4" />
                    Create your first book
                  </Button>
                }
                className="py-24"
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/project/${project.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/project/${project.id}`)
                  }}
                  className="group relative flex cursor-pointer flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-panel p-5 text-left transition-colors duration-150 hover:bg-hover"
                >
                  <div className="flex h-24 items-end gap-1">
                    <div className="h-full w-10 rounded-l-[var(--radius-preview)] rounded-r-sm border border-border bg-background-secondary" />
                    <div className="h-full w-10 rounded-r-[var(--radius-preview)] rounded-l-sm border border-border bg-background-secondary" />
                  </div>
                  <div>
                    <p className="truncate text-sm font-semibold text-text-primary">{project.name}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Updated {formatRelativeTime(project.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${project.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteProject(project.id)
                    }}
                    className="absolute right-3 top-3 rounded-full p-1.5 text-text-muted opacity-0 transition-opacity duration-150 hover:bg-hover hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>

        <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
  )
}

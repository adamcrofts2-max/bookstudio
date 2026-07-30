import { BookOpen, Columns2, Minus, Plus, Rows3, SquareStack } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ImportManuscriptButton } from '@/editor/ImportManuscriptButton'
import { BookRenderer } from '@/renderer/BookRenderer'
import { VirtualEditorWorkspace } from '@/layout/virtualEditor/VirtualEditorWorkspace'
import { useContentStore } from '@/store/contentStore'
import { useUiStore } from '@/store/uiStore'
import type { Project } from '@/types'

interface WorkspaceProps {
  project: Project
}

function ViewControls() {
  const viewMode = useUiStore((s) => s.viewMode)
  const setViewMode = useUiStore((s) => s.setViewMode)
  const zoom = useUiStore((s) => s.zoom)
  const setZoom = useUiStore((s) => s.setZoom)
  const showThumbnails = useUiStore((s) => s.showThumbnails)
  const toggleThumbnails = useUiStore((s) => s.toggleThumbnails)

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-panel px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={toggleThumbnails} aria-label="Toggle page thumbnails">
            <Rows3 className={showThumbnails ? 'size-4 text-accent' : 'size-4'} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Page thumbnails</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewMode(viewMode === 'spread' ? 'single' : 'spread')}
            aria-label="Toggle spread view"
          >
            {viewMode === 'spread' ? <Columns2 className="size-4 text-accent" /> : <SquareStack className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{viewMode === 'spread' ? 'Two-page spread' : 'Single page'}</TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setZoom(zoom - 0.1)} aria-label="Zoom out">
          <Minus className="size-4" />
        </Button>
        <span className="w-10 text-center text-xs text-text-secondary">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" onClick={() => setZoom(zoom + 0.1)} aria-label="Zoom in">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Centre column: the book preview — the hero of the application. Shows a
 * calm import invitation until a manuscript exists, then the paginated,
 * themed book itself.
 */
export function Workspace({ project }: WorkspaceProps) {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const workspaceMode = useUiStore((s) => s.workspaceMode)

  if (workspaceMode === 'virtualEditor') {
    return <VirtualEditorWorkspace project={project} />
  }

  if (!manuscript) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto bg-background-secondary px-8 py-12">
        <div className="flex flex-col items-center gap-8">
          <div className="flex items-end gap-1">
            <div className="h-[280px] w-[200px] rounded-l-[var(--radius-preview)] rounded-r-sm border border-border bg-panel shadow-[var(--shadow-md)]" />
            <div className="h-[280px] w-[200px] rounded-r-[var(--radius-preview)] rounded-l-sm border border-border bg-panel shadow-[var(--shadow-md)]" />
          </div>

          <div className="flex max-w-[38ch] flex-col items-center gap-2 text-center">
            <h2 className="text-h4 font-semibold text-text-primary">{project.name} is ready for a manuscript</h2>
            <p className="text-sm text-text-secondary">
              Import a manuscript and Book Studio will lay out a professional, print-ready book
              automatically — chapters, pagination, table of contents and all.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ImportManuscriptButton projectId={project.id} />
            <Button variant="outline" size="md" disabled className="gap-2">
              <BookOpen className="size-4" />
              Browse Templates
            </Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewControls />
      <BookRenderer project={project} manuscript={manuscript} />
    </div>
  )
}

import { Columns2, Minus, PenLine, Plus, Rows3, SquareStack } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ImportManuscriptButton } from '@/editor/ImportManuscriptButton'
import { BookRenderer } from '@/renderer/BookRenderer'
import { VirtualEditorWorkspace } from '@/layout/virtualEditor/VirtualEditorWorkspace'
import { IdeaCaptureAffordance } from '@/layout/IdeaCaptureAffordance'
import { useContentStore } from '@/store/contentStore'
import { useUiStore } from '@/store/uiStore'
import { useSelectionStore } from '@/store/selectionStore'
import { addChapterWithHistory } from '@/store/editorActions'
import type { Project } from '@/types'

interface WorkspaceProps {
  project: Project
}

function ViewControls() {
  const viewMode = useUiStore((s) => s.viewMode)
  const setViewMode = useUiStore((s) => s.setViewMode)
  const zoom = useUiStore((s) => s.zoom)
  const setZoom = useUiStore((s) => s.setZoom)
  const zoomMode = useUiStore((s) => s.zoomMode)
  const setZoomMode = useUiStore((s) => s.setZoomMode)
  const appliedZoom = useUiStore((s) => s.appliedZoom)
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
        {/* Names what a click will do, not what is on screen: with single
            page now the default (Phase 178), "Single page" read as a
            description of the current state and hid the spread entirely. */}
        <TooltipContent>{viewMode === 'spread' ? 'Show one page at a time' : 'Show facing pages (two-page spread)'}</TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-1">
        {/* Zooming out from Fit starts at what Fit currently is, not at the
            stale manual value — otherwise the first press of "−" jumps the
            page *bigger*, which is the opposite of what was asked for. */}
        <Button variant="ghost" size="icon" onClick={() => setZoom((zoomMode === 'fit' ? appliedZoom : zoom) - 0.1)} aria-label="Zoom out">
          <Minus className="size-4" />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setZoomMode(zoomMode === 'fit' ? 'manual' : 'fit')}
              aria-label={zoomMode === 'fit' ? 'Zoom to 100%' : 'Fit to the window'}
              className={cn(
                'h-7 min-w-14 rounded-[var(--radius-button)] px-2 text-center text-xs tabular-nums transition-colors hover:bg-hover',
                zoomMode === 'fit' ? 'text-accent' : 'text-text-secondary',
              )}
            >
              {zoomMode === 'fit' ? `Fit ${Math.round(appliedZoom * 100)}%` : `${Math.round(zoom * 100)}%`}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {zoomMode === 'fit'
              ? `Fitting the ${viewMode === 'spread' ? 'spread' : 'page'} to the window — click for 100%`
              : `Click to fit the ${viewMode === 'spread' ? 'spread' : 'page'} to the window`}
          </TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon" onClick={() => setZoom((zoomMode === 'fit' ? appliedZoom : zoom) + 0.1)} aria-label="Zoom in">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * What a brand-new project shows before it has a word in it.
 *
 * Phase 174 turned this round. It used to lead with **Import Manuscript**,
 * beside a permanently `disabled` "Browse Templates" button, under the
 * headline "{project name} is ready for a manuscript" — which read as a
 * three-line sentence for anyone whose idea was longer than a few words,
 * since the project's name *is* the sentence they typed.
 *
 * Two things were wrong with that. The app had just asked "What's the
 * idea?" and been given one; answering that with "import the book you
 * already wrote" is a non-sequitur for the exact user it courted. And the
 * mobile shell had always said the opposite — "Start your first chapter to
 * begin writing on the go, or bring in a manuscript from More → Import" —
 * so the two shells gave contradictory advice about the same empty state.
 *
 * Writing leads now, importing is the alternative, and the dead button is
 * gone: templates are real (there is a gallery, and New Project can start
 * from one), so a greyed-out control promising them was worse than nothing.
 */
function EmptyProject({ project }: { project: Project }) {
  const requestScrollToChapter = useSelectionStore((s) => s.requestScrollToChapter)

  const startWriting = () => {
    const chapterId = addChapterWithHistory(project.id, null, 'Untitled Chapter')
    requestScrollToChapter(chapterId)
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto bg-background-secondary px-8 py-12">
      <div className="flex flex-col items-center gap-8">
        <div className="flex items-end gap-1">
          <div className="h-[280px] w-[200px] rounded-l-[var(--radius-preview)] rounded-r-sm border border-border bg-panel shadow-[var(--shadow-md)]" />
          <div className="h-[280px] w-[200px] rounded-r-[var(--radius-preview)] rounded-l-sm border border-border bg-panel shadow-[var(--shadow-md)]" />
        </div>

        <div className="flex max-w-[42ch] flex-col items-center gap-2 text-center">
          {/* The book's name on its own line rather than as the subject of a
              sentence — an idea typed as a sentence used to become a
              three-line headline. */}
          <p className="text-xs uppercase tracking-[0.08em] text-text-muted">{project.name}</p>
          <h2 className="text-h4 font-semibold text-text-primary">Two blank pages, ready for a first chapter</h2>
          <p className="text-sm text-text-secondary">
            Write here and Book Studio lays out the pages as you go — chapter openers, pagination and
            a table of contents, all print-ready. Already have a draft? Import it instead.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" size="md" className="gap-2" onClick={startWriting}>
            <PenLine className="size-4" />
            Start writing
          </Button>
          <ImportManuscriptButton projectId={project.id} variant="secondary" label="Import a manuscript" />
        </div>
      </div>
    </main>
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

  if (!manuscript) return <EmptyProject project={project} />

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ViewControls />
      <BookRenderer project={project} manuscript={manuscript} />
      {/* The Idea System's entire footprint in Write — see that component's
         own doc comment. Present whenever a manuscript page is open,
         exactly per docs/IDEA_SYSTEM_PLAN.md; absent from the Editorial
         Dashboard (`workspaceMode === 'virtualEditor'`, above) and the
         empty-project state (above), neither of which is "writing." */}
      <IdeaCaptureAffordance projectId={project.id} />
    </div>
  )
}

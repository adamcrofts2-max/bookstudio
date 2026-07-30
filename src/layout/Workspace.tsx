import { BookOpen, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { Project } from '@/types'

interface WorkspaceProps {
  project: Project
}

/**
 * Centre column: the book preview. This is the hero of the application —
 * everything else exists to serve what happens here. For the foundation
 * milestone (before the manuscript importer and layout engine exist) it
 * shows a calm invitation to start, rendered as a soft page silhouette
 * rather than an empty grey void.
 */
export function Workspace({ project }: WorkspaceProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto bg-background-secondary px-8 py-12">
      <div className="flex flex-col items-center gap-8">
        <div className="flex items-end gap-1">
          <div className="h-[280px] w-[200px] rounded-l-[var(--radius-preview)] rounded-r-sm border border-border bg-panel shadow-[var(--shadow-md)]" />
          <div className="h-[280px] w-[200px] rounded-r-[var(--radius-preview)] rounded-l-sm border border-border bg-panel shadow-[var(--shadow-md)]" />
        </div>

        <div className="flex max-w-[38ch] flex-col items-center gap-2 text-center">
          <h2 className="text-h4 font-semibold text-text-primary">
            {project.name} is ready for a manuscript
          </h2>
          <p className="text-sm text-text-secondary">
            Import a manuscript and Book Studio will lay out a professional, print-ready book
            automatically. The manuscript importer arrives in Phase 2.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" size="md" disabled className="gap-2">
            <Upload className="size-4" />
            Import Manuscript
          </Button>
          <Button variant="outline" size="md" disabled className="gap-2">
            <BookOpen className="size-4" />
            Browse Templates
          </Button>
        </div>
      </div>
    </main>
  )
}

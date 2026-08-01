import { BookOpenText, PenLine, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BookRenderer } from '@/renderer/BookRenderer'
import { useContentStore } from '@/store/contentStore'
import { useUiStore, type FocusMode } from '@/store/uiStore'
import type { Project } from '@/types'

interface FocusModeLayoutProps {
  project: Project
  mode: Exclude<FocusMode, 'none'>
}

/**
 * Renders instead of the normal three-column `AppShell` whenever
 * `uiStore.focusMode !== 'none'` — just the book canvas, full-screen, no
 * Sidebar/Toolbar/Inspector. The two Phase F items "distraction-free
 * writing mode" and "reading mode" share this one layout, differing only in
 * whether `BookRenderer`'s pages are editable (`decorative` off for
 * `write`, on for `read` — see that prop's own doc comment for why this
 * reuses the existing thumbnail-interactivity flag rather than a second
 * non-interactive rendering path). A small floating pill is the only chrome
 * this layout adds; Escape is the primary way out (wired into
 * `useKeyboardShortcuts.ts`), consistent with "distraction-free" actually
 * meaning as little UI as possible.
 */
export function FocusModeLayout({ project, mode }: FocusModeLayoutProps) {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const setFocusMode = useUiStore((s) => s.setFocusMode)

  return (
    <div className="relative flex h-dvh w-full flex-col bg-background">
      <div className="absolute right-4 top-4 z-30 flex items-center gap-2 rounded-full border border-border bg-panel/95 py-1 pl-3 pr-1 shadow-[var(--shadow-md)] backdrop-blur">
        <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          {mode === 'write' ? <PenLine className="size-3.5" /> : <BookOpenText className="size-3.5" />}
          {mode === 'write' ? 'Distraction-free writing' : 'Reading mode'}
        </span>
        <span className="text-xs text-text-muted">· Esc to exit</span>
        <Button variant="ghost" size="icon" aria-label="Exit focus mode" onClick={() => setFocusMode('none')}>
          <X className="size-3.5" />
        </Button>
      </div>

      {manuscript ? (
        <BookRenderer project={project} manuscript={manuscript} decorative={mode === 'read'} hideThumbnails />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-text-secondary">
          <p className="text-sm">This project has no manuscript to show yet.</p>
          <Button variant="secondary" size="sm" onClick={() => setFocusMode('none')}>
            Exit
          </Button>
        </div>
      )}
    </div>
  )
}

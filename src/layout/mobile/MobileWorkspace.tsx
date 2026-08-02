import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lightbulb, Moon, PenLine, Sun, Undo2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAutosaveSnapshots } from '@/hooks/useAutosaveSnapshots'
import { useTheme } from '@/hooks/useTheme'
import { useHistoryStore } from '@/store/historyStore'
import { MobileWriteView } from '@/layout/mobile/MobileWriteView'
import { MobileIdeasView } from '@/layout/mobile/MobileIdeasView'
import type { Project } from '@/types'

interface MobileWorkspaceProps {
  project: Project
}

type MobileTab = 'write' | 'ideas'

/**
 * Top-level shell for the mobile "on the go" mode (Phase 95,
 * `docs/STATUS.md`) — mounted by `EditorPage` instead of `AppShell` when
 * `useIsMobile()` is true. Scope, per the user's explicit choice between
 * three options (2026-08-02): "Writing + Idea capture only" — write/edit
 * manuscript text and capture/browse Ideas, jump between chapters. No page
 * canvas, cover designer, or precision layout tools — those stay desktop-
 * only, unlike `AppShell`'s 3-column shell this deliberately has no Sidebar/
 * Inspector/Toolbar: a bottom tab bar (the standard mobile-navigation
 * pattern, thumb-reachable) switches between the two surfaces instead.
 *
 * Mirrors `AppShell`'s own `useAutosaveSnapshots(project.id)` mount — this
 * shell is a full alternative to `AppShell`, not a child of it, so it needs
 * its own copy of every project-scoped effect `AppShell` would otherwise
 * provide. `useKeyboardShortcuts` is deliberately NOT mounted here: every
 * shortcut it wires (block delete, undo/redo key combos) targets
 * `selectionStore` state this view never populates, and mobile has no
 * hardware keyboard to bind them to anyway.
 */
export function MobileWorkspace({ project }: MobileWorkspaceProps) {
  const navigate = useNavigate()
  const { resolved, setAppearance } = useTheme()
  const [tab, setTab] = useState<MobileTab>('write')
  const canUndo = useHistoryStore((s) => s.canUndo(project.id))
  const undo = useHistoryStore((s) => s.undo)

  useAutosaveSnapshots(project.id)

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-1 border-b border-border bg-panel px-2 py-2.5">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Back to projects"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-hover"
        >
          <ArrowLeft className="size-4" />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold text-text-primary">{project.name}</p>
        {/* Undo (Phase 100, 2026-08-02) — mobile now has real destructive
           actions (delete block, delete chapter), so it needs the same
           safety net desktop's Toolbar always had; no Redo here — one
           button, not two, keeps this cramped header from getting crowded,
           and undo is the one that matters most for "oops, wrong button." */}
        <button
          type="button"
          onClick={() => undo(project.id)}
          disabled={!canUndo}
          aria-label="Undo"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-hover disabled:pointer-events-none disabled:opacity-30"
        >
          <Undo2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setAppearance(resolved === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-hover"
        >
          {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </header>

      <div className="min-h-0 flex-1">
        {tab === 'write' ? <MobileWriteView projectId={project.id} /> : <MobileIdeasView projectId={project.id} />}
      </div>

      <nav className="flex shrink-0 items-center border-t border-border bg-panel pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          onClick={() => setTab('write')}
          className={cn(
            'flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors duration-150',
            tab === 'write' ? 'text-[var(--color-accent)]' : 'text-text-muted',
          )}
        >
          <PenLine className="size-5" />
          Write
        </button>
        <button
          type="button"
          onClick={() => setTab('ideas')}
          className={cn(
            'flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors duration-150',
            tab === 'ideas' ? 'text-[var(--color-accent)]' : 'text-text-muted',
          )}
        >
          <Lightbulb className="size-5" />
          Ideas
        </button>
      </nav>
    </div>
  )
}

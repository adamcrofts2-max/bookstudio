import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Compass, MoreHorizontal, Moon, PenLine, Sparkles, Sun, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAutosaveSnapshots } from '@/hooks/useAutosaveSnapshots'
import { useAutoBackup } from '@/hooks/useAutoBackup'
import { useTheme } from '@/hooks/useTheme'
import { useHistoryStore } from '@/store/historyStore'
import { useUiStore } from '@/store/uiStore'
import { MobileWriteView } from '@/layout/mobile/MobileWriteView'
import { MobilePreviewView } from '@/layout/mobile/MobilePreviewView'
import { MobileDevelopView } from '@/layout/mobile/MobileDevelopView'
import { MobileMoreView } from '@/layout/mobile/MobileMoreView'
import { MobileReviewView } from '@/layout/mobile/MobileReviewView'
import { MobileFocusWriteView } from '@/layout/mobile/MobileFocusWriteView'
import type { Project } from '@/types'

interface MobileWorkspaceProps {
  project: Project
}

type MobileTab = 'write' | 'preview' | 'review' | 'develop' | 'more'

/** The tab bar as data. Five near-identical buttons were previously spelled
 * out one by one; adding Review made that a fifth copy of the same twelve
 * lines, which is where a list earns its keep. Order follows the working
 * loop: write it, see it, check it, plan around it, everything else. */
const TABS: { id: MobileTab; label: string; icon: LucideIcon }[] = [
  { id: 'write', label: 'Write', icon: PenLine },
  { id: 'preview', label: 'Preview', icon: BookOpen },
  { id: 'review', label: 'Review', icon: Sparkles },
  { id: 'develop', label: 'Develop', icon: Compass },
  { id: 'more', label: 'More', icon: MoreHorizontal },
]

/**
 * Top-level shell for the mobile "on the go" mode (Phase 95,
 * `docs/STATUS.md`) — mounted by `EditorPage` instead of `AppShell` when
 * `useIsMobile()` is true. Scope, per the user's explicit choice between
 * three options (2026-08-02): "Writing + Idea capture only" — write/edit
 * manuscript text and capture/browse Ideas, jump between chapters. No page
 * canvas, cover designer, or precision layout tools — those stay desktop-
 * only, unlike `AppShell`'s 3-column shell this deliberately has no Sidebar/
 * Inspector/Toolbar: a bottom tab bar (the standard mobile-navigation
 * pattern, thumb-reachable) switches between the surfaces instead.
 *
 * Phase 127 added Preview — a read-only rendering of the real paginated book,
 * because being able to write into a book you can never look at was the gap
 * that made this mode feel like a notes app rather than Book Studio.
 *
 * Phase 128 then deliberately reversed the original scope decision, at the
 * user's explicit request: mobile "should also include most of the other
 * desktop features but be very usable and user friendly on the mobile". The
 * More tab carries export, import, theming, project settings and version
 * history — the same hooks and components the desktop Toolbar drives. What
 * stays desktop-only is now an *interaction* boundary rather than a feature
 * one: the fixed-size, bleed/trim-precise page canvas and the drag-to-position
 * cover tooling need a pointer and a large screen.
 *
 * Phase 129 replaced the Ideas tab with Develop, which contains Ideas plus the
 * eight Layer 0 entity kinds and the planning tools. That mirrors desktop,
 * where Ideas has always been one category *inside* Planning rather than a
 * peer of it — and it keeps the tab bar at four, which is as many as fits a
 * phone comfortably.
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
  // Shares desktop's `focusMode` rather than inventing a mobile-only flag, so
  // there is one notion of "the writer is in the book" across both shells and
  // one way out of it.
  const focusMode = useUiStore((s) => s.focusMode)
  const canUndo = useHistoryStore((s) => s.canUndo(project.id))
  const undo = useHistoryStore((s) => s.undo)

  useAutosaveSnapshots(project.id)
  // Same mount point, same rhythm, different destination: a snapshot goes
  // to IndexedDB, a backup goes to a real file outside the browser.
  useAutoBackup(project)

  // Takes over the whole shell — header and tab bar included. Read mode has
  // no mobile equivalent yet; Preview already covers "see the book" on a
  // phone, so only 'write' is honoured here.
  if (focusMode === 'write') return <MobileFocusWriteView project={project} />

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
        {tab === 'write' && <MobileWriteView projectId={project.id} />}
        {tab === 'preview' && <MobilePreviewView project={project} />}
        {tab === 'review' && <MobileReviewView project={project} />}
        {tab === 'develop' && <MobileDevelopView project={project} />}
        {tab === 'more' && <MobileMoreView project={project} />}
      </div>

      <nav className="flex shrink-0 items-center border-t border-border bg-panel pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={cn(
              // `min-w-0` so five labels shrink rather than forcing the bar
              // wider than the screen on a narrow phone.
              'flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors duration-150',
              tab === id ? 'text-[var(--color-accent)]' : 'text-text-muted',
            )}
          >
            <Icon className="size-5 shrink-0" />
            <span className="max-w-full truncate">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

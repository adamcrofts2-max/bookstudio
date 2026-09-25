import { Sidebar } from '@/layout/Sidebar'
import { Toolbar } from '@/layout/Toolbar'
import { Workspace } from '@/layout/Workspace'
import { Inspector } from '@/layout/Inspector'
import { FocusModeLayout } from '@/layout/FocusModeLayout'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAutosaveSnapshots } from '@/hooks/useAutosaveSnapshots'
import { useAutoBackup } from '@/hooks/useAutoBackup'
import { useUiStore } from '@/store/uiStore'
import type { Project } from '@/types'

interface AppShellProps {
  project: Project
}

/**
 * The three-column editor shell: Sidebar · (Toolbar + Workspace) · Inspector.
 * Per docs/UI_DESIGN_SYSTEM.md, this layout never moves — only its
 * contents change as features (editor, layout engine, themes) land.
 *
 * Exception: `uiStore.focusMode !== 'none'` swaps the whole shell for
 * `FocusModeLayout` (Phase F's distraction-free writing/reading modes) —
 * `useKeyboardShortcuts`/`useAutosaveSnapshots` stay mounted either way, so
 * Escape-to-exit and autosave both keep working inside focus mode too.
 */
export function AppShell({ project }: AppShellProps) {
  useKeyboardShortcuts(project.id)
  useAutosaveSnapshots(project.id)
  // Same mount point, same rhythm, different destination: a snapshot goes
  // to IndexedDB, a backup goes to a real file outside the browser.
  useAutoBackup(project)
  const focusMode = useUiStore((s) => s.focusMode)

  if (focusMode !== 'none') {
    return <FocusModeLayout project={project} mode={focusMode} />
  }

  return (
    <div className="flex h-dvh w-full bg-background">
      <Sidebar project={project} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar project={project} />
        <Workspace project={project} />
      </div>
      <Inspector project={project} />
    </div>
  )
}

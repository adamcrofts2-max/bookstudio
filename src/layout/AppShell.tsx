import { Sidebar } from '@/layout/Sidebar'
import { Toolbar } from '@/layout/Toolbar'
import { Workspace } from '@/layout/Workspace'
import { Inspector } from '@/layout/Inspector'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { Project } from '@/types'

interface AppShellProps {
  project: Project
}

/**
 * The three-column editor shell: Sidebar · (Toolbar + Workspace) · Inspector.
 * Per docs/UI_DESIGN_SYSTEM.md, this layout never moves — only its
 * contents change as features (editor, layout engine, themes) land.
 */
export function AppShell({ project }: AppShellProps) {
  useKeyboardShortcuts()

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

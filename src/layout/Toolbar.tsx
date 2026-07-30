import { useState } from 'react'
import { ChevronsRight, Download, Moon, PanelLeft, Redo2, Sun, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTheme } from '@/hooks/useTheme'
import { useUiStore } from '@/store/uiStore'
import { Logo } from '@/components/common/Logo'
import { ProjectSettingsDialog } from '@/components/settings/ProjectSettingsDialog'
import type { Project } from '@/types'

interface ToolbarProps {
  project: Project
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Fixed top toolbar: project identity, editing controls, appearance, export. */
export function Toolbar({ project }: ToolbarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { resolved, setAppearance } = useTheme()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const inspectorCollapsed = useUiStore((s) => s.inspectorCollapsed)
  const toggleInspector = useUiStore((s) => s.toggleInspector)

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-panel px-3">
      {collapsed && (
        <IconButton label="Show sidebar" onClick={toggleSidebar}>
          <PanelLeft className="size-4" />
        </IconButton>
      )}
      {collapsed && <Logo className="ml-1 mr-2" />}
      {collapsed && <Separator orientation="vertical" className="h-6" />}

      <div className="flex items-center gap-0.5 pl-1">
        <IconButton label="Undo" disabled>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label="Redo" disabled>
          <Redo2 className="size-4" />
        </IconButton>
      </div>

      <Separator orientation="vertical" className="mx-2 h-6" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{project.name}</p>
      </div>

      <div className="flex items-center gap-1">
        <IconButton
          label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setAppearance(resolved === 'dark' ? 'light' : 'dark')}
        >
          {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>

        <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>
          Project Settings
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="primary" size="sm" disabled className="gap-1.5">
                <Download className="size-3.5" />
                Export PDF
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Arrives in Phase 7 — PDF Export</TooltipContent>
        </Tooltip>

        <IconButton
          label={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
          onClick={toggleInspector}
        >
          <ChevronsRight className={inspectorCollapsed ? 'size-4' : 'size-4 rotate-180'} />
        </IconButton>
      </div>

      <ProjectSettingsDialog project={project} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  )
}

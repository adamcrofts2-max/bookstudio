import { useState } from 'react'
import { ChevronDown, ChevronsRight, Download, History, Keyboard, Loader2, Moon, PanelLeft, Redo2, Sparkles, Sun, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTheme } from '@/hooks/useTheme'
import { useHistoryStore } from '@/store/historyStore'
import { useUiStore } from '@/store/uiStore'
import { Logo } from '@/components/common/Logo'
import { ProjectSettingsDialog } from '@/components/settings/ProjectSettingsDialog'
import { useExportPdf } from '@/pdf/useExportPdf'
import { useExportEpub } from '@/epub/useExportEpub'
import { KeyboardShortcutsDialog } from '@/components/common/KeyboardShortcutsDialog'
import { VersionHistoryDialog } from '@/components/common/VersionHistoryDialog'
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const { resolved, setAppearance } = useTheme()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const inspectorCollapsed = useUiStore((s) => s.inspectorCollapsed)
  const toggleInspector = useUiStore((s) => s.toggleInspector)
  const workspaceMode = useUiStore((s) => s.workspaceMode)
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode)
  const { canExport, busy: exporting, error: exportError, runExport } = useExportPdf(project)
  const { canExport: canExportEpub, busy: exportingEpub, error: epubExportError, runExport: runExportEpub } = useExportEpub(project)
  const canUndo = useHistoryStore((s) => s.canUndo(project.id))
  const canRedo = useHistoryStore((s) => s.canRedo(project.id))
  const undoLabel = useHistoryStore((s) => s.peekUndoLabel(project.id))
  const redoLabel = useHistoryStore((s) => s.peekRedoLabel(project.id))
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)

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
        <IconButton
          label={`Undo${undoLabel ? `: ${undoLabel}` : ''}`}
          onClick={() => undo(project.id)}
          disabled={!canUndo}
        >
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton
          label={`Redo${redoLabel ? `: ${redoLabel}` : ''}`}
          onClick={() => redo(project.id)}
          disabled={!canRedo}
        >
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={workspaceMode === 'virtualEditor' ? 'primary' : 'secondary'}
              size="sm"
              className="gap-1.5"
              onClick={() => setWorkspaceMode(workspaceMode === 'virtualEditor' ? 'manuscript' : 'virtualEditor')}
            >
              <Sparkles className="size-3.5" />
              Virtual Editor
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {workspaceMode === 'virtualEditor' ? 'Back to the manuscript preview' : 'Open the Editorial Dashboard'}
          </TooltipContent>
        </Tooltip>

        <IconButton label="Version history" onClick={() => setVersionHistoryOpen(true)}>
          <History className="size-4" />
        </IconButton>

        <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>
          Project Settings
        </Button>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={(!canExport && !canExportEpub) || exporting || exportingEpub}
                    className="gap-1.5"
                  >
                    {exporting || exportingEpub ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    {exporting ? 'Exporting PDF…' : exportingEpub ? 'Exporting EPUB…' : 'Export'}
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {canExport || canExportEpub ? (exportError ?? epubExportError ?? 'Choose a format to export') : 'Import a manuscript first'}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canExport || exporting} onSelect={runExport}>
              Export PDF — print-ready, bleed &amp; crop marks
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canExportEpub || exportingEpub} onSelect={runExportEpub}>
              Export EPUB — reflowable ebook
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <IconButton
          label={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
          onClick={toggleInspector}
        >
          <ChevronsRight className={inspectorCollapsed ? 'size-4' : 'size-4 rotate-180'} />
        </IconButton>

        <IconButton label="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)}>
          <Keyboard className="size-4" />
        </IconButton>
      </div>

      <ProjectSettingsDialog project={project} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <VersionHistoryDialog projectId={project.id} open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen} />
    </header>
  )
}

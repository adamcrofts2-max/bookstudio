import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpenText,
  ChevronDown,
  ChevronsRight,
  Download,
  Focus,
  FolderOpen,
  History,
  Keyboard,
  Loader2,
  Moon,
  NotebookPen,
  PanelLeft,
  PenLine,
  Redo2,
  Save,
  Sparkles,
  Sun,
  Undo2,
} from 'lucide-react'

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
import { useContentStore } from '@/store/contentStore'
import { useUiStore } from '@/store/uiStore'
import { Logo } from '@/components/common/Logo'
import { ProjectSettingsDialog } from '@/components/settings/ProjectSettingsDialog'
import { useExportPdf } from '@/pdf/useExportPdf'
import { useExportEpub } from '@/epub/useExportEpub'
import { useExportHtmlBook } from '@/epub/useExportHtmlBook'
import { useExportProjectFile } from '@/projectFile/useExportProjectFile'
import { useImportProjectFile } from '@/projectFile/useImportProjectFile'
import { useProjectFilePicker } from '@/projectFile/useProjectFilePicker'
import { useExportReadiness } from '@/hooks/useExportReadiness'
import { useManuscriptWordCount } from '@/hooks/useManuscriptWordCount'
import { useWritingSessionTracking } from '@/hooks/useWritingSessionTracking'
import { KeyboardShortcutsDialog } from '@/components/common/KeyboardShortcutsDialog'
import { VersionHistoryDialog } from '@/components/common/VersionHistoryDialog'
import { ExportReadinessDialog } from '@/components/common/ExportReadinessDialog'
import { WritingGoalDialog } from '@/components/common/WritingGoalDialog'
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [writingGoalOpen, setWritingGoalOpen] = useState(false)
  const [readinessOpen, setReadinessOpen] = useState(false)
  const [pendingExportFormat, setPendingExportFormat] = useState<'pdf' | 'epub' | 'html' | null>(null)
  const { resolved, setAppearance } = useTheme()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const inspectorCollapsed = useUiStore((s) => s.inspectorCollapsed)
  const toggleInspector = useUiStore((s) => s.toggleInspector)
  const workspaceMode = useUiStore((s) => s.workspaceMode)
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode)
  const setAppMode = useUiStore((s) => s.setAppMode)
  const setFocusMode = useUiStore((s) => s.setFocusMode)
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  // Lifted to uiStore (not local state) so the Inspector's Theme tab can
  // open this same dialog — see uiStore.ts's `projectSettingsOpen` comment.
  const settingsOpen = useUiStore((s) => s.projectSettingsOpen)
  const setSettingsOpen = useUiStore((s) => s.setProjectSettingsOpen)
  const { canExport, busy: exporting, error: exportError, runExport } = useExportPdf(project)
  const { canExport: canExportEpub, busy: exportingEpub, error: epubExportError, runExport: runExportEpub } = useExportEpub(project)
  const { canExport: canExportHtml, busy: exportingHtml, runExport: runExportHtml } = useExportHtmlBook(project)
  const { findings: readinessFindings, hasBlockingIssues } = useExportReadiness(project)
  const navigate = useNavigate()
  const { busy: savingProject, error: saveProjectError, runExport: runSaveProject } = useExportProjectFile(project)
  const { busy: loadingProject, error: loadProjectError, runImport } = useImportProjectFile()
  const { openPicker: openProjectFilePicker, inputProps: projectFileInputProps } = useProjectFilePicker(async (file) => {
    const newProjectId = await runImport(file)
    if (newProjectId) navigate(`/project/${newProjectId}`)
  })

  /** Gate for "Export PDF"/"Export EPUB"/"Export HTML": if the readiness check
   * (Amazon KDP/IngramSpark-style print/commercial-quality rules — see
   * `virtualEditor/exportReadiness.ts`) has anything blocking, show the
   * confirmation dialog instead of exporting immediately. Never a hard
   * block — "Export anyway" in the dialog always proceeds. */
  const handleExportClick = (format: 'pdf' | 'epub' | 'html') => {
    if (hasBlockingIssues) {
      setPendingExportFormat(format)
      setReadinessOpen(true)
      return
    }
    if (format === 'pdf') void runExport()
    else if (format === 'epub') void runExportEpub()
    else void runExportHtml()
  }

  const handleExportAnyway = () => {
    if (pendingExportFormat === 'pdf') void runExport()
    else if (pendingExportFormat === 'epub') void runExportEpub()
    else if (pendingExportFormat === 'html') void runExportHtml()
  }
  const wordCount = useManuscriptWordCount(project.id)
  useWritingSessionTracking(project.id)
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

      {/* `overflow-hidden` is load-bearing: without it, once this row runs out
       * of room (many buttons now live in the fixed-width group to the
       * right — Planning/Save/Load/Export/etc.), the word-count `<p>` (fixed
       * width, `shrink-0`) visually spilled past this container's right edge
       * and overlapped the light/dark mode button next to it instead of
       * yielding space, since flex children with `overflow: visible` don't
       * get clipped by their own box. Both children now shrink and truncate
       * instead of one staying rigid — the project name still gets priority
       * (its own row is more valuable than the word count), but neither can
       * bleed into a sibling button anymore. */}
      <div className="flex min-w-0 flex-1 items-baseline gap-2.5 overflow-hidden">
        <p className="min-w-0 shrink truncate text-sm font-medium text-text-primary">{project.name}</p>
        {wordCount > 0 && (
          // Clickable — opens `WritingGoalDialog` (today's net words +
          // optional daily goal, Phase F's "word-count goals and writing-
          // session tracking"). A plain `<button>`, not a new toolbar icon:
          // the toolbar is already crowded (see docs/SUGGESTIONS.md's Phase
          // 67 entry), so reusing this existing text's own click target
          // costs zero additional visual footprint.
          <button
            type="button"
            onClick={() => setWritingGoalOpen(true)}
            className="min-w-0 shrink-[2] truncate whitespace-nowrap text-xs tabular-nums text-text-secondary transition-colors duration-150 hover:text-text-primary hover:underline"
          >
            {wordCount.toLocaleString()} words
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <IconButton
          label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setAppearance(resolved === 'dark' ? 'light' : 'dark')}
        >
          {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Focus mode" disabled={!manuscript}>
                    <Focus className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent>{manuscript ? 'Hide everything but the page — for writing or reading' : 'Import a manuscript first'}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2" onSelect={() => setFocusMode('write')}>
              <PenLine className="size-3.5" />
              Distraction-free writing
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={() => setFocusMode('read')}>
              <BookOpenText className="size-3.5" />
              Reading mode
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setAppMode('planning')}>
              <NotebookPen className="size-3.5" />
              Develop
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ideas, characters, places, timeline — everything that gives this book context</TooltipContent>
        </Tooltip>

        <IconButton label="Version history" onClick={() => setVersionHistoryOpen(true)}>
          <History className="size-4" />
        </IconButton>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void runSaveProject()} disabled={savingProject}>
              {savingProject ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save
            </Button>
          </TooltipTrigger>
          <TooltipContent>{saveProjectError ?? 'Save this project as a file you can keep or move to another computer'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={openProjectFilePicker} disabled={loadingProject}>
              {loadingProject ? <Loader2 className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />}
              Load
            </Button>
          </TooltipTrigger>
          <TooltipContent>{loadProjectError ?? 'Open a project file saved earlier, as a new project'}</TooltipContent>
        </Tooltip>
        <input {...projectFileInputProps} />

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
                    disabled={(!canExport && !canExportEpub && !canExportHtml) || exporting || exportingEpub || exportingHtml}
                    className="gap-1.5"
                  >
                    {exporting || exportingEpub || exportingHtml ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    {exporting
                      ? 'Exporting PDF…'
                      : exportingEpub
                        ? 'Exporting EPUB…'
                        : exportingHtml
                          ? 'Exporting HTML…'
                          : 'Export'}
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {canExport || canExportEpub || canExportHtml
                ? (exportError ?? epubExportError ?? 'Choose a format to export')
                : 'Import a manuscript first'}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canExport || exporting} onSelect={() => handleExportClick('pdf')}>
              Export PDF — print-ready, bleed &amp; crop marks
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canExportEpub || exportingEpub} onSelect={() => handleExportClick('epub')}>
              Export EPUB — reflowable ebook
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canExportHtml || exportingHtml} onSelect={() => handleExportClick('html')}>
              Export HTML — single-file web book
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
      <WritingGoalDialog projectId={project.id} open={writingGoalOpen} onOpenChange={setWritingGoalOpen} />
      <ExportReadinessDialog
        open={readinessOpen}
        onOpenChange={setReadinessOpen}
        findings={readinessFindings}
        formatLabel={pendingExportFormat === 'epub' ? 'the EPUB' : pendingExportFormat === 'html' ? 'the HTML' : 'the PDF'}
        onExportAnyway={handleExportAnyway}
      />
    </header>
  )
}

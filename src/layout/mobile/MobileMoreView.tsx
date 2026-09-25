import { useState, type ComponentType } from 'react'
import {
  AlertTriangle,
  BookText,
  ChevronRight,
  Clock,
  Download,
  FileText,
  FolderOpen,
  Globe,
  Images,
  Layers,
  LayoutTemplate,
  Loader2,
  Palette,
  Maximize2,
  Save,
  Search,
  SpellCheck2,
  Settings,
  Upload,
  HardDrive,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ThemeGallery } from '@/components/settings/ThemeGallery'
import { ProjectSettingsDialog } from '@/components/settings/ProjectSettingsDialog'
import { VersionHistoryDialog } from '@/components/common/VersionHistoryDialog'
import { SaveAsTemplateDialog } from '@/components/settings/SaveAsTemplateDialog'
import { ManageTemplatesDialog } from '@/components/settings/ManageTemplatesDialog'
import { useTemplateStore } from '@/store/templateStore'
import { useBackupStore } from '@/store/backupStore'
import { useStorageWarning } from '@/hooks/useStorageWarning'
import { BackupDialog } from '@/components/common/BackupDialog'
import { useBookLayout } from '@/renderer/useBookLayout'
import { DiagnosticsDialog } from '@/components/common/DiagnosticsDialog'
import { useErrorLogStore } from '@/store/errorLogStore'
import { ExportReadinessDialog } from '@/components/common/ExportReadinessDialog'
import { useExportReadiness } from '@/hooks/useExportReadiness'
import { ImportManuscriptButton } from '@/editor/ImportManuscriptButton'
import { MobilePagesView } from '@/layout/mobile/MobilePagesView'
import { MobileAssetsView } from '@/layout/mobile/MobileAssetsView'
import { MobileSearchView } from '@/layout/mobile/MobileSearchView'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { useExportPdf } from '@/pdf/useExportPdf'
import { useExportEpub } from '@/epub/useExportEpub'
import { useExportHtmlBook } from '@/epub/useExportHtmlBook'
import { useExportProjectFile } from '@/projectFile/useExportProjectFile'
import { useImportProjectFile } from '@/projectFile/useImportProjectFile'
import { useProjectFilePicker } from '@/projectFile/useProjectFilePicker'
import type { Project } from '@/types'

interface MobileMoreViewProps {
  project: Project
  /**
   * Switches the shell's bottom-tab selection. Used after a manuscript
   * import lands, so the user ends up looking at the chapters they just
   * brought in rather than at the More list they started from (Phase 161).
   */
  onNavigate?: (tab: 'write' | 'preview' | 'review' | 'develop' | 'more') => void
}

/**
 * The mobile "More" surface (Phase 128) — the rest of Book Studio, reachable
 * from a phone.
 *
 * This deliberately reverses Phase K's original scope decision ("Writing +
 * Idea capture only", 2026-08-02) at the user's explicit request: mobile
 * "should also include most of the other desktop features but be very usable
 * and user friendly on the mobile". The boundary that remains is not
 * *feature* scope but *interaction* scope — the fixed-size, bleed/trim-precise
 * page canvas and its drag-to-position cover tooling still need a pointer and
 * a large screen, so they stay desktop-only. Everything that is a choice, a
 * command, or a document stays available here.
 *
 * Almost nothing here is new code. Export, import, theming, settings and
 * version history are the same hooks and components the desktop Toolbar and
 * Inspector already drive — surfaced through a thumb-reachable list and
 * full-height sheets instead of a menu bar and dialogs. Rebuilding any of them
 * for mobile would have created a second implementation to keep in sync.
 */

interface RowProps {
  icon: ComponentType<{ className?: string }>
  label: string
  detail?: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
}

function Row({ icon: Icon, label, detail, onClick, disabled, busy }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150',
        'active:bg-hover disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      {busy ? (
        <Loader2 className="size-[18px] shrink-0 animate-spin text-text-muted" />
      ) : (
        <Icon className="size-[18px] shrink-0 text-text-secondary" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-text-primary">{label}</span>
        {detail && <span className="block truncate text-xs text-text-muted">{detail}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-text-muted" />
    </button>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <h2 className="px-4 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</h2>
      <div className="divide-y divide-border border-y border-border bg-panel">{children}</div>
    </section>
  )
}

export function MobileMoreView({ project, onNavigate }: MobileMoreViewProps) {
  const updateProjectSettings = useProjectStore((s) => s.updateProjectSettings)
  const setFocusMode = useUiStore((s) => s.setFocusMode)
  const spellcheckWhileWriting = useUiStore((s) => s.spellcheckWhileWriting)
  const toggleSpellcheckWhileWriting = useUiStore((s) => s.toggleSpellcheckWhileWriting)

  const pdf = useExportPdf(project)
  const epub = useExportEpub(project)
  const html = useExportHtmlBook(project)
  const saveFile = useExportProjectFile(project)
  const { busy: loadingProject, error: loadProjectError, runImport } = useImportProjectFile()
  const { openPicker: openProjectFilePicker, inputProps: projectFileInputProps } = useProjectFilePicker(runImport)

  const [themeOpen, setThemeOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  /**
   * Lays the book out from here, so exporting no longer depends on the
   * Preview tab having been opened first.
   *
   * The More tab used to say "Open Preview once to lay the book out first"
   * and disable every export until you had — an app asking its user to
   * perform a ritual to work around where a component happened to be
   * mounted. None of the work needs anything visible: `measurer` renders
   * off-screen, and by the time anyone has scrolled down to Export it has
   * long since finished.
   *
   * Mounted here rather than in the mobile shell so a phone is not measuring
   * a whole book while someone is trying to write in it.
   */
  const { ready: layoutReady, measurer } = useBookLayout(project)
  const templateCount = useTemplateStore((s) => s.templates.length)
  const errorCount = useErrorLogStore((s) => s.errors.length)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [backupsOpen, setBackupsOpen] = useState(false)
  const backupStatus = useBackupStore((s) => s.byProject[project.id])
  const { tight: storageTight } = useStorageWarning()
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false)
  const [pagesOpen, setPagesOpen] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [readinessOpen, setReadinessOpen] = useState(false)
  const [pendingExportFormat, setPendingExportFormat] = useState<'pdf' | 'epub' | 'html' | null>(null)

  // Desktop warns before exporting a book with blocking print-readiness
  // problems; mobile exported straight past them, so the same manuscript
  // produced a silently worse file depending on which device you happened to
  // press Export on. Never a hard block — "Export anyway" always proceeds.
  const { findings: readinessFindings, hasBlockingIssues } = useExportReadiness(project)

  const runFormat = (format: 'pdf' | 'epub' | 'html') => {
    if (format === 'pdf') void pdf.runExport()
    else if (format === 'epub') void epub.runExport()
    else void html.runExport()
  }

  const handleExportClick = (format: 'pdf' | 'epub' | 'html') => {
    if (hasBlockingIssues) {
      setPendingExportFormat(format)
      setReadinessOpen(true)
      return
    }
    runFormat(format)
  }


  // Pushed screens rather than sheets: each of these is a full working
  // surface (a page editor with a cover canvas, an image grid, a find-and-
  // replace list), and a sheet would leave them a few hundred pixels tall.
  if (pagesOpen) return <MobilePagesView project={project} onBack={() => setPagesOpen(false)} />
  if (assetsOpen) return <MobileAssetsView projectId={project.id} onBack={() => setAssetsOpen(false)} />
  if (searchOpen) return <MobileSearchView project={project} onBack={() => setSearchOpen(false)} />

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-background pb-6">
      {/* Off-screen block measurement. Renders nothing visible; it is what
          makes the exports below work without a trip to Preview first. */}
      {measurer}
      <input {...projectFileInputProps} />

      <Group title="Export">
        <Row
          icon={Download}
          label="Export PDF"
          // `canExport` is false only for the moment it takes the layout above
          // to run; it is no longer a state the user has to resolve —
          // PDF export renders exactly what was paginated, so saying why is
          // more useful than an unexplained disabled row.
          detail={
            pdf.canExport
              ? 'Print-ready, with bleed and crop marks'
              : layoutReady
                ? 'Print-ready, with bleed and crop marks'
                : 'Laying the book out…'
          }
          onClick={() => handleExportClick('pdf')}
          disabled={!pdf.canExport}
          busy={pdf.busy}
        />
        <Row
          icon={BookText}
          label="Export EPUB"
          detail={epub.error ?? 'For e-readers and Kindle'}
          onClick={() => handleExportClick('epub')}
          disabled={!epub.canExport}
          busy={epub.busy}
        />
        <Row
          icon={Globe}
          label="Export web page"
          detail={html.error ?? 'A single self-contained HTML file'}
          onClick={() => handleExportClick('html')}
          disabled={!html.canExport}
          busy={html.busy}
        />
      </Group>

      <Group title="Manuscript">
        <Row icon={Upload} label="Import a manuscript" detail="EPUB, DOCX, Markdown, TXT or HTML" onClick={() => setImportOpen(true)} />
        <Row
          icon={Save}
          label="Save project file"
          detail={saveFile.error ?? 'A portable .bookstudio backup'}
          onClick={() => void saveFile.runExport()}
          busy={saveFile.busy}
        />
        <Row
          icon={HardDrive}
          label="Backups"
          detail={
            storageTight
              ? 'Storage nearly full — save a copy now'
              : backupStatus?.needsPermission
                ? 'Needs permission to write its file'
                : backupStatus
                  ? `Saving to ${backupStatus.fileName || 'a file you chose'}`
                  : 'This book lives only in this browser'
          }
          onClick={() => setBackupsOpen(true)}
        />
        <Row
          icon={FolderOpen}
          label="Open a project file"
          detail={loadProjectError ?? 'Loads as a new project'}
          onClick={openProjectFilePicker}
          busy={loadingProject}
        />
        <Row icon={Clock} label="Version history" detail="Restore an earlier autosave" onClick={() => setHistoryOpen(true)} />
      </Group>

      <Group title="Writing">
        <Row
          icon={Maximize2}
          label="Distraction-free writing"
          detail="Full screen, in the book's own typography"
          onClick={() => setFocusMode('write')}
        />
        <Row
          icon={SpellCheck2}
          label="Spell-check while writing"
          detail={spellcheckWhileWriting ? 'On — misspellings are underlined as you type' : 'Off'}
          onClick={toggleSpellcheckWhileWriting}
        />
      </Group>

      <Group title="Book structure">
        <Row
          icon={Layers}
          label="Book pages"
          detail="Cover, title page, copyright, back cover and the rest"
          onClick={() => setPagesOpen(true)}
        />
        <Row
          icon={Images}
          label="Images"
          detail="Browse and delete this book's illustrations"
          onClick={() => setAssetsOpen(true)}
        />
        <Row
          icon={Search}
          label="Find and replace"
          detail="Search the whole manuscript"
          onClick={() => setSearchOpen(true)}
        />
      </Group>

      <Group title="Design">
        <Row icon={Palette} label="Theme" detail="Typography, colour and chapter openers" onClick={() => setThemeOpen(true)} />
        <Row icon={Settings} label="Project settings" detail="Trim size, margins, bleed and language" onClick={() => setSettingsOpen(true)} />
        <Row
          icon={LayoutTemplate}
          label="Save as template"
          detail="Reuse this book's design for the next volume"
          onClick={() => setSaveTemplateOpen(true)}
        />
        <Row
          icon={LayoutTemplate}
          label="Saved templates"
          detail={
            templateCount === 0
              ? 'None saved yet'
              : `Rename or remove your ${templateCount} template${templateCount === 1 ? '' : 's'}`
          }
          onClick={() => setManageTemplatesOpen(true)}
        />
        {/* On a phone this is the only route a crash report has off the
            device — see `store/errorLogStore.ts`. */}
        <Row
          icon={AlertTriangle}
          label="Report a problem"
          detail={
            errorCount === 0
              ? 'Nothing has gone wrong on this device'
              : `${errorCount} error${errorCount === 1 ? '' : 's'} recorded — copy or save the details`
          }
          onClick={() => setDiagnosticsOpen(true)}
        />
      </Group>

      {/* Bottom sheets rather than centred dialogs: a phone has no room for a
          floating panel, and `ui/sheet.tsx` is already the mobile-shaped
          primitive (drag handle, max-height, internal scrolling) — it needs
          no size or overflow overrides here. */}
      <ExportReadinessDialog
        open={readinessOpen}
        onOpenChange={setReadinessOpen}
        findings={readinessFindings}
        format={pendingExportFormat ?? 'pdf'}
        onExportAnyway={() => {
          if (pendingExportFormat) runFormat(pendingExportFormat)
          setPendingExportFormat(null)
        }}
      />

      <Sheet open={themeOpen} onOpenChange={setThemeOpen}>
        <SheetContent className="max-h-[85dvh]">
          <SheetHeader>
            <SheetTitle>Theme</SheetTitle>
          </SheetHeader>
          <div className="pb-6 pt-2">
            <ThemeGallery
              value={project.settings.themeId}
              onChange={(themeId) => {
                updateProjectSettings(project.id, { themeId })
                setThemeOpen(false)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Import a manuscript</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-center text-sm text-text-secondary">
              Importing replaces this project's chapters. Your phone's file picker will open.
            </p>
            <ImportManuscriptButton
              projectId={project.id}
              onImported={() => {
                setImportOpen(false)
                onNavigate?.('write')
              }}
            />
            <p className="flex items-center gap-1.5 text-xs text-text-muted">
              <FileText className="size-3.5" />
              .epub · .docx · .md · .txt · .html
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <ProjectSettingsDialog project={project} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <VersionHistoryDialog projectId={project.id} open={historyOpen} onOpenChange={setHistoryOpen} />
      <SaveAsTemplateDialog project={project} open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen} />
      <ManageTemplatesDialog open={manageTemplatesOpen} onOpenChange={setManageTemplatesOpen} />
      <DiagnosticsDialog open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen} />
      <BackupDialog project={project} open={backupsOpen} onOpenChange={setBackupsOpen} />
    </div>
  )
}

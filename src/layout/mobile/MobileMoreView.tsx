import { useState, type ComponentType } from 'react'
import {
  BookText,
  ChevronRight,
  Clock,
  Download,
  FileText,
  FolderOpen,
  Globe,
  Images,
  Layers,
  Loader2,
  Palette,
  Maximize2,
  Save,
  Search,
  SpellCheck2,
  Settings,
  Upload,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ThemeGallery } from '@/components/settings/ThemeGallery'
import { ProjectSettingsDialog } from '@/components/settings/ProjectSettingsDialog'
import { VersionHistoryDialog } from '@/components/common/VersionHistoryDialog'
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

export function MobileMoreView({ project }: MobileMoreViewProps) {
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

  const formatLabel = pendingExportFormat === 'pdf' ? 'PDF' : pendingExportFormat === 'epub' ? 'EPUB' : 'HTML'

  // Pushed screens rather than sheets: each of these is a full working
  // surface (a page editor with a cover canvas, an image grid, a find-and-
  // replace list), and a sheet would leave them a few hundred pixels tall.
  if (pagesOpen) return <MobilePagesView project={project} onBack={() => setPagesOpen(false)} />
  if (assetsOpen) return <MobileAssetsView projectId={project.id} onBack={() => setAssetsOpen(false)} />
  if (searchOpen) return <MobileSearchView project={project} onBack={() => setSearchOpen(false)} />

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-background pb-6">
      <input {...projectFileInputProps} />

      <Group title="Export">
        <Row
          icon={Download}
          label="Export PDF"
          // `canExport` is false until the Preview tab has laid the book out —
          // PDF export renders exactly what was paginated, so saying why is
          // more useful than an unexplained disabled row.
          detail={pdf.canExport ? 'Print-ready, with bleed and crop marks' : 'Open Preview once to lay the book out first'}
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
      </Group>

      {/* Bottom sheets rather than centred dialogs: a phone has no room for a
          floating panel, and `ui/sheet.tsx` is already the mobile-shaped
          primitive (drag handle, max-height, internal scrolling) — it needs
          no size or overflow overrides here. */}
      <ExportReadinessDialog
        open={readinessOpen}
        onOpenChange={setReadinessOpen}
        findings={readinessFindings}
        formatLabel={formatLabel}
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
            <ImportManuscriptButton projectId={project.id} />
            <p className="flex items-center gap-1.5 text-xs text-text-muted">
              <FileText className="size-3.5" />
              .epub · .docx · .md · .txt · .html
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <ProjectSettingsDialog project={project} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <VersionHistoryDialog projectId={project.id} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronsLeft, ChevronUp, Copy, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/uiStore'
import { useContentStore } from '@/store/contentStore'
import { EMPTY_ASSETS, useAssetStore } from '@/store/assetStore'
import { removeAssetWithHistory, renameChapterWithHistory, deleteChapterWithHistory, addChapterWithHistory, moveChapterWithHistory, insertPageWithHistory, duplicatePageWithHistory, deletePageWithHistory, movePageWithHistory } from '@/store/editorActions'
import { useSelectionStore } from '@/store/selectionStore'
import { useDragStore } from '@/store/dragStore'
import { ASSET_DRAG_MIME } from '@/layout/dragTypes'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { getStructuralPageTypeDefinition } from '@/structuralPages/registry'
import type { StructuralPage, StructuralPageCategory, StructuralPageType } from '@/types/structuralPage'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/common/EmptyState'
import { BookOpen, Image as ImageIcon } from 'lucide-react'
import { SearchPanel } from '@/layout/SearchPanel'
import type { Project } from '@/types'

/** Types offered by the "Add Page" picker per category. Phase 20 (Milestone
 * 4, first batch) added Half Title/Dedication/Foreword/Preface/
 * Acknowledgements alongside Phase 19's original 4 — order here is cosmetic
 * only (roughly matching real front-matter convention: Half Title before
 * Title Page, Dedication/Foreword/Preface/Acknowledgements after Copyright)
 * and doesn't enforce anything once a page is actually inserted; users can
 * still freely reorder with the up/down buttons. The remaining ~25 back-
 * matter-heavy types are batched into a later milestone — see
 * docs/MODULAR_PAGE_SYSTEM_PLAN.md. None of these five make sense as back
 * matter, so Back Matter's list is unchanged (Blank Page only). */
const FRONT_MATTER_ADDABLE_TYPES: StructuralPageType[] = [
  'cover',
  'half-title',
  'title-page',
  'copyright',
  'dedication',
  'foreword',
  'preface',
  'acknowledgements',
  'blank',
]
/** Phase 21 (Milestone 4, second batch) added eight back-matter types —
 * order here roughly matches real back-matter convention (Conclusion first,
 * then Appendix/Glossary/Bibliography/Index, then About the Author, then
 * the printing-info pages last) and is cosmetic only, same as front
 * matter's list above. */
const BACK_MATTER_ADDABLE_TYPES: StructuralPageType[] = [
  'conclusion',
  'appendix',
  'glossary',
  'bibliography',
  'index',
  'about-the-author',
  'isbn-page',
  'barcode',
  // Back Cover is deliberately last — it's the physical last page of a
  // printed book, and while reordering is always available via the
  // up/down buttons below, defaulting new inserts to the end of this list
  // matches where it almost always actually belongs.
  'back-cover',
  'blank',
]

interface StructuralPageRowProps {
  projectId: string
  page: StructuralPage
  selected: boolean
}

/** One row in the Structure tab's Front Matter / Back Matter list — icon +
 * label, up/down reorder, duplicate, delete. No confirm dialog on delete:
 * undo now covers structural pages too (see `editorActions.ts`), the same
 * "no confirm needed, undo covers it" pattern this file's own asset-delete
 * button below already established. */
function StructuralPageRow({ projectId, page, selected }: StructuralPageRowProps) {
  const selectStructuralPage = useSelectionStore((s) => s.selectStructuralPage)
  const requestScrollToPage = useSelectionStore((s) => s.requestScrollToPage)
  const setInspectorTab = useUiStore((s) => s.setInspectorTab)
  const def = getStructuralPageTypeDefinition(page.type)
  if (!def) return null
  const Icon = def.icon

  const handleClick = () => {
    selectStructuralPage(page.id)
    requestScrollToPage(page.id)
    setInspectorTab('page')
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-[var(--radius-button)] px-2.5 py-1.5 text-sm font-medium transition-colors duration-150',
        selected ? 'bg-selection text-text-primary' : 'text-text-secondary hover:bg-hover hover:text-text-primary',
      )}
    >
      <button type="button" onClick={handleClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{def.label}</span>
      </button>
      <button
        type="button"
        onClick={() => movePageWithHistory(projectId, page.id, 'up')}
        aria-label={`Move ${def.label} up`}
        className="shrink-0 rounded-sm p-0.5 text-text-muted opacity-35 transition-opacity duration-150 hover:text-text-primary hover:opacity-100 group-hover:opacity-100"
      >
        <ChevronUp className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => movePageWithHistory(projectId, page.id, 'down')}
        aria-label={`Move ${def.label} down`}
        className="shrink-0 rounded-sm p-0.5 text-text-muted opacity-35 transition-opacity duration-150 hover:text-text-primary hover:opacity-100 group-hover:opacity-100"
      >
        <ChevronDown className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => duplicatePageWithHistory(projectId, page.id)}
        aria-label={`Duplicate ${def.label}`}
        className="shrink-0 rounded-sm p-0.5 text-text-muted opacity-35 transition-opacity duration-150 hover:text-text-primary hover:opacity-100 group-hover:opacity-100"
      >
        <Copy className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => deletePageWithHistory(projectId, page.id)}
        aria-label={`Delete ${def.label}`}
        className="shrink-0 rounded-sm p-0.5 text-text-muted opacity-35 transition-opacity duration-150 hover:text-text-primary hover:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

interface StructuralSectionProps {
  title: string
  category: StructuralPageCategory
  pages: StructuralPage[]
  addableTypes: StructuralPageType[]
  projectId: string
  selectedStructuralPageId: string | null
}

function StructuralSection({ title, category, pages, addableTypes, projectId, selectedStructuralPageId }: StructuralSectionProps) {
  const handleAdd = (type: StructuralPageType) => {
    const lastId = pages.length > 0 ? pages[pages.length - 1].id : null
    insertPageWithHistory(projectId, category, type, lastId)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1.5 py-1">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{title}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" aria-label={`Add ${title.toLowerCase()} page`}>
              <Plus className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {addableTypes.map((type) => {
              const def = getStructuralPageTypeDefinition(type)
              if (!def) return null
              const Icon = def.icon
              return (
                <DropdownMenuItem key={type} onClick={() => handleAdd(type)} className="gap-2">
                  <Icon className="size-3.5" />
                  {def.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {pages.length === 0 ? (
        <p className="px-2 pb-2 text-xs text-text-secondary">No {title.toLowerCase()} pages yet.</p>
      ) : (
        <div className="flex flex-col gap-0.5 pb-1">
          {pages.map((page) => (
            <StructuralPageRow key={page.id} projectId={projectId} page={page} selected={selectedStructuralPageId === page.id} />
          ))}
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  project: Project
}

/** Left column of the three-column shell: chapter navigation + asset library. */
export function Sidebar({ project }: SidebarProps) {
  const navigate = useNavigate()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const selectedChapterId = useSelectionStore((s) => s.selectedChapterId)
  const requestScrollToChapter = useSelectionStore((s) => s.requestScrollToChapter)
  const clearSelection = useSelectionStore((s) => s.clear)

  const [renamingChapterId, setRenamingChapterId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')

  const startRename = (chapterId: string, currentTitle: string) => {
    setTitleDraft(currentTitle)
    setRenamingChapterId(chapterId)
  }

  const commitRename = (chapterId: string, fallback: string) => {
    renameChapterWithHistory(project.id, chapterId, titleDraft.trim() || fallback)
    setRenamingChapterId(null)
  }

  const handleDeleteChapter = (chapterId: string) => {
    deleteChapterWithHistory(project.id, chapterId)
    if (renamingChapterId === chapterId) setRenamingChapterId(null)
    if (selectedChapterId === chapterId) clearSelection()
  }

  /** Always appends after the current last chapter (or starts a brand-new
   * manuscript if there are none yet) and drops straight into rename mode,
   * so typing the real title is the very next thing the user does — no
   * separate "name it" step. */
  const handleAddChapter = () => {
    const lastChapterId = manuscript && manuscript.chapters.length > 0 ? manuscript.chapters[manuscript.chapters.length - 1].id : null
    const newChapterId = addChapterWithHistory(project.id, lastChapterId, 'Untitled Chapter')
    startRename(newChapterId, 'Untitled Chapter')
    requestScrollToChapter(newChapterId)
  }

  const assets = useAssetStore((s) => s.byProject[project.id] ?? EMPTY_ASSETS)
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  const loadAssets = useAssetStore((s) => s.loadAssets)
  const importFiles = useAssetStore((s) => s.importFiles)
  const startDraggingAsset = useDragStore((s) => s.startDraggingAsset)
  const stopDraggingAsset = useDragStore((s) => s.stopDraggingAsset)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const structuralPages = useStructuralPageStore((s) => s.byProject[project.id] ?? EMPTY_STRUCTURAL_PAGES)
  const selectedStructuralPageId = useSelectionStore((s) => s.selectedStructuralPageId)
  const frontMatterPages = structuralPages.filter((p) => p.category === 'front-matter').sort((a, b) => a.order - b.order)
  const backMatterPages = structuralPages.filter((p) => p.category === 'back-matter').sort((a, b) => a.order - b.order)

  useEffect(() => {
    loadAssets(project.id)
  }, [project.id, loadAssets])

  if (collapsed) return null

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 shrink-0 items-center gap-1 px-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to Projects">
          <ArrowLeft className="size-4" />
        </Button>
        <span className="truncate text-sm font-medium text-text-primary">{project.name}</span>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={toggleSidebar} aria-label="Collapse sidebar">
          <ChevronsLeft className="size-4" />
        </Button>
      </div>

      <Tabs defaultValue="chapters" className="flex min-h-0 flex-1 flex-col px-3">
        {/* Same tight density Inspector.tsx already uses for its own
           5-tab row (px-1.5 text-xs) — this row went from 3 tabs to 4 when
           Search was added, and at the original px-3 text-sm sizing all 4
           labels together don't fit this sidebar's fixed 264px width. Every
           TabsTrigger now has min-w-0 + truncate as a safety net (see
           tabs.tsx), but the real fix is sizing that actually fits instead
           of relying on ellipsis. */}
        <TabsList className="w-full gap-0.5">
          <TabsTrigger value="chapters" className="flex-1 px-1.5 text-xs">Chapters</TabsTrigger>
          <TabsTrigger value="structure" className="flex-1 px-1.5 text-xs">Structure</TabsTrigger>
          <TabsTrigger value="assets" className="flex-1 px-1.5 text-xs">Assets</TabsTrigger>
          <TabsTrigger value="search" className="flex-1 px-1.5 text-xs">Search</TabsTrigger>
        </TabsList>

        <TabsContent value="chapters" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Chapters</span>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Add chapter" onClick={handleAddChapter}>
              <Plus className="size-3.5" />
            </Button>
          </div>
          <ScrollArea className="h-full flex-1">
            {!manuscript || manuscript.chapters.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No chapters yet"
                description="Import a manuscript, or add your first chapter to start from scratch."
                action={
                  <Button variant="secondary" size="sm" className="gap-1.5" onClick={handleAddChapter}>
                    <Plus className="size-3.5" />
                    Add Chapter
                  </Button>
                }
                className="py-12"
              />
            ) : (
              <nav className="flex flex-col gap-0.5 py-1">
                {manuscript.chapters.map((chapter, i) =>
                  renamingChapterId === chapter.id ? (
                    <div key={chapter.id} className="flex items-center gap-2.5 px-2.5 py-1.5">
                      <span className="text-xs tabular-nums text-text-muted">{i + 1}</span>
                      <input
                        autoFocus
                        value={titleDraft}
                        // Selects the pre-filled title (e.g. "Untitled
                        // Chapter") the instant this input gains focus, so
                        // the very next keystroke replaces it outright
                        // rather than merging into it — the same rename-
                        // in-place convention every desktop file browser
                        // uses. Found missing during a live first-time-
                        // author UX audit (docs/STATUS.md, Phase 78,
                        // 2026-08-02): typing a new chapter title produced
                        // "Untitled ChapterThe Lighting" instead of
                        // replacing the placeholder.
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onBlur={() => commitRename(chapter.id, chapter.title)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            ;(e.currentTarget as HTMLInputElement).blur()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setRenamingChapterId(null)
                          }
                        }}
                        className="min-w-0 flex-1 rounded-[var(--radius-button)] border border-[var(--color-warning)] bg-panel px-1.5 py-0.5 text-sm text-text-primary outline-none"
                      />
                    </div>
                  ) : (
                    <div
                      key={chapter.id}
                      className={cn(
                        // gap-1 (not gap-2.5) between the title button and the four
                        // action icons — matches StructuralPageRow above. With four
                        // icons now on this row (up/down/rename/delete, since Phase
                        // 52 added reordering), the wider gap left too little room
                        // for the title and truncated it on hover — see
                        // docs/STATUS.md's audit-fixes entry.
                        'group flex items-center gap-1 rounded-[var(--radius-button)] px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150',
                        selectedChapterId === chapter.id
                          ? 'bg-selection text-text-primary'
                          : 'text-text-secondary hover:bg-hover hover:text-text-primary',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => requestScrollToChapter(chapter.id)}
                        onDoubleClick={() => startRename(chapter.id, chapter.title)}
                        className="flex min-w-0 flex-1 items-start gap-2.5 py-0.5 text-left"
                      >
                        <span className="pt-px text-xs tabular-nums text-text-muted">{i + 1}</span>
                        {/* Wraps to 2 lines instead of truncating to one — a long
                         * title is fully readable in the row itself now, not just
                         * via the hover-only `title` tooltip (kept below as a
                         * fallback for the rare title that still overflows 2 lines). */}
                        <span className="line-clamp-2 break-words" title={chapter.title}>
                          {chapter.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveChapterWithHistory(project.id, chapter.id, 'up')}
                        disabled={i === 0}
                        aria-label={`Move ${chapter.title} up`}
                        className="shrink-0 rounded-sm p-0.5 text-text-muted opacity-35 transition-opacity duration-150 hover:text-text-primary hover:opacity-100 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ChevronUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveChapterWithHistory(project.id, chapter.id, 'down')}
                        disabled={!manuscript || i === manuscript.chapters.length - 1}
                        aria-label={`Move ${chapter.title} down`}
                        className="shrink-0 rounded-sm p-0.5 text-text-muted opacity-35 transition-opacity duration-150 hover:text-text-primary hover:opacity-100 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ChevronDown className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startRename(chapter.id, chapter.title)}
                        aria-label={`Rename ${chapter.title}`}
                        className="shrink-0 rounded-sm p-0.5 text-text-muted opacity-35 transition-opacity duration-150 hover:text-text-primary hover:opacity-100 group-hover:opacity-100"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteChapter(chapter.id)}
                        aria-label={`Delete ${chapter.title}`}
                        title="Delete chapter (title + all its content)"
                        className="shrink-0 rounded-sm p-0.5 text-text-muted opacity-35 transition-opacity duration-150 hover:text-danger hover:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ),
                )}
              </nav>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="structure" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-3 py-1">
              <StructuralSection
                title="Front Matter"
                category="front-matter"
                pages={frontMatterPages}
                addableTypes={FRONT_MATTER_ADDABLE_TYPES}
                projectId={project.id}
                selectedStructuralPageId={selectedStructuralPageId}
              />
              <StructuralSection
                title="Back Matter"
                category="back-matter"
                pages={backMatterPages}
                addableTypes={BACK_MATTER_ADDABLE_TYPES}
                projectId={project.id}
                selectedStructuralPageId={selectedStructuralPageId}
              />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="assets" className="flex min-h-0 flex-1 flex-col">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) importFiles(project.id, files)
              e.target.value = ''
            }}
          />
          <Button variant="secondary" size="sm" className="mb-2 gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="size-3.5" />
            Add Images
          </Button>
          <ScrollArea className="h-full flex-1">
            {assets.length === 0 ? (
              <EmptyState icon={ImageIcon} title="No images yet" description="Add illustrations for your book." className="py-10" />
            ) : (
              <div className="grid grid-cols-2 gap-2 pb-3">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(ASSET_DRAG_MIME, asset.id)
                      e.dataTransfer.effectAllowed = 'copy'
                      startDraggingAsset(asset.id)
                    }}
                    onDragEnd={() => stopDraggingAsset()}
                    className="group relative aspect-square cursor-grab overflow-hidden rounded-[var(--radius-image)] border border-border active:cursor-grabbing"
                    title="Drag onto a page to place this image"
                  >
                    {getObjectUrl(asset.id) && (
                      <img src={getObjectUrl(asset.id)} alt={asset.name} className="size-full object-cover" draggable={false} />
                    )}
                    <button
                      type="button"
                      onClick={() => removeAssetWithHistory(project.id, asset.id)}
                      aria-label={`Delete ${asset.name}`}
                      className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="search" className="flex min-h-0 flex-1 flex-col">
          <SearchPanel project={project} />
        </TabsContent>
      </Tabs>
    </aside>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { StructuralPagePanel } from '@/layout/inspector/StructuralPagePanel'
import {
  deletePageWithHistory,
  duplicatePageWithHistory,
  insertPageWithHistory,
  movePageWithHistory,
} from '@/store/editorActions'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { useSelectionStore } from '@/store/selectionStore'
import { getStructuralPageTypeDefinition } from '@/structuralPages/registry'
import { Page } from '@/renderer/Page'
import { computePageBox } from '@/renderer/pageGeometry'
import { computePreviewScale } from '@/layout/mobile/previewScale'
import { resolveTheme } from '@/theme'
import type { Project } from '@/types'
import type { LaidOutPage } from '@/renderer/paginate'
import type { StructuralPage, StructuralPageCategory, StructuralPageType } from '@/types/structuralPage'

/** Kept in step with `Sidebar.tsx`'s lists of the same name — the desktop
 * Structure column and this screen are two views of one book, so an addable
 * type must never be offered in one and missing from the other. Duplicated
 * rather than imported because `Sidebar.tsx` doesn't export them and it is
 * not this feature's business to reshape that file. */
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
const BACK_MATTER_ADDABLE_TYPES: StructuralPageType[] = [
  'conclusion',
  'appendix',
  'glossary',
  'bibliography',
  'index',
  'about-the-author',
  'isbn-page',
  'barcode',
  'back-cover',
  'blank',
]

interface PageRowProps {
  projectId: string
  page: StructuralPage
  onEdit: (pageId: string) => void
}

function PageRow({ projectId, page, onEdit }: PageRowProps) {
  const def = getStructuralPageTypeDefinition(page.type)
  if (!def) return null
  const Icon = def.icon

  // Every control here is its own tap target at the 44px touch minimum, not
  // the desktop row's 14px hover-revealed icons — those exist because a mouse
  // can hit them precisely and a pointer hovering the row is what reveals
  // them at all. Neither is true on a phone.
  return (
    <div className="flex items-center gap-1 border-b border-border px-2">
      <button type="button" onClick={() => onEdit(page.id)} className="flex min-w-0 flex-1 items-center gap-2.5 py-3 text-left active:opacity-60">
        <Icon className="size-4 shrink-0 text-text-secondary" />
        <span className="min-w-0 truncate text-[15px] text-text-primary">{def.label}</span>
      </button>
      <button
        type="button"
        onClick={() => movePageWithHistory(projectId, page.id, 'up')}
        aria-label={`Move ${def.label} up`}
        className="flex size-11 shrink-0 items-center justify-center text-text-muted active:text-text-primary"
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => movePageWithHistory(projectId, page.id, 'down')}
        aria-label={`Move ${def.label} down`}
        className="flex size-11 shrink-0 items-center justify-center text-text-muted active:text-text-primary"
      >
        <ChevronDown className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => duplicatePageWithHistory(projectId, page.id)}
        aria-label={`Duplicate ${def.label}`}
        className="flex size-11 shrink-0 items-center justify-center text-text-muted active:text-text-primary"
      >
        <Copy className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => deletePageWithHistory(projectId, page.id)}
        aria-label={`Delete ${def.label}`}
        className="flex size-11 shrink-0 items-center justify-center text-text-muted active:text-danger"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

interface SectionProps {
  title: string
  category: StructuralPageCategory
  pages: StructuralPage[]
  addableTypes: StructuralPageType[]
  projectId: string
  onEdit: (pageId: string) => void
  onAdd: (category: StructuralPageCategory, addableTypes: StructuralPageType[]) => void
}

function Section({ title, category, pages, addableTypes, projectId, onEdit, onAdd }: SectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between px-4 pb-1.5 pt-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</h2>
        <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={() => onAdd(category, addableTypes)}>
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
      {pages.length === 0 ? (
        <p className="px-4 pb-2 text-[13px] text-text-secondary">No {title.toLowerCase()} pages yet.</p>
      ) : (
        <div className="border-t border-border">
          {pages.map((page) => (
            <PageRow key={page.id} projectId={projectId} page={page} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  )
}

interface MobilePagesViewProps {
  project: Project
  /** Returns to whatever pushed this screen — `MobileMoreView`'s list. */
  onBack: () => void
}

/**
 * Front and back matter on a phone: add, reorder, duplicate, delete and edit
 * the pages that aren't chapters — cover, title page, copyright, dedication,
 * back cover and the rest.
 *
 * Before this, mobile could *render* structural pages in Preview but had no
 * way to create one, so a book started on a phone could never get a cover
 * (user report, 2026-09-04).
 *
 * Editing reuses `StructuralPagePanel` verbatim rather than reimplementing
 * ~890 lines of per-type forms. That panel already takes only a `projectId`
 * and reads which page to edit from `selectionStore`, so selecting the page
 * and rendering the panel is the whole integration — and any future page type
 * gains a mobile editor the day it gains a desktop one, with no second place
 * to remember to update.
 */
export function MobilePagesView({ project, onBack }: MobilePagesViewProps) {
  const projectId = project.id
  const pages = useStructuralPageStore((s) => s.byProject[projectId] ?? EMPTY_STRUCTURAL_PAGES)
  const selectStructuralPage = useSelectionStore((s) => s.selectStructuralPage)
  const selectedStructuralPageId = useSelectionStore((s) => s.selectedStructuralPageId)

  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState<{ category: StructuralPageCategory; types: StructuralPageType[] } | null>(null)

  const frontMatter = pages.filter((p) => p.category === 'front-matter').sort((a, b) => a.order - b.order)
  const backMatter = pages.filter((p) => p.category === 'back-matter').sort((a, b) => a.order - b.order)

  const editingPage = editing ? pages.find((p) => p.id === selectedStructuralPageId) : undefined
  const editingDef = editingPage ? getStructuralPageTypeDefinition(editingPage.type) : undefined

  const openEditor = (pageId: string) => {
    selectStructuralPage(pageId)
    setEditing(true)
  }

  const addPage = (type: StructuralPageType) => {
    if (!adding) return
    const siblings = adding.category === 'front-matter' ? frontMatter : backMatter
    const lastId = siblings.length > 0 ? siblings[siblings.length - 1].id : null
    const newId = insertPageWithHistory(projectId, adding.category, type, lastId)
    setAdding(null)
    // Straight into the editor: a page added from here is almost always added
    // because it needs filling in, and on a phone "now go and find it" is a
    // real cost. `insertPageWithHistory` returns the new id for exactly this.
    openEditor(newId)
  }

  // The page editor takes over the whole screen rather than opening a sheet on
  // top of a sheet — `StructuralPagePanel` includes the cover canvas, which
  // needs every pixel a phone has.
  if (editing && editingPage) {
    return (
      <div className="flex h-full flex-col bg-background">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="flex shrink-0 items-center gap-1.5 border-b border-border bg-panel px-3 py-3 text-left active:bg-hover"
        >
          <ChevronLeft className="size-4 shrink-0 text-text-muted" />
          <span className="text-[15px] font-medium text-text-secondary">Book pages</span>
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <StructuralPagePreview project={project} page={editingPage} />
          <ErrorBoundary
            key={editingPage.id}
            fallback={(error, reset) => (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <p className="text-[15px] font-semibold text-text-primary">{editingDef?.label ?? 'This page'} couldn't be opened</p>
                <p className="text-[13px] text-text-secondary">Your other pages are unaffected — use the back arrow to return to the list.</p>
                <pre className="max-h-24 w-full overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-button)] bg-background-secondary p-2 text-[11px] text-text-secondary">
                  {error.name}: {error.message}
                </pre>
                <Button size="sm" onClick={reset}>
                  Try again
                </Button>
              </div>
            )}
          >
            <StructuralPagePanel projectId={projectId} />
          </ErrorBoundary>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-1.5 border-b border-border bg-panel px-3 py-3 text-left active:bg-hover"
      >
        <ChevronLeft className="size-4 shrink-0 text-text-muted" />
        <span className="text-[15px] font-medium text-text-secondary">More</span>
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
        <Section
          title="Front matter"
          category="front-matter"
          pages={frontMatter}
          addableTypes={FRONT_MATTER_ADDABLE_TYPES}
          projectId={projectId}
          onEdit={openEditor}
          onAdd={(category, types) => setAdding({ category, types })}
        />
        <Section
          title="Back matter"
          category="back-matter"
          pages={backMatter}
          addableTypes={BACK_MATTER_ADDABLE_TYPES}
          projectId={projectId}
          onEdit={openEditor}
          onAdd={(category, types) => setAdding({ category, types })}
        />
      </div>

      <Sheet open={adding !== null} onOpenChange={(open) => !open && setAdding(null)}>
        <SheetContent className="max-h-[85dvh]">
          <SheetHeader>
            <SheetTitle>Add a {adding?.category === 'front-matter' ? 'front matter' : 'back matter'} page</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto pb-6">
            {(adding?.types ?? []).map((type) => {
              const def = getStructuralPageTypeDefinition(type)
              if (!def) return null
              const Icon = def.icon
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => addPage(type)}
                  className={cn('flex w-full items-center gap-3 border-b border-border px-2 py-3.5 text-left active:bg-hover')}
                >
                  <Icon className="size-4 shrink-0 text-text-secondary" />
                  <span className="text-[15px] text-text-primary">{def.label}</span>
                </button>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

/**
 * The page itself, live, above its own form.
 *
 * Editing a cover on a phone used to be a blind form — you set a title,
 * toggled what showed, picked a layout, and never saw the cover (user,
 * 2026-09-04: "should there be a separate cover/back cover editor in mobile
 * mode"). A cover is the most visual thing in a book and the most likely
 * thing anyone wants to fiddle with on a phone, so seeing it is most of what
 * a dedicated editor would have given — without a second editing surface to
 * keep in sync with the desktop one.
 *
 * Renders the real `Page` component, CSS-scaled to fit, exactly as mobile
 * Preview does: what you see here is what prints. `decorative` keeps it
 * non-interactive and, more importantly, stops it emitting duplicate DOM ids
 * for a page the real preview may also be rendering.
 *
 * Positioning cover elements by touch (drag, resize, focal point) is
 * deliberately still desktop-only — that is a canvas-interaction design
 * pass, not a port, and half of it would be worse than none.
 */
function StructuralPagePreview({ project, page }: { project: Project; page: StructuralPage }) {
  const [width, setWidth] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === 'undefined' ? 0 : window.innerHeight))
  const pageBox = useMemo(() => computePageBox(project.settings), [project.settings])
  const theme = useMemo(() => resolveTheme(project.settings.themeId), [project.settings.themeId])

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Fitting on width alone made a 6x9 page 570px tall on a 700px phone: the
  // preview filled the screen and pushed the fields you were editing out of
  // sight, which defeats the point of showing it at all. Bounded by height
  // too, so the page and the form it belongs to are visible together.
  const widthScale = computePreviewScale(width, pageBox.widthPx)
  const heightScale = viewportHeight > 0 ? (viewportHeight * 0.34) / pageBox.heightPx : widthScale
  const scale = widthScale === 0 ? 0 : Math.min(widthScale, heightScale)

  const laidOut: LaidOutPage = {
    id: page.id,
    number: 0,
    side: 'right',
    kind: 'structural',
    structuralPageId: page.id,
    blocks: [],
  }

  return (
    <div
      ref={(el) => {
        const w = el?.clientWidth ?? 0
        if (w && Math.abs(w - width) > 1) setWidth(w)
      }}
      className="flex justify-center border-b border-border bg-background-secondary px-4 py-5"
    >
      {scale > 0 && (
        // Wrapped in a box of the *scaled* size: a CSS transform alone
        // doesn't affect layout, so without this the form would overlap it.
        <div style={{ width: pageBox.widthPx * scale, height: pageBox.heightPx * scale }} className="overflow-hidden shadow-[var(--shadow-md)]">
          <div style={{ width: pageBox.widthPx, height: pageBox.heightPx, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <Page
              projectId={project.id}
              page={laidOut}
              pageBox={pageBox}
              theme={theme}
              dropCapBlockIds={EMPTY_DROP_CAPS}
              bookTitle={project.name}
              language={project.settings.language}
              decorative
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** Stable empty set — a fresh `new Set()` each render would defeat memoisation
 * downstream, the same reason `EMPTY_ASSETS` exists in `assetStore`. */
const EMPTY_DROP_CAPS: Set<string> = new Set()

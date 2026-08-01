import { useState } from 'react'
import type { ReactNode } from 'react'
import { GalleryHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStructuralPageStore, EMPTY_STRUCTURAL_PAGES } from '@/store/structuralPageStore'
import { useProjectStore } from '@/store/projectStore'
import { useExportStore } from '@/store/exportStore'
import { resolveTheme } from '@/theme/presets'
import { computePageBox, PX_PER_MM } from '@/renderer/pageGeometry'
import { computeSpineWidthMm, PAPER_TYPE_LABELS, type CoverPaperType } from '@/cover/spineWidth'
import { coverPageType } from '@/structuralPages/types/cover'
import { backCoverPageType } from '@/structuralPages/types/backCover'

const MAX_PREVIEW_WIDTH_PX = 880
const MAX_PREVIEW_HEIGHT_PX = 460
/** A real spine still needs a visible strip even before pagination has run
 * once this session, or for a very short book — same "not computed yet" gap
 * `SpineWidthInfo` already has its own message for. A thin placeholder keeps
 * the preview's three-panel layout legible rather than collapsing the spine
 * strip to nothing. */
const MIN_DISPLAY_SPINE_WIDTH_PX = 10

/**
 * One scaled-down panel — the exact `absolute` + `origin-top-left` +
 * `scale()` technique `ThumbnailPage.tsx` established for shrinking a real,
 * full-size page render into a smaller box, reused here rather than
 * re-deriving the same trick a second time. `pointer-events-none` is
 * defense in depth on top of the `Render` calls' own `selected={false}` +
 * no-op `onSelect`/`onCommit` below — this preview is read-only end to end.
 */
function ScaledPanel({ widthPx, heightPx, scale, children }: { widthPx: number; heightPx: number; scale: number; children: ReactNode }) {
  return (
    <div className="relative shrink-0 overflow-hidden" style={{ width: widthPx * scale, height: heightPx * scale }}>
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ width: widthPx, height: heightPx, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Read-only "wrap" preview: Back Cover, a spine strip sized from the book's
 * real live page count, and Cover, side by side — the order a real printed
 * paperback cover-wrap file reads left to right when laid flat with the
 * spine centred. Deliberately just a preview, not a new editable page or a
 * merged export artifact: Book Studio still treats Cover/Back Cover as two
 * independent structural pages/PDF exports (see `cover/spineWidth.ts`'s own
 * doc comment on why no single wraparound file exists yet) — this only lets
 * an author eyeball whether an image or design element would look
 * continuous across the wrap before assembling a real wraparound file
 * elsewhere. See docs/ROADMAP.md Phase E.
 *
 * Reuses `coverPageType.Render`/`backCoverPageType.Render` directly — the
 * exact components `Page.tsx` renders in the normal page flow — with
 * `selected={false}` and no-op `onSelect`/`onCommit`, the same
 * "render for display only" convention `Page.tsx`'s own `decorative` prop
 * already established for thumbnails, just without needing a full
 * `LaidOutPage` to drive it (Cover/Back Cover's `Render` only ever needed
 * `page`/`theme`/`pageBox`/`projectId`/`siblingPages` to begin with).
 */
export function WrapCoverPreviewButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [paperType, setPaperType] = useState<CoverPaperType>('white')
  const pages = useStructuralPageStore((s) => s.byProject[projectId] ?? EMPTY_STRUCTURAL_PAGES)
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId))
  const pageCount = useExportStore((s) => s.byProject[projectId]?.pages.length ?? 0)

  const coverPage = pages.find((p) => p.type === 'cover')
  const backCoverPage = pages.find((p) => p.type === 'back-cover')

  // Needs both panels for a meaningful wrap — a project with only one of the
  // two (or neither yet) has nothing to show side by side.
  if (!coverPage || !backCoverPage || !project) return null

  const theme = resolveTheme(project.settings.themeId)
  const pageBox = computePageBox(project.settings)
  const spineWidthPx = pageCount > 0 ? computeSpineWidthMm(pageCount, paperType) * PX_PER_MM : 0
  const displaySpineWidthPx = Math.max(spineWidthPx, MIN_DISPLAY_SPINE_WIDTH_PX)
  const totalWidthPx = pageBox.widthPx * 2 + displaySpineWidthPx
  const scale = Math.min(MAX_PREVIEW_WIDTH_PX / totalWidthPx, MAX_PREVIEW_HEIGHT_PX / pageBox.heightPx, 1)

  const noop = () => {}
  const renderProps = { theme, pageBox, projectId, siblingPages: pages, selected: false, onSelect: noop, onCommit: noop }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className="w-full justify-center gap-2">
          <GalleryHorizontal className="size-4" />
          Preview cover wrap
        </Button>
      </DialogTrigger>
      <DialogContent className="w-auto max-w-none">
        <DialogHeader>
          <DialogTitle>Cover wrap preview</DialogTitle>
          <DialogDescription>
            Back Cover, spine, and Cover side by side, as they&apos;d read across a real printed wraparound cover.
            Read-only — edit each page in its own preview to change anything here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="wrap-paper-type" className="text-xs text-text-secondary">
              Paper stock
            </Label>
            <Select value={paperType} onValueChange={(value) => setPaperType(value as CoverPaperType)}>
              <SelectTrigger id="wrap-paper-type" className="h-8 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAPER_TYPE_LABELS) as CoverPaperType[]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {PAPER_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className="relative mx-auto flex overflow-hidden rounded-[var(--radius-card)] border border-border shadow-[var(--shadow-sm)]"
            style={{ width: totalWidthPx * scale, height: pageBox.heightPx * scale }}
          >
            <ScaledPanel widthPx={pageBox.widthPx} heightPx={pageBox.heightPx} scale={scale}>
              <backCoverPageType.Render page={backCoverPage} {...renderProps} />
            </ScaledPanel>
            <div
              className="relative shrink-0 border-x border-black/15 bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.06)_0px,rgba(0,0,0,0.06)_1px,transparent_1px,transparent_6px)]"
              style={{ width: displaySpineWidthPx * scale, height: pageBox.heightPx * scale }}
              title="Spine — width estimated from the live page count"
            />
            <ScaledPanel widthPx={pageBox.widthPx} heightPx={pageBox.heightPx} scale={scale}>
              <coverPageType.Render page={coverPage} {...renderProps} />
            </ScaledPanel>
          </div>

          <p className="text-center text-xs text-text-secondary">
            {pageCount > 0
              ? `Spine estimated at ${(spineWidthPx / PX_PER_MM).toFixed(1)} mm for ${pageCount} pages on ${PAPER_TYPE_LABELS[paperType].toLowerCase()} — an estimate only, always confirm against your printer's own cover calculator.`
              : "Open the book preview to compute a live page count — showing a placeholder spine width until then."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

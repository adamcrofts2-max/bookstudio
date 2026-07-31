import { useState } from 'react'
import { FileQuestion } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/common/EmptyState'
import { useStructuralPageStore, EMPTY_STRUCTURAL_PAGES } from '@/store/structuralPageStore'
import { useExportStore } from '@/store/exportStore'
import { getStructuralPageTypeDefinition } from '@/structuralPages/registry'
import { updatePageContentWithHistory } from '@/store/editorActions'
import { useSelectionStore } from '@/store/selectionStore'
import { COVER_LAYOUT_OPTIONS } from '@/structuralPages/coverLayout'
import { computeSpineWidthIn, PAPER_TYPE_LABELS, MIN_PAGE_COUNT_FOR_SPINE_TEXT, type CoverPaperType } from '@/cover/spineWidth'
import type { StructuralPage, CoverTextLayout } from '@/types/structuralPage'

interface StructuralPagePanelProps {
  projectId: string
}

/** Cover/Back Cover's "Layout" preset picker — the coarse half of the
 * cover designer (see `structuralPages/coverLayout.ts`'s doc comment). The
 * fine-tune half (the drag handle) lives directly in the live preview
 * (`cover.tsx`/`backCover.tsx`), not here — this panel only ever offers
 * discrete, one-click choices, consistent with every other field on this
 * page. */
function LayoutPicker({ value, onChange }: { value: CoverTextLayout | undefined; onChange: (layout: CoverTextLayout) => void }) {
  const active = value ?? 'centered'
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Layout</Label>
      <div className="flex gap-1.5">
        {COVER_LAYOUT_OPTIONS.map((option) => (
          <Button
            key={option.id}
            type="button"
            variant={active === option.id ? 'primary' : 'secondary'}
            size="sm"
            className="flex-1"
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-text-secondary">
        Select the page in the preview, then drag the small handle above its text to fine-tune position.
      </p>
    </div>
  )
}

/**
 * Estimated wraparound-cover spine width from the book's real, live
 * paginated page count — see `cover/spineWidth.ts`'s doc comment for why
 * this belongs here rather than a separate "cover designer" dialog: Book
 * Studio doesn't generate a single wraparound cover file yet (Cover/Back
 * Cover stay two independent pages), so this is presented as the planning
 * information an author needs when building that wraparound file
 * elsewhere, not as a live-editable spine element.
 */
function SpineWidthInfo({ projectId }: { projectId: string }) {
  const pageCount = useExportStore((s) => s.byProject[projectId]?.pages.length ?? 0)
  const [paperType, setPaperType] = useState<CoverPaperType>('white')
  const spineWidthIn = computeSpineWidthIn(pageCount, paperType)

  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-border p-3">
      <Label>Spine width estimate</Label>
      <Select value={paperType} onValueChange={(value) => setPaperType(value as CoverPaperType)}>
        <SelectTrigger>
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
      {pageCount > 0 ? (
        <p className="text-xs text-text-secondary">
          At {pageCount} pages: <span className="font-medium text-text-primary">{spineWidthIn.toFixed(3)} in</span> wide —
          for preparing a wraparound cover file outside Book Studio.
          {pageCount < MIN_PAGE_COUNT_FOR_SPINE_TEXT && ' Too thin for spine text at most print-on-demand printers.'}
        </p>
      ) : (
        <p className="text-xs text-text-secondary">Open the book preview to compute a live page count.</p>
      )}
      <p className="text-[0.65rem] leading-snug text-text-secondary/80">
        Estimate only, from Amazon KDP&apos;s published paper-thickness figures — always confirm against your printer&apos;s
        own cover calculator before submitting final files.
      </p>
    </div>
  )
}

/**
 * Inspector's "Page" tab, shown instead of the read-only project settings
 * whenever a structural page (Cover/Title Page/Copyright/Blank Page) is
 * selected — see `Inspector.tsx`. Deliberately minimal per
 * docs/MODULAR_PAGE_SYSTEM_PLAN.md, Milestone 2: plain form fields wired
 * straight to `updatePageContentWithHistory`, not a rich per-type visual
 * editor (that's explicitly out of scope this milestone).
 */
export function StructuralPagePanel({ projectId }: StructuralPagePanelProps) {
  const pages = useStructuralPageStore((s) => s.byProject[projectId] ?? EMPTY_STRUCTURAL_PAGES)
  const selectedStructuralPageId = useSelectionStore((s) => s.selectedStructuralPageId)
  const page = pages.find((p) => p.id === selectedStructuralPageId)

  if (!page) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="No page selected"
        description="Select a structural page in the Structure tab or the preview to edit it here."
        className="py-12"
      />
    )
  }

  const def = getStructuralPageTypeDefinition(page.type)
  const patch = (updates: Partial<StructuralPage['content']>) => updatePageContentWithHistory(projectId, page.id, updates)

  return (
    <div className="flex flex-col gap-4 px-1 pt-1">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-primary">{def?.label ?? 'Page'}</p>
        <p className="text-xs text-text-secondary">{page.category === 'front-matter' ? 'Front matter' : 'Back matter'}</p>
      </div>

      <Separator />

      {(page.type === 'cover' || page.type === 'title-page') && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-title">Title</Label>
            <Input
              id="structural-title"
              placeholder="Book title…"
              value={page.content.title ?? ''}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-subtitle">Subtitle</Label>
            <Input
              id="structural-subtitle"
              placeholder="Optional subtitle…"
              value={page.content.subtitle ?? ''}
              onChange={(e) => patch({ subtitle: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-author">Author</Label>
            <Input
              id="structural-author"
              placeholder="Author name…"
              value={page.content.author ?? ''}
              onChange={(e) => patch({ author: e.target.value })}
            />
          </div>
          {page.type === 'cover' && (
            <>
              <p className="text-xs text-text-secondary">
                Drag an image from the Assets tab onto the cover in the preview to set (or replace) its background.
              </p>
              <Separator />
              <LayoutPicker value={page.content.layout} onChange={(layout) => patch({ layout })} />
            </>
          )}
        </>
      )}

      {page.type === 'back-cover' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-back-cover-blurb">Back-cover copy</Label>
            <Textarea
              id="structural-back-cover-blurb"
              rows={8}
              placeholder="A short, compelling summary of the book. Separate paragraphs with a blank line…"
              value={page.content.blurb ?? ''}
              onChange={(e) => patch({ blurb: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-back-cover-bio">Short author bio (optional)</Label>
            <Input
              id="structural-back-cover-bio"
              placeholder="One line about the author…"
              value={page.content.authorBio ?? ''}
              onChange={(e) => patch({ authorBio: e.target.value })}
            />
          </div>
          <p className="text-xs text-text-secondary">
            Drag an image from the Assets tab onto the back cover in the preview to set (or replace) its background.
          </p>
          <Separator />
          <LayoutPicker value={page.content.layout} onChange={(layout) => patch({ layout })} />
          <Separator />
          <SpineWidthInfo projectId={projectId} />
        </>
      )}

      {page.type === 'copyright' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-copyright-text">Copyright text</Label>
          <Textarea
            id="structural-copyright-text"
            rows={5}
            placeholder="Leave blank for a default © notice…"
            value={page.content.text ?? ''}
            onChange={(e) => patch({ text: e.target.value })}
          />
          <p className="text-xs text-text-secondary">Left blank, this shows a default notice using the current year and title page author.</p>
        </div>
      )}

      {page.type === 'half-title' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-half-title">Title</Label>
          <Input
            id="structural-half-title"
            placeholder="Leave blank to reuse the Title Page's title…"
            value={page.content.title ?? ''}
            onChange={(e) => patch({ title: e.target.value })}
          />
          <p className="text-xs text-text-secondary">Left blank, this shows the Title Page's title if one exists.</p>
        </div>
      )}

      {page.type === 'dedication' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-dedication-text">Dedication</Label>
          <Textarea
            id="structural-dedication-text"
            rows={3}
            placeholder="For someone special."
            value={page.content.text ?? ''}
            onChange={(e) => patch({ text: e.target.value })}
          />
        </div>
      )}

      {page.type === 'foreword' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-foreword-text">Foreword text</Label>
            <Textarea
              id="structural-foreword-text"
              rows={10}
              placeholder="Written by someone other than the author. Separate paragraphs with a blank line…"
              value={page.content.text ?? ''}
              onChange={(e) => patch({ text: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-foreword-author">Signed by</Label>
            <Input
              id="structural-foreword-author"
              placeholder="Attribution name…"
              value={page.content.authorName ?? ''}
              onChange={(e) => patch({ authorName: e.target.value })}
            />
          </div>
        </>
      )}

      {page.type === 'preface' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-preface-text">Preface text</Label>
          <Textarea
            id="structural-preface-text"
            rows={10}
            placeholder="Written by the author. Separate paragraphs with a blank line…"
            value={page.content.text ?? ''}
            onChange={(e) => patch({ text: e.target.value })}
          />
        </div>
      )}

      {page.type === 'acknowledgements' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-acknowledgements-text">Acknowledgements text</Label>
          <Textarea
            id="structural-acknowledgements-text"
            rows={10}
            placeholder="Separate paragraphs with a blank line…"
            value={page.content.text ?? ''}
            onChange={(e) => patch({ text: e.target.value })}
          />
        </div>
      )}

      {page.type === 'conclusion' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-conclusion-text">Conclusion text</Label>
          <Textarea
            id="structural-conclusion-text"
            rows={10}
            placeholder="Separate paragraphs with a blank line…"
            value={page.content.text ?? ''}
            onChange={(e) => patch({ text: e.target.value })}
          />
        </div>
      )}

      {page.type === 'appendix' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-appendix-title">Title</Label>
            <Input
              id="structural-appendix-title"
              placeholder="e.g. Appendix A: Plant Species List"
              value={page.content.title ?? ''}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-appendix-text">Appendix text</Label>
            <Textarea
              id="structural-appendix-text"
              rows={10}
              placeholder="Separate paragraphs with a blank line…"
              value={page.content.text ?? ''}
              onChange={(e) => patch({ text: e.target.value })}
            />
          </div>
        </>
      )}

      {page.type === 'about-the-author' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-about-text">Author bio</Label>
          <Textarea
            id="structural-about-text"
            rows={10}
            placeholder="A short author biography. Separate paragraphs with a blank line…"
            value={page.content.text ?? ''}
            onChange={(e) => patch({ text: e.target.value })}
          />
          <p className="text-xs text-text-secondary">
            Drag an image from the Assets tab onto the author photo circle in the preview to set (or replace) it.
          </p>
        </div>
      )}

      {page.type === 'bibliography' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-bibliography-entries">References</Label>
          <Textarea
            id="structural-bibliography-entries"
            rows={10}
            placeholder={'One reference per line, e.g.:\nSmith, J. (2020). Forest Ecology. Publisher.'}
            value={(page.content.entries ?? []).join('\n')}
            onChange={(e) => patch({ entries: e.target.value.split('\n') })}
          />
        </div>
      )}

      {page.type === 'glossary' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-glossary-entries">Terms</Label>
          <Textarea
            id="structural-glossary-entries"
            rows={10}
            placeholder={'One term per line, as "Term: definition", e.g.:\nMulch: A protective layer of material spread over soil.'}
            value={(page.content.entries ?? []).map((e) => (e.definition ? `${e.term}: ${e.definition}` : e.term)).join('\n')}
            onChange={(e) => {
              const entries = e.target.value.split('\n').map((line) => {
                const sep = line.indexOf(':')
                return sep === -1 ? { term: line, definition: '' } : { term: line.slice(0, sep).trim(), definition: line.slice(sep + 1).trim() }
              })
              patch({ entries })
            }}
          />
          <p className="text-xs text-text-secondary">One entry per line, formatted as "Term: definition".</p>
        </div>
      )}

      {page.type === 'index' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-index-entries">Index entries</Label>
          <Textarea
            id="structural-index-entries"
            rows={10}
            placeholder={'One entry per line, e.g.:\nComposting, 45, 112'}
            value={(page.content.entries ?? []).join('\n')}
            onChange={(e) => patch({ entries: e.target.value.split('\n') })}
          />
          <p className="text-xs text-text-secondary">
            Typed manually — automatic page-number indexing is a future feature, not built yet.
          </p>
        </div>
      )}

      {page.type === 'isbn-page' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-isbn">ISBN</Label>
            <Input
              id="structural-isbn"
              placeholder="978-0-000000-0-0"
              value={page.content.isbn ?? ''}
              onChange={(e) => patch({ isbn: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-isbn-edition">Edition</Label>
            <Input
              id="structural-isbn-edition"
              placeholder="First Edition"
              value={page.content.edition ?? ''}
              onChange={(e) => patch({ edition: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="structural-isbn-printer">Printer info</Label>
            <Input
              id="structural-isbn-printer"
              placeholder="Printed in the United Kingdom"
              value={page.content.printerInfo ?? ''}
              onChange={(e) => patch({ printerInfo: e.target.value })}
            />
          </div>
        </>
      )}

      {page.type === 'barcode' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="structural-barcode-isbn">ISBN</Label>
          <Input
            id="structural-barcode-isbn"
            placeholder="Leave blank to reuse the ISBN Page's ISBN…"
            value={page.content.isbn ?? ''}
            onChange={(e) => patch({ isbn: e.target.value })}
          />
          <p className="text-xs text-text-secondary">This is a visual placeholder, not a real scannable barcode.</p>
        </div>
      )}

      {page.type === 'blank' && (
        <p className="text-sm text-text-secondary">A blank page has no editable content — only its position in the book.</p>
      )}
    </div>
  )
}

import { Hash } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { EditableText } from '@/structuralPages/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { wrapRuns } from '@/pdf/textWrap'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

const ISBN_PLACEHOLDER = 'Add an ISBN, edition and printer information for this book.'

function buildLines(page: Extract<StructuralPage, { type: 'isbn-page' }>): string[] {
  const lines: string[] = []
  if (page.content.isbn?.trim()) lines.push(`ISBN: ${page.content.isbn.trim()}`)
  if (page.content.edition?.trim()) lines.push(page.content.edition.trim())
  if (page.content.printerInfo?.trim()) lines.push(page.content.printerInfo.trim())
  return lines
}

/** Small, unobtrusive body text near the bottom of the page. Each of
 * ISBN/edition/printer-info is its own inline-editable field (double-click)
 * via `EditableText` — previously these were only editable through the
 * Inspector's "Page" panel, see docs/ROADMAP.md Phase B. The combined
 * `ISBN_PLACEHOLDER` sentence and `buildLines` (which skips unset fields
 * entirely) remain exactly as before for the exported PDF — ghost
 * placeholder text is an on-screen editing affordance only, never printed,
 * matching `gallery.tsx`/`pullQuote.tsx`'s existing caption/attribution
 * precedent. */
function IsbnPageRender({ page, theme, selected, onSelect, onCommit }: StructuralPageRenderProps) {
  if (page.type !== 'isbn-page') return null
  const rowStyle: React.CSSProperties = { fontFamily: theme.fonts.body, color: theme.page.mutedInk }

  return (
    <div
      onClick={onSelect}
      className={cn('flex h-full w-full cursor-pointer flex-col justify-end gap-0.5 px-14 pb-16', outlineClass(selected, false))}
      style={{ background: theme.page.background }}
    >
      <p className="flex gap-1 text-[0.78em] leading-relaxed" style={rowStyle}>
        <span>ISBN:</span>
        <EditableText
          as="span"
          value={page.content.isbn ?? ''}
          placeholder="978-0-000000-0-0"
          onCommit={(value) => onCommit({ isbn: value || undefined })}
        />
      </p>
      <EditableText
        value={page.content.edition ?? ''}
        placeholder="First Edition"
        onCommit={(value) => onCommit({ edition: value || undefined })}
        className="text-[0.78em] leading-relaxed"
        style={rowStyle}
      />
      <EditableText
        value={page.content.printerInfo ?? ''}
        placeholder="Printed in the United Kingdom"
        onCommit={(value) => onCommit({ printerInfo: value || undefined })}
        className="text-[0.78em] leading-relaxed"
        style={rowStyle}
      />
    </div>
  )
}

function drawIsbnPagePdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme, pageBox: PageBox) {
  if (page.type !== 'isbn-page') return
  const lines = buildLines(page)
  const displayLines = lines.length > 0 ? lines : [ISBN_PLACEHOLDER]

  const font = pickFont(ctx.fonts, theme.fonts.body, 400)
  const size = theme.typography.bodySize * 0.78 * PX_TO_PT
  const lineHeight = size * 1.45
  const color = hexToPdfColor(theme.page.mutedInk)

  const bleedPt = pageBox.bleedPx * PX_TO_PT
  const marginBottomPt = pageBox.marginBottomPx * PX_TO_PT
  let y = bleedPt + marginBottomPt + displayLines.length * lineHeight
  for (const line of displayLines) {
    y -= lineHeight
    const wrapped = wrapRuns([{ text: line, bold: false }], font, font, size, ctx.contentWidthPt)
    for (const wrappedLine of wrapped) {
      for (const fragment of wrappedLine.fragments) {
        ctx.page.drawText(fragment.text, { x: ctx.contentX + fragment.x, y, size, font, color })
      }
    }
  }
}

export const isbnPagePageType: StructuralPageTypeDefinition = {
  id: 'isbn-page',
  category: 'back-matter',
  label: 'ISBN Page',
  icon: Hash,
  Render: IsbnPageRender,
  drawPdf: drawIsbnPagePdf,
  defaultContent: () => ({}),
}

import { ScanLine } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

const PLACEHOLDER_ISBN = '000-0-000000-00-0'

/**
 * Deliberately NOT a real, scannable EAN-13/ISBN barcode — building a proper
 * barcode-symbology renderer is a distinct, larger future task (needs a real
 * barcode library, checksum digits, quiet-zone rules, etc.), not something to
 * smuggle into this mechanical batch of structural-page types. This renders
 * an honest placeholder: a deterministic pattern of vertical bars derived
 * from the ISBN's digits (so it looks visually consistent for a given ISBN,
 * not random), with the ISBN printed as human-readable text underneath — the
 * same structural look as a real book's back-cover barcode strip, without
 * claiming to be machine-readable. See docs/STATUS.md's Phase 21 entry.
 */
function barsFromIsbn(isbn: string): { width: number; bar: boolean }[] {
  const digits = (isbn.match(/\d/g) ?? []).join('') || '0000000000000'
  const bars: { width: number; bar: boolean }[] = []
  for (const ch of digits) {
    const d = Number(ch)
    bars.push({ width: 2 + (d % 3), bar: true })
    bars.push({ width: 1 + ((d + 1) % 2), bar: false })
  }
  return bars
}

function findIsbnPageValue(siblingPages: StructuralPage[]): string | undefined {
  const isbnPage = siblingPages.find((p) => p.type === 'isbn-page')
  return isbnPage?.type === 'isbn-page' ? isbnPage.content.isbn?.trim() : undefined
}

/** Small, unobtrusive barcode strip near the bottom of the page — falls back
 * to a sibling ISBN Page's `isbn` value (same sibling-read pattern
 * `copyright.tsx` uses for the Title Page's author) before a placeholder. */
function BarcodeRender({ page, theme, selected, onSelect, siblingPages }: StructuralPageRenderProps) {
  if (page.type !== 'barcode') return null
  const isbn = page.content.isbn?.trim() || findIsbnPageValue(siblingPages) || PLACEHOLDER_ISBN
  const bars = barsFromIsbn(isbn)

  return (
    <div
      onClick={onSelect}
      className={cn('flex h-full w-full cursor-pointer flex-col items-center justify-end gap-2 px-14 pb-16', outlineClass(selected, false))}
      style={{ background: theme.page.background }}
    >
      <div className="flex h-12 items-stretch" style={{ background: '#ffffff' }}>
        {bars.map((bar, i) => (
          <div key={i} style={{ width: `${bar.width * 1.4}px`, background: bar.bar ? theme.page.ink : 'transparent' }} />
        ))}
      </div>
      <p className="text-[0.72em] tracking-widest" style={{ fontFamily: theme.fonts.body, color: theme.page.mutedInk }}>
        {isbn}
      </p>
    </div>
  )
}

function drawBarcodePdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme) {
  if (page.type !== 'barcode') return
  const isbn = page.content.isbn?.trim() || findIsbnPageValue(ctx.structuralPages) || PLACEHOLDER_ISBN
  const bars = barsFromIsbn(isbn)

  const barHeightPt = 12 * PX_TO_PT * 4
  const totalWidthPt = bars.reduce((sum, b) => sum + b.width, 0) * 1.4 * PX_TO_PT
  const startX = ctx.contentX + (ctx.contentWidthPt - totalWidthPt) / 2
  const bottomY = ctx.cursorY - barHeightPt
  const barColor = hexToPdfColor(theme.page.ink)

  let x = startX
  for (const bar of bars) {
    const w = bar.width * 1.4 * PX_TO_PT
    if (bar.bar) ctx.page.drawRectangle({ x, y: bottomY, width: w, height: barHeightPt, color: barColor })
    x += w
  }

  const font = pickFont(ctx.fonts, theme.fonts.body, 400)
  const size = theme.typography.bodySize * 0.72 * PX_TO_PT
  const width = font.widthOfTextAtSize(isbn, size)
  ctx.page.drawText(isbn, {
    x: ctx.contentX + (ctx.contentWidthPt - width) / 2,
    y: bottomY - size * 1.6,
    size,
    font,
    color: hexToPdfColor(theme.page.mutedInk),
  })
}

export const barcodePageType: StructuralPageTypeDefinition = {
  id: 'barcode',
  category: 'back-matter',
  label: 'Barcode',
  icon: ScanLine,
  Render: BarcodeRender,
  drawPdf: drawBarcodePdf,
  defaultContent: () => ({}),
}

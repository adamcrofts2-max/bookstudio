import { PDFDocument, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

import type { ExportableLayout } from '@/store/exportStore'
import type { ContentBlock } from '@/types/content'
import type { ProjectSettings } from '@/types/project'
import type { StructuralPage } from '@/types/structuralPage'
import { loadThemeFonts, pickFont, type ThemeFontSet } from '@/pdf/fonts'
import { collectUsedFontFamilies } from '@/pdf/usedFonts'
import { hexToPdfColor, pdfBlack, type PdfColorMode } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { CHAPTER_OPENER } from '@/renderer/chapterOpenerMetrics'
import { getBlockTypeDefinition } from '@/blocks/registry'
import { getStructuralPageTypeDefinition } from '@/structuralPages/registry'
import { useStructuralPageStore, EMPTY_STRUCTURAL_PAGES } from '@/store/structuralPageStore'

export interface DrawCtx {
  page: PDFPage
  fonts: ThemeFontSet
  theme: ExportableLayout['theme']
  contentX: number
  contentWidthPt: number
  cursorY: number
  /**
   * The active project id, plus every structural page in the project —
   * added for structural-page `drawPdf` implementations (see
   * `src/structuralPages/registry.ts`) that need sibling structural pages
   * (e.g. Copyright's default boilerplate wants the Title Page's author)
   * without importing `structuralPageStore` from a type module, which would
   * create an import cycle (the store imports this registry). Ignored by
   * every existing `ContentBlock` `drawPdf` — purely additive.
   */
  projectId: string
  structuralPages: StructuralPage[]
  /** The book's title, for structural pages that fall back to it when their
   * own title field is empty — see `StructuralPageRenderProps.bookTitle`.
   * Both sides carry it so an untitled Cover prints exactly what the screen
   * shows. Ignored by every `ContentBlock` `drawPdf`. */
  bookTitle: string
  /** Colour space every `hexToPdfColor`/`pdfBlack`/`pdfWhite` call in this
   * export should use — resolved once from `ProjectSettings.colorProfile`
   * (`?? 'rgb'`) at the top of `exportBookToPdf` and threaded through every
   * `DrawCtx` this file constructs, so every block/structural-page
   * `drawPdf` implementation reads it from `ctx.colorMode` rather than each
   * needing its own fallback. See `src/pdf/color.ts`'s `PdfColorMode`. */
  colorMode: PdfColorMode
}

/**
 * Draws one manuscript block's PDF representation. Each block type's actual
 * drawing logic (byte-for-byte the same as this function's old switch
 * cases) now lives in that type's own module under `src/blocks/types/` —
 * see `BlockTypeDefinition.drawPdf` in `src/blocks/registry.ts` and
 * docs/MODULAR_PAGE_SYSTEM_PLAN.md, Milestone 1.
 */
/**
 * Draws one block and then makes it occupy exactly the height the screen
 * measured for it.
 *
 * Every `drawPdf` composes its own spacing out of hand-chosen point values.
 * Phase 159 measured five of them against the DOM and found all five
 * disagreed — a paragraph's trailing gap was 14px on screen and 4pt in
 * print — which matters because `HeightMeasurer` measures the *screen* and
 * pagination assigns blocks to pages from those heights. The exporter was
 * laying the same blocks onto the same pages with different spacing: right
 * words, right page, wrong rhythm, and a strip of unexplained white at the
 * foot of every full page.
 *
 * Correcting the constants type by type only ever fixes the types someone
 * remembered to measure — nine still carried unmeasured numbers after Phase
 * 159, and a fifteenth block type would arrive with the same problem. So
 * the measured height comes through `ExportableLayout.blockHeights` and is
 * applied here, once, for every type.
 *
 * `Math.min` matters: the cursor may be pushed further down to reach the
 * measured height, never pulled back up. A block whose PDF drawing genuinely
 * needs more room than the screen gave it keeps that room rather than
 * having the next block drawn on top of it — and `pdfFidelity.e2e.mjs` will
 * report the disagreement rather than it being silently absorbed.
 */
async function drawBlock(ctx: DrawCtx, block: ContentBlock, dropCap: boolean, measuredHeightPx?: number) {
  const def = getBlockTypeDefinition(block.type)
  if (!def) return
  const topY = ctx.cursorY
  await def.drawPdf(ctx, block, dropCap)
  if (measuredHeightPx && measuredHeightPx > 0) {
    ctx.cursorY = Math.min(ctx.cursorY, topY - measuredHeightPx * PX_TO_PT)
  }
}

function drawCropMarks(page: PDFPage, mediaWidth: number, mediaHeight: number, bleedPt: number, colorMode: PdfColorMode) {
  if (bleedPt <= 0) return
  const markLength = 10
  const gap = 3
  const black = pdfBlack(colorMode)
  const corners: Array<[number, number, number, number]> = [
    [bleedPt, mediaHeight - bleedPt, 0, 1], // top-left
    [mediaWidth - bleedPt, mediaHeight - bleedPt, 0, 1], // top-right
    [bleedPt, bleedPt, 0, -1], // bottom-left
    [mediaWidth - bleedPt, bleedPt, 0, -1], // bottom-right
  ]
  for (const [x, y, , vDir] of corners) {
    // Horizontal tick
    page.drawLine({ start: { x: x - markLength - gap, y }, end: { x: x - gap, y }, thickness: 0.5, color: black })
    page.drawLine({ start: { x: x + gap, y }, end: { x: x + markLength + gap, y }, thickness: 0.5, color: black })
    // Vertical tick
    page.drawLine({ start: { x, y: y + vDir * gap }, end: { x, y: y + vDir * (gap + markLength) }, thickness: 0.5, color: black })
  }
}

/**
 * Renders the currently laid-out book (published from `BookRenderer` via
 * `useExportStore`) to a print-ready PDF: bleed, crop marks, embedded
 * self-hosted fonts, and page geometry all derived from the same
 * deterministic pagination the on-screen preview uses.
 */
export async function exportBookToPdf(layout: ExportableLayout, bookTitle: string, settings: ProjectSettings, projectId: string): Promise<Blob> {
  const { pageBox, theme, toc } = layout
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(bookTitle)
  doc.setProducer('Book Studio')
  doc.setCreator('Book Studio')

  // Structural pages (Cover/Title Page/Copyright/Blank — see
  // docs/MODULAR_PAGE_SYSTEM_PLAN.md, Milestone 2) live in their own store,
  // not in `layout`; `layout.pages` only carries each one's id
  // (`structuralPageId`) via `composeBookPages`, so the full objects are
  // read once here, outside the loop.
  const structuralPages = useStructuralPageStore.getState().byProject[projectId] ?? EMPTY_STRUCTURAL_PAGES

  // Read before embedding, not after: which fonts this book draws with
  // decides which ones are worth putting in the file at all.
  const fonts = await loadThemeFonts(doc, collectUsedFontFamilies(theme, structuralPages))
  // See `ProjectSettings.colorProfile`'s doc comment — `undefined` (every
  // project persisted before this setting existed) is `'rgb'`, unchanged
  // behaviour from before this feature existed.
  const colorMode = settings.colorProfile ?? 'rgb'

  const bleedPt = settings.bleed * (72 / 25.4) // mm -> pt
  const widthPt = pageBox.widthPx * PX_TO_PT
  const heightPt = pageBox.heightPx * PX_TO_PT
  const mediaWidth = widthPt + bleedPt * 2
  const mediaHeight = heightPt + bleedPt * 2
  const marginTopPt = pageBox.marginTopPx * PX_TO_PT
  const marginBottomPt = pageBox.marginBottomPx * PX_TO_PT
  const marginInnerPt = pageBox.marginInnerPx * PX_TO_PT
  const marginOuterPt = pageBox.marginOuterPx * PX_TO_PT
  const contentWidthPt = pageBox.contentWidthPx * PX_TO_PT

  for (const page of layout.pages) {
    const pdfPage = doc.addPage([mediaWidth, mediaHeight])
    pdfPage.drawRectangle({ x: 0, y: 0, width: mediaWidth, height: mediaHeight, color: hexToPdfColor(theme.page.background, colorMode) })
    drawCropMarks(pdfPage, mediaWidth, mediaHeight, bleedPt, colorMode)

    if (page.kind === 'blank') continue

    if (page.kind === 'structural') {
      // No running header / page-number footer for structural pages —
      // mirrors Page.tsx's `page.kind !== 'blank' && page.kind !== 'structural'`
      // chrome exclusion exactly, so `continue` here (skipping the footer
      // drawn below) keeps the two renderers WYSIWYG.
      const structuralPage = structuralPages.find((p) => p.id === page.structuralPageId)
      const def = structuralPage ? getStructuralPageTypeDefinition(structuralPage.type) : undefined
      if (structuralPage && def) {
        const ctx: DrawCtx = {
          page: pdfPage,
          fonts,
          theme,
          contentX: bleedPt + marginOuterPt,
          contentWidthPt,
          cursorY: mediaHeight - bleedPt - marginTopPt,
          projectId,
          structuralPages,
          bookTitle,
          colorMode,
        }
        await def.drawPdf(ctx, structuralPage, theme, pageBox)
      }
      continue
    }

    const isRight = page.side === 'right'
    const marginLeft = bleedPt + (isRight ? marginInnerPt : marginOuterPt)
    const contentTop = mediaHeight - bleedPt - marginTopPt
    const contentBottom = bleedPt + marginBottomPt

    const ctx: DrawCtx = { page: pdfPage, fonts, theme, contentX: marginLeft, contentWidthPt, cursorY: contentTop, projectId, structuralPages, bookTitle, colorMode }

    if (page.kind === 'toc') {
      const headingFont = pickFont(fonts, theme.fonts.heading, 600)
      ctx.cursorY -= 32
      pdfPage.drawText('Contents', { x: ctx.contentX, y: ctx.cursorY, size: 24, font: headingFont, color: hexToPdfColor(theme.page.ink, colorMode) })
      ctx.cursorY -= 40
      const bodyFont = pickFont(fonts, theme.fonts.body, 400)
      for (const entry of toc) {
        pdfPage.drawText(entry.title, { x: ctx.contentX, y: ctx.cursorY, size: 11, font: bodyFont, color: hexToPdfColor(theme.page.ink, colorMode) })
        const numText = String(entry.pageNumber)
        const numWidth = bodyFont.widthOfTextAtSize(numText, 11)
        pdfPage.drawText(numText, { x: ctx.contentX + contentWidthPt - numWidth, y: ctx.cursorY, size: 11, font: bodyFont, color: hexToPdfColor(theme.page.mutedInk, colorMode) })
        ctx.cursorY -= 22
      }
    } else if (page.kind === 'chapter-start') {
      // The opener is laid out here as boxes, the way the screen lays it
      // out, rather than as a sequence of hand-chosen baseline steps —
      // `chapterOpenerMetrics.ts` holds the numbers all three renderers
      // read. It used to print an 11pt label and a 30pt title against the
      // screen's 14px and 36px, and stood ~29px shorter overall, which was
      // enough to fit an extra line of body text onto every chapter's
      // first page in print (measured Phase 162).
      ctx.cursorY -= theme.chapterOpener.topSpacer * PX_TO_PT
      const openerTop = ctx.cursorY
      if (theme.chapterOpener.numberLabel !== 'none') {
        const font = pickFont(fonts, theme.fonts.heading, 500)
        const idx = toc.findIndex((t) => t.chapterId === page.chapterId)
        const label = theme.chapterOpener.numberLabel === 'word' ? `Chapter ${idx + 1}` : `${idx + 1}`
        ctx.cursorY -= CHAPTER_OPENER.label.lineHeightPx * PX_TO_PT
        pdfPage.drawText(label, {
          x: ctx.contentX,
          y: ctx.cursorY,
          size: CHAPTER_OPENER.label.fontPx * PX_TO_PT,
          font,
          color: hexToPdfColor(theme.page.accent, colorMode),
        })
        ctx.cursorY -= CHAPTER_OPENER.label.afterPx * PX_TO_PT
      }
      const titleFont = pickFont(fonts, theme.fonts.heading, theme.typography.headingWeight)
      ctx.cursorY -= CHAPTER_OPENER.title.lineHeightPx * PX_TO_PT
      pdfPage.drawText(page.chapterTitle ?? '', {
        x: ctx.contentX,
        y: ctx.cursorY,
        size: CHAPTER_OPENER.title.fontPx * PX_TO_PT,
        font: titleFont,
        color: hexToPdfColor(theme.page.ink, colorMode),
      })
      ctx.cursorY -= CHAPTER_OPENER.title.afterPx * PX_TO_PT
      // And, exactly as for a block, settle on the height the screen
      // actually measured for this opener — a wrapping title is taller than
      // one line, and `paginate` reserved the real number.
      const openerHeightPx = layout.blockHeights?.[`opener:${page.chapterId}`]
      if (openerHeightPx && openerHeightPx > 0) {
        ctx.cursorY = Math.min(ctx.cursorY, openerTop - openerHeightPx * PX_TO_PT)
      }
      for (const block of page.blocks) {
        const isDropCap = block.type === 'paragraph' && theme.typography.dropCap && block === page.blocks.find((b) => b.type === 'paragraph')
        await drawBlock(ctx, block, isDropCap, layout.blockHeights?.[block.id])
      }
    } else if (page.kind === 'content') {
      for (const block of page.blocks) await drawBlock(ctx, block, false, layout.blockHeights?.[block.id])
    }

    if (ctx.cursorY < contentBottom) {
      // Content overflowed its box — acceptable simplification for V1 (see docs/STATUS.md);
      // block-level pagination already guards against this in the common case.
    }

    // Page number
    const numFont = pickFont(fonts, theme.fonts.body, 400)
    const numText = String(page.number)
    const numX = isRight ? mediaWidth - bleedPt - marginOuterPt - numFont.widthOfTextAtSize(numText, 9) : bleedPt + marginOuterPt
    pdfPage.drawText(numText, { x: numX, y: bleedPt + marginBottomPt * 0.4, size: 9, font: numFont, color: hexToPdfColor(theme.page.mutedInk, colorMode) })
  }

  const bytes = await doc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

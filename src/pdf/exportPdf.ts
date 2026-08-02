import { PDFDocument, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

import type { ExportableLayout } from '@/store/exportStore'
import type { ContentBlock } from '@/types/content'
import type { ProjectSettings } from '@/types/project'
import type { StructuralPage } from '@/types/structuralPage'
import { loadThemeFonts, pickFont, type ThemeFontSet } from '@/pdf/fonts'
import { hexToPdfColor, pdfBlack, type PdfColorMode } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
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
async function drawBlock(ctx: DrawCtx, block: ContentBlock, dropCap: boolean) {
  const def = getBlockTypeDefinition(block.type)
  if (!def) return
  await def.drawPdf(ctx, block, dropCap)
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

  const fonts = await loadThemeFonts(doc)
  // Structural pages (Cover/Title Page/Copyright/Blank — see
  // docs/MODULAR_PAGE_SYSTEM_PLAN.md, Milestone 2) live in their own store,
  // not in `layout`; `layout.pages` only carries each one's id
  // (`structuralPageId`) via `composeBookPages`, so the full objects are
  // read once here, outside the loop.
  const structuralPages = useStructuralPageStore.getState().byProject[projectId] ?? EMPTY_STRUCTURAL_PAGES
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

    const ctx: DrawCtx = { page: pdfPage, fonts, theme, contentX: marginLeft, contentWidthPt, cursorY: contentTop, projectId, structuralPages, colorMode }

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
      ctx.cursorY -= theme.chapterOpener.topSpacer * PX_TO_PT
      if (theme.chapterOpener.numberLabel !== 'none') {
        const font = pickFont(fonts, theme.fonts.heading, 500)
        const idx = toc.findIndex((t) => t.chapterId === page.chapterId)
        const label = theme.chapterOpener.numberLabel === 'word' ? `Chapter ${idx + 1}` : `${idx + 1}`
        pdfPage.drawText(label, { x: ctx.contentX, y: ctx.cursorY, size: 11, font, color: hexToPdfColor(theme.page.accent, colorMode) })
        ctx.cursorY -= 22
      }
      const titleFont = pickFont(fonts, theme.fonts.heading, theme.typography.headingWeight)
      pdfPage.drawText(page.chapterTitle ?? '', { x: ctx.contentX, y: ctx.cursorY, size: 30, font: titleFont, color: hexToPdfColor(theme.page.ink, colorMode) })
      ctx.cursorY -= 40
      for (const block of page.blocks) {
        const isDropCap = block.type === 'paragraph' && theme.typography.dropCap && block === page.blocks.find((b) => b.type === 'paragraph')
        await drawBlock(ctx, block, isDropCap)
      }
    } else if (page.kind === 'content') {
      for (const block of page.blocks) await drawBlock(ctx, block, false)
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

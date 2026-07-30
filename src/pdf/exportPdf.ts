import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

import type { ExportableLayout } from '@/store/exportStore'
import type { ContentBlock } from '@/types/content'
import type { ProjectSettings } from '@/types/project'
import { loadThemeFonts, pickFont, type ThemeFontSet } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { parseInlineRuns } from '@/pdf/htmlRuns'
import { wrapRuns, type WrappedLine } from '@/pdf/textWrap'
import { blobToPng } from '@/pdf/imageForPdf'
import { getAssetBlob } from '@/store/assetDb'
import { PX_PER_MM } from '@/renderer/pageGeometry'

/** CSS px (96dpi) → PDF points (72dpi). */
const PX_TO_PT = 72 / 96

interface DrawCtx {
  page: PDFPage
  fonts: ThemeFontSet
  theme: ExportableLayout['theme']
  contentX: number
  contentWidthPt: number
  cursorY: number
}

function drawWrappedLines(ctx: DrawCtx, lines: WrappedLine[], sizePt: number, lineHeightPt: number, color: ReturnType<typeof rgb>, regularFont: PDFFont, boldFont: PDFFont) {
  for (const line of lines) {
    ctx.cursorY -= lineHeightPt
    for (const fragment of line.fragments) {
      ctx.page.drawText(fragment.text, {
        x: ctx.contentX + fragment.x,
        y: ctx.cursorY,
        size: sizePt,
        font: fragment.bold ? boldFont : regularFont,
        color,
      })
    }
  }
}

async function drawBlock(ctx: DrawCtx, block: ContentBlock, dropCap: boolean) {
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink)
  const muted = hexToPdfColor(theme.page.mutedInk)
  const accent = hexToPdfColor(theme.page.accent)

  switch (block.type) {
    case 'heading': {
      ctx.cursorY -= 20
      const sizePt = (block.level === 2 ? theme.typography.bodySize * 1.5 : theme.typography.bodySize * 1.2) * PX_TO_PT
      const font = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
      const lines = wrapRuns([{ text: block.text, bold: false }], font, font, sizePt, ctx.contentWidthPt)
      drawWrappedLines(ctx, lines, sizePt, sizePt * 1.25, ink, font, font)
      ctx.cursorY -= 6
      break
    }
    case 'paragraph': {
      const sizePt = theme.typography.bodySize * PX_TO_PT
      const regularFont = pickFont(ctx.fonts, theme.fonts.body, 400)
      const boldFont = pickFont(ctx.fonts, theme.fonts.body, 700)
      const runs = parseInlineRuns(block.html)
      if (dropCap && runs.length > 0 && runs[0].text.length > 0) {
        // Faux drop cap: draw the first letter oversized, offset the rest of
        // the paragraph's first line to its right. Simplified vs. the CSS
        // ::first-letter float used on screen.
        const capLetter = runs[0].text[0]
        runs[0] = { ...runs[0], text: runs[0].text.slice(1) }
        const capSize = sizePt * 2.4
        ctx.page.drawText(capLetter, { x: ctx.contentX, y: ctx.cursorY - capSize * 0.78, size: capSize, font: boldFont, color: ink })
        const capWidth = boldFont.widthOfTextAtSize(capLetter, capSize) + 2
        const lines = wrapRuns(runs, regularFont, boldFont, sizePt, ctx.contentWidthPt - capWidth)
        // Shift every fragment right by capWidth for this block's lines.
        for (const line of lines) for (const f of line.fragments) f.x += capWidth
        drawWrappedLines(ctx, lines, sizePt, sizePt * theme.typography.lineHeight, ink, regularFont, boldFont)
      } else {
        const lines = wrapRuns(runs, regularFont, boldFont, sizePt, ctx.contentWidthPt)
        drawWrappedLines(ctx, lines, sizePt, sizePt * theme.typography.lineHeight, ink, regularFont, boldFont)
      }
      ctx.cursorY -= 4
      break
    }
    case 'quote': {
      const sizePt = theme.typography.bodySize * 1.05 * PX_TO_PT
      const font = pickFont(ctx.fonts, theme.fonts.heading, 400)
      ctx.cursorY -= 8
      const ruleTop = ctx.cursorY + sizePt
      const lines = wrapRuns([{ text: `“${block.text}”`, bold: false }], font, font, sizePt, ctx.contentWidthPt - 16)
      const startCtx = { ...ctx, contentX: ctx.contentX + 16 }
      drawWrappedLines(startCtx, lines, sizePt, sizePt * 1.5, accent, font, font)
      ctx.cursorY = startCtx.cursorY
      ctx.page.drawRectangle({ x: ctx.contentX, y: ctx.cursorY, width: 2, height: ruleTop - ctx.cursorY, color: hexToPdfColor(theme.page.ruleColor) })
      if (block.attribution) {
        ctx.cursorY -= 4
        const capSize = theme.typography.bodySize * 0.8 * PX_TO_PT
        ctx.page.drawText(`— ${block.attribution}`, { x: ctx.contentX + 16, y: ctx.cursorY - capSize, size: capSize, font: pickFont(ctx.fonts, theme.fonts.body, 400), color: muted })
        ctx.cursorY -= capSize + 4
      }
      ctx.cursorY -= 10
      break
    }
    case 'list': {
      const sizePt = theme.typography.bodySize * PX_TO_PT
      const font = pickFont(ctx.fonts, theme.fonts.body, 400)
      const indent = 16
      block.items.forEach((item, i) => {
        const prefix = block.ordered ? `${i + 1}.` : '•'
        const lines = wrapRuns([{ text: item, bold: false }], font, font, sizePt, ctx.contentWidthPt - indent)
        const startY = ctx.cursorY
        const shifted = { ...ctx, contentX: ctx.contentX + indent }
        drawWrappedLines(shifted, lines, sizePt, sizePt * theme.typography.lineHeight, ink, font, font)
        ctx.page.drawText(prefix, { x: ctx.contentX, y: startY - sizePt * theme.typography.lineHeight, size: sizePt, font, color: ink })
        ctx.cursorY = shifted.cursorY
      })
      ctx.cursorY -= 10
      break
    }
    case 'table': {
      const sizePt = theme.typography.bodySize * 0.85 * PX_TO_PT
      const font = pickFont(ctx.fonts, theme.fonts.body, 400)
      const boldFont = pickFont(ctx.fonts, theme.fonts.body, 600)
      const colWidth = ctx.contentWidthPt / Math.max(1, block.header.length)
      ctx.cursorY -= sizePt * 1.6
      block.header.forEach((cell, i) => {
        ctx.page.drawText(cell, { x: ctx.contentX + i * colWidth, y: ctx.cursorY, size: sizePt, font: boldFont, color: ink })
      })
      ctx.page.drawLine({ start: { x: ctx.contentX, y: ctx.cursorY - 4 }, end: { x: ctx.contentX + ctx.contentWidthPt, y: ctx.cursorY - 4 }, thickness: 0.75, color: hexToPdfColor(theme.page.ruleColor) })
      ctx.cursorY -= 10
      for (const row of block.rows) {
        row.forEach((cell, i) => {
          ctx.page.drawText(cell, { x: ctx.contentX + i * colWidth, y: ctx.cursorY, size: sizePt, font, color: ink })
        })
        ctx.cursorY -= sizePt * 1.6
      }
      ctx.cursorY -= 10
      break
    }
    case 'image': {
      const blob = await getAssetBlob(block.assetId)
      if (!blob) break
      const { bytes, width, height } = await blobToPng(blob, block.grayscale ?? false)
      const pdfImage = await ctx.page.doc.embedPng(bytes)
      // Priority order (matches BlockContent.tsx's on-screen logic so the
      // PDF stays WYSIWYG): explicit mm size, then the percent preset, then
      // full content width as the legacy default for blocks with neither
      // field. mm -> px via PX_PER_MM, then px -> pt via PX_TO_PT, so the
      // same physical size lands on screen and in the exported PDF.
      const displayWidth =
        block.widthMm != null ? block.widthMm * PX_PER_MM * PX_TO_PT
        : block.widthPercent != null ? ctx.contentWidthPt * (block.widthPercent / 100)
        : ctx.contentWidthPt
      const displayHeight = displayWidth * (height / width)
      const align = block.align ?? 'center'
      const imageX =
        align === 'left' ? ctx.contentX
        : align === 'right' ? ctx.contentX + (ctx.contentWidthPt - displayWidth)
        : ctx.contentX + (ctx.contentWidthPt - displayWidth) / 2
      ctx.cursorY -= displayHeight
      ctx.page.drawImage(pdfImage, { x: imageX, y: ctx.cursorY, width: displayWidth, height: displayHeight })
      if (block.caption) {
        ctx.cursorY -= 4
        const capSize = theme.typography.bodySize * 0.75 * PX_TO_PT
        ctx.cursorY -= capSize
        ctx.page.drawText(block.caption, { x: imageX, y: ctx.cursorY, size: capSize, font: pickFont(ctx.fonts, theme.fonts.body, 400), color: muted })
      }
      ctx.cursorY -= 10
      break
    }
    default:
      break
  }
}

function drawCropMarks(page: PDFPage, mediaWidth: number, mediaHeight: number, bleedPt: number) {
  if (bleedPt <= 0) return
  const markLength = 10
  const gap = 3
  const black = rgb(0, 0, 0)
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
export async function exportBookToPdf(layout: ExportableLayout, bookTitle: string, settings: ProjectSettings): Promise<Blob> {
  const { pageBox, theme, toc } = layout
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(bookTitle)
  doc.setProducer('Book Studio')
  doc.setCreator('Book Studio')

  const fonts = await loadThemeFonts(doc)

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
    pdfPage.drawRectangle({ x: 0, y: 0, width: mediaWidth, height: mediaHeight, color: hexToPdfColor(theme.page.background) })
    drawCropMarks(pdfPage, mediaWidth, mediaHeight, bleedPt)

    if (page.kind === 'blank') continue

    const isRight = page.side === 'right'
    const marginLeft = bleedPt + (isRight ? marginInnerPt : marginOuterPt)
    const contentTop = mediaHeight - bleedPt - marginTopPt
    const contentBottom = bleedPt + marginBottomPt

    const ctx: DrawCtx = { page: pdfPage, fonts, theme, contentX: marginLeft, contentWidthPt, cursorY: contentTop }

    if (page.kind === 'toc') {
      const headingFont = pickFont(fonts, theme.fonts.heading, 600)
      ctx.cursorY -= 32
      pdfPage.drawText('Contents', { x: ctx.contentX, y: ctx.cursorY, size: 24, font: headingFont, color: hexToPdfColor(theme.page.ink) })
      ctx.cursorY -= 40
      const bodyFont = pickFont(fonts, theme.fonts.body, 400)
      for (const entry of toc) {
        pdfPage.drawText(entry.title, { x: ctx.contentX, y: ctx.cursorY, size: 11, font: bodyFont, color: hexToPdfColor(theme.page.ink) })
        const numText = String(entry.pageNumber)
        const numWidth = bodyFont.widthOfTextAtSize(numText, 11)
        pdfPage.drawText(numText, { x: ctx.contentX + contentWidthPt - numWidth, y: ctx.cursorY, size: 11, font: bodyFont, color: hexToPdfColor(theme.page.mutedInk) })
        ctx.cursorY -= 22
      }
    } else if (page.kind === 'chapter-start') {
      ctx.cursorY -= theme.chapterOpener.topSpacer * PX_TO_PT
      if (theme.chapterOpener.numberLabel !== 'none') {
        const font = pickFont(fonts, theme.fonts.heading, 500)
        const idx = toc.findIndex((t) => t.chapterId === page.chapterId)
        const label = theme.chapterOpener.numberLabel === 'word' ? `Chapter ${idx + 1}` : `${idx + 1}`
        pdfPage.drawText(label, { x: ctx.contentX, y: ctx.cursorY, size: 11, font, color: hexToPdfColor(theme.page.accent) })
        ctx.cursorY -= 22
      }
      const titleFont = pickFont(fonts, theme.fonts.heading, theme.typography.headingWeight)
      pdfPage.drawText(page.chapterTitle ?? '', { x: ctx.contentX, y: ctx.cursorY, size: 30, font: titleFont, color: hexToPdfColor(theme.page.ink) })
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
    pdfPage.drawText(numText, { x: numX, y: bleedPt + marginBottomPt * 0.4, size: 9, font: numFont, color: hexToPdfColor(theme.page.mutedInk) })
  }

  const bytes = await doc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

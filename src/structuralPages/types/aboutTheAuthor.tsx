import { UserRound } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { StructuralImageDropZone } from '@/structuralPages/shared'
import { useAssetStore } from '@/store/assetStore'
import { getAssetBlob } from '@/store/assetDb'
import { blobToPng } from '@/pdf/imageForPdf'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { wrapRuns } from '@/pdf/textWrap'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { splitParagraphs } from '@/structuralPages/longForm'
import { cn } from '@/lib/utils'

const ABOUT_PLACEHOLDER = 'A short author biography goes here.'
const PHOTO_SIZE_EM = 7.5

/** Heading "About the Author" + bio paragraphs, plus an optional author
 * photo — reuses the exact same `imageAssetId` + `assetStore`/
 * `imageForPdf.ts` embedding pipeline `cover.tsx` already proved, just in a
 * small centred portrait rather than a full-bleed background. */
function AboutTheAuthorRender({ page, theme, selected, onSelect, onCommit }: StructuralPageRenderProps) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  if (page.type !== 'about-the-author') return null

  const imageUrl = page.content.imageAssetId ? getObjectUrl(page.content.imageAssetId) : undefined
  const paragraphs = splitParagraphs(page.content.text ?? '')

  return (
    <div
      onClick={onSelect}
      className={cn('relative flex h-full w-full cursor-pointer flex-col items-center gap-6 px-16 py-20', outlineClass(selected, false))}
      style={{ background: theme.page.background }}
    >
      {!imageUrl && (
        <StructuralImageDropZone
          hasImage={false}
          // audit-copy-ok: StructuralImageDropZone hides this label on touch
          label="Drop an author photo here"
          onDropAsset={(assetId) => onCommit({ imageAssetId: assetId })}
        />
      )}
      {imageUrl && (
        <div className="group/photo relative shrink-0" style={{ width: `${PHOTO_SIZE_EM}em`, height: `${PHOTO_SIZE_EM}em` }}>
          <img src={imageUrl} alt="" className="h-full w-full rounded-full object-cover" />
          <div className="absolute inset-0 overflow-hidden rounded-full opacity-0 transition-opacity group-hover/photo:opacity-100">
            <StructuralImageDropZone hasImage label="Replace photo" onDropAsset={(assetId) => onCommit({ imageAssetId: assetId })} />
          </div>
        </div>
      )}
      <h2
        style={{
          fontFamily: theme.fonts.heading,
          fontWeight: theme.typography.headingWeight,
          fontSize: '1.4em',
          color: theme.page.ink,
        }}
      >
        About the Author
      </h2>
      <div className="flex w-full flex-col gap-4">
        {(paragraphs.length > 0 ? paragraphs : [ABOUT_PLACEHOLDER]).map((paragraph, i) => (
          <p
            key={i}
            style={{
              fontFamily: theme.fonts.body,
              fontSize: '1em',
              lineHeight: theme.typography.lineHeight,
              color: theme.page.ink,
              whiteSpace: 'pre-wrap',
              textAlign: 'center',
            }}
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  )
}

async function drawAboutTheAuthorPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme) {
  if (page.type !== 'about-the-author') return

  const centerX = ctx.contentX + ctx.contentWidthPt / 2

  if (page.content.imageAssetId) {
    const blob = await getAssetBlob(page.content.imageAssetId)
    if (blob) {
      const { bytes, width, height } = await blobToPng(blob, false)
      const pdfImage = await ctx.page.doc.embedPng(bytes)
      const sizePt = theme.typography.bodySize * PHOTO_SIZE_EM * PX_TO_PT
      const scale = Math.max(sizePt / width, sizePt / height)
      const drawWidth = width * scale
      const drawHeight = height * scale
      ctx.cursorY -= sizePt
      ctx.page.drawImage(pdfImage, { x: centerX - drawWidth / 2, y: ctx.cursorY, width: drawWidth, height: drawHeight })
      ctx.cursorY -= sizePt * 0.5
    }
  }

  const headingFont = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const headingSize = theme.typography.bodySize * 1.4 * PX_TO_PT
  const heading = 'About the Author'
  const headingWidth = headingFont.widthOfTextAtSize(heading, headingSize)
  ctx.cursorY -= headingSize
  ctx.page.drawText(heading, { x: centerX - headingWidth / 2, y: ctx.cursorY, size: headingSize, font: headingFont, color: hexToPdfColor(theme.page.ink, ctx.colorMode) })
  ctx.cursorY -= headingSize * 1.1

  const bodyFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const bodySize = theme.typography.bodySize * PX_TO_PT
  const lineHeight = bodySize * theme.typography.lineHeight
  const ink = hexToPdfColor(theme.page.ink, ctx.colorMode)
  const paragraphs = splitParagraphs(page.content.text ?? '')
  for (const paragraph of paragraphs.length > 0 ? paragraphs : [ABOUT_PLACEHOLDER]) {
    const lines = wrapRuns([{ text: paragraph, bold: false }], bodyFont, bodyFont, bodySize, ctx.contentWidthPt)
    // Centre each wrapped line manually — `drawWrappedLines` is left-aligned
    // by default (matches every other structural-page/content-block PDF
    // drawer), so a short centred bio reuses the same wrap math but draws
    // each line's x offset itself rather than calling the shared helper.
    for (const line of lines) {
      ctx.cursorY -= lineHeight
      const lineWidth = line.fragments.reduce((w, f) => w + bodyFont.widthOfTextAtSize(f.text, bodySize), 0)
      let x = centerX - lineWidth / 2
      for (const fragment of line.fragments) {
        ctx.page.drawText(fragment.text, { x, y: ctx.cursorY, size: bodySize, font: bodyFont, color: ink })
        x += bodyFont.widthOfTextAtSize(fragment.text, bodySize)
      }
    }
    ctx.cursorY -= lineHeight * 0.6
  }
}

export const aboutTheAuthorPageType: StructuralPageTypeDefinition = {
  id: 'about-the-author',
  category: 'back-matter',
  label: 'About the Author',
  icon: UserRound,
  Render: AboutTheAuthorRender,
  drawPdf: drawAboutTheAuthorPdf,
  defaultContent: () => ({}),
}

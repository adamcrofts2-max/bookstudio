import { useState } from 'react'
import { Book } from 'lucide-react'
import { rgb } from 'pdf-lib'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { StructuralImageDropZone, CoverNudgeHandle } from '@/structuralPages/shared'
import { computeCoverLayoutScreenStyle, computeCoverLayoutCursorY, COVER_NUDGE_RANGE_PX } from '@/structuralPages/coverLayout'
import { splitParagraphs } from '@/structuralPages/longForm'
import { useAssetStore } from '@/store/assetStore'
import { getAssetBlob } from '@/store/assetDb'
import { blobToPng } from '@/pdf/imageForPdf'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { wrapRuns } from '@/pdf/textWrap'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { tintHex } from '@/structuralPages/colorUtils'
import { cn } from '@/lib/utils'

const BLURB_PLACEHOLDER =
  'Add back-cover copy — a short, compelling summary of this book that makes someone want to pick it up.'

/**
 * The book's last page: back-cover copy (a blurb/synopsis) plus an optional
 * short author-bio line, over a full-bleed image-or-tinted background —
 * same treatment as `cover.tsx`, but text-forward rather than title-forward
 * (the title/author already appear on the front cover). See
 * docs/ROADMAP.md Phase E and docs/STATUS.md's entry for why this exists —
 * there was previously no back-cover page type at all.
 */
function BackCoverRender({ page, theme, pageBox, selected, onSelect, onCommit }: StructuralPageRenderProps) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  // See `cover.tsx`'s identical field for why this stays local until
  // pointer-up.
  const [liveNudge, setLiveNudge] = useState<number | null>(null)
  if (page.type !== 'back-cover') return null

  const imageUrl = page.content.imageAssetId ? getObjectUrl(page.content.imageAssetId) : undefined
  const ink = imageUrl ? '#ffffff' : theme.page.ink
  const mutedInk = imageUrl ? 'rgba(255,255,255,0.85)' : theme.page.mutedInk
  const paragraphs = splitParagraphs(page.content.blurb ?? '')
  const committedNudge = page.content.verticalNudge ?? 0
  const effectiveNudge = liveNudge ?? committedNudge
  const layoutStyle = computeCoverLayoutScreenStyle(page.content.layout, pageBox, effectiveNudge)

  return (
    <div
      onClick={onSelect}
      className={cn('relative h-full w-full cursor-pointer overflow-hidden', outlineClass(selected, false))}
      style={{ background: imageUrl ? theme.page.background : tintHex(theme.page.accent, 0.92) }}
    >
      {imageUrl && (
        <>
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
        </>
      )}
      <StructuralImageDropZone
        hasImage={!!imageUrl}
        label="Drop a back-cover image here"
        onDropAsset={(assetId) => onCommit({ imageAssetId: assetId })}
      />
      <div
        className="absolute inset-0 flex flex-col gap-4 px-16 py-24"
        style={{
          justifyContent: layoutStyle.justifyContent,
          paddingTop: layoutStyle.paddingTop,
          paddingBottom: layoutStyle.paddingBottom,
          transform: `translateY(${layoutStyle.translateYPx}px)`,
        }}
      >
        {selected && (
          <CoverNudgeHandle
            value={committedNudge}
            onLiveChange={setLiveNudge}
            onCommitFinal={(value) => {
              setLiveNudge(null)
              onCommit({ verticalNudge: value })
            }}
          />
        )}
        {(paragraphs.length > 0 ? paragraphs : [BLURB_PLACEHOLDER]).map((paragraph, i) => (
          <p
            key={i}
            style={{
              fontFamily: theme.fonts.body,
              fontSize: '1.05em',
              lineHeight: theme.typography.lineHeight,
              color: ink,
              fontStyle: paragraphs.length > 0 ? 'normal' : 'italic',
            }}
          >
            {paragraph}
          </p>
        ))}
      </div>
      {(page.content.authorBio || !imageUrl) && (
        <div className="absolute inset-x-0 bottom-0 px-16 pb-14">
          <p style={{ fontFamily: theme.fonts.body, fontSize: '0.78em', color: mutedInk, fontStyle: 'italic' }}>
            {page.content.authorBio}
          </p>
        </div>
      )}
    </div>
  )
}

async function drawBackCoverPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme, pageBox: PageBox) {
  if (page.type !== 'back-cover') return

  const bleedPt = pageBox.bleedPx * PX_TO_PT
  const mediaWidthPt = pageBox.widthPx * PX_TO_PT + bleedPt * 2
  const mediaHeightPt = pageBox.heightPx * PX_TO_PT + bleedPt * 2

  let hasImage = false
  if (page.content.imageAssetId) {
    const blob = await getAssetBlob(page.content.imageAssetId)
    if (blob) {
      const { bytes, width, height } = await blobToPng(blob, false)
      const pdfImage = await ctx.page.doc.embedPng(bytes)
      const scale = Math.max(mediaWidthPt / width, mediaHeightPt / height)
      const drawWidth = width * scale
      const drawHeight = height * scale
      ctx.page.drawImage(pdfImage, {
        x: (mediaWidthPt - drawWidth) / 2,
        y: (mediaHeightPt - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      })
      ctx.page.drawRectangle({ x: 0, y: 0, width: mediaWidthPt, height: mediaHeightPt, color: rgb(0, 0, 0), opacity: 0.4 })
      hasImage = true
    }
  }
  if (!hasImage) {
    ctx.page.drawRectangle({
      x: 0,
      y: 0,
      width: mediaWidthPt,
      height: mediaHeightPt,
      color: hexToPdfColor(tintHex(theme.page.accent, 0.92)),
    })
  }

  const ink = hasImage ? rgb(1, 1, 1) : hexToPdfColor(theme.page.ink)
  const mutedInk = hasImage ? rgb(0.9, 0.9, 0.9) : hexToPdfColor(theme.page.mutedInk)

  const bodyFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const bodySize = theme.typography.bodySize * 1.05 * PX_TO_PT
  const lineHeight = bodySize * theme.typography.lineHeight
  const contentX = bleedPt + pageBox.marginOuterPx * PX_TO_PT
  const contentWidthPt = mediaWidthPt - contentX - bleedPt - pageBox.marginOuterPx * PX_TO_PT

  const paragraphs = splitParagraphs(page.content.blurb ?? '')
  const blockCount = paragraphs.length > 0 ? paragraphs.length : 1
  // 'centered' keeps the exact pre-existing formula (no regression for
  // every project created before this milestone, which all default to
  // 'centered'); 'top'/'bottom' reuse the same shared zone-padding anchor
  // `cover.tsx`'s title uses, treating the whole blurb block's estimated
  // height as `totalSpanPt` since (unlike the cover's title) there's no
  // single "first line size" distinct from the rest.
  const layout = page.content.layout
  const estimatedBlockHeightPt = blockCount * lineHeight
  const startCursorY =
    layout === 'top' || layout === 'bottom'
      ? computeCoverLayoutCursorY({
          layout,
          mediaHeightPt,
          topLineSizePt: lineHeight,
          totalSpanPt: estimatedBlockHeightPt - lineHeight,
          nudge: page.content.verticalNudge,
          pxToPt: PX_TO_PT,
        })
      : // Exact pre-existing formula (uses `paragraphs.length`, not
        // `blockCount`, so an empty blurb — 0 real paragraphs — still
        // centres at `mediaHeightPt / 2` exactly as before this milestone).
        mediaHeightPt / 2 + (paragraphs.length * lineHeight) / 2 + (page.content.verticalNudge ?? 0) * COVER_NUDGE_RANGE_PX * PX_TO_PT
  const drawCtx: DrawCtx = { ...ctx, contentX, contentWidthPt, cursorY: startCursorY }
  for (const paragraph of paragraphs.length > 0 ? paragraphs : [BLURB_PLACEHOLDER]) {
    const lines = wrapRuns([{ text: paragraph, bold: false }], bodyFont, bodyFont, bodySize, contentWidthPt)
    drawWrappedLines(drawCtx, lines, bodySize, lineHeight, ink, bodyFont, bodyFont)
    drawCtx.cursorY -= lineHeight * 0.5
  }

  if (page.content.authorBio) {
    const bioFont = pickFont(ctx.fonts, theme.fonts.body, 400)
    const bioSize = theme.typography.bodySize * 0.78 * PX_TO_PT
    const bioY = bleedPt + pageBox.marginBottomPx * PX_TO_PT + bioSize
    ctx.page.drawText(page.content.authorBio, { x: contentX, y: bioY, size: bioSize, font: bioFont, color: mutedInk })
  }
}

export const backCoverPageType: StructuralPageTypeDefinition = {
  id: 'back-cover',
  category: 'back-matter',
  label: 'Back Cover',
  icon: Book,
  Render: BackCoverRender,
  drawPdf: drawBackCoverPdf,
  defaultContent: () => ({}),
}

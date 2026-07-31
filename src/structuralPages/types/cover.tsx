import { useState } from 'react'
import { BookImage } from 'lucide-react'
import { rgb } from 'pdf-lib'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { EditableText, StructuralImageDropZone, CoverNudgeHandle } from '@/structuralPages/shared'
import { computeCoverLayoutScreenStyle, computeCoverLayoutCursorY } from '@/structuralPages/coverLayout'
import { useAssetStore } from '@/store/assetStore'
import { getAssetBlob } from '@/store/assetDb'
import { blobToPng } from '@/pdf/imageForPdf'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { tintHex } from '@/structuralPages/colorUtils'
import { cn } from '@/lib/utils'

/** Full-bleed cover: background image (if `content.imageAssetId` is set) or
 * a light tint of the theme's accent colour, with centred title/subtitle/
 * author on top — reflects the active theme automatically, no new theme
 * fields needed for this milestone. */
function CoverRender({ page, theme, pageBox, selected, onSelect, onCommit }: StructuralPageRenderProps) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  // Live-drag preview state — never persisted until the handle's pointer-up
  // fires `onCommit`, so undo history gets exactly one entry per drag
  // gesture. `null` while not dragging, meaning "use the page's committed
  // value" (see `liveNudge ?? page.content.verticalNudge`).
  const [liveNudge, setLiveNudge] = useState<number | null>(null)
  if (page.type !== 'cover') return null

  const imageUrl = page.content.imageAssetId ? getObjectUrl(page.content.imageAssetId) : undefined
  const ink = imageUrl ? '#ffffff' : theme.page.ink
  const mutedInk = imageUrl ? 'rgba(255,255,255,0.88)' : theme.page.mutedInk
  const accent = imageUrl ? 'rgba(255,255,255,0.82)' : theme.page.accent
  const committedNudge = page.content.verticalNudge ?? 0
  const effectiveNudge = liveNudge ?? committedNudge
  const layoutStyle = computeCoverLayoutScreenStyle(page.content.layout, pageBox, effectiveNudge)

  return (
    <div
      onClick={onSelect}
      className={cn('relative h-full w-full cursor-pointer overflow-hidden', outlineClass(selected, false))}
      style={{ background: imageUrl ? theme.page.background : tintHex(theme.page.accent, 0.85) }}
    >
      {imageUrl && (
        <>
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
        </>
      )}
      <StructuralImageDropZone
        hasImage={!!imageUrl}
        label="Drop a cover image here"
        onDropAsset={(assetId) => onCommit({ imageAssetId: assetId })}
      />
      <div
        className="absolute inset-0 flex flex-col items-center gap-5 text-center"
        style={{
          paddingLeft: pageBox.marginOuterPx,
          paddingRight: pageBox.marginOuterPx,
          paddingTop: layoutStyle.paddingTop,
          paddingBottom: layoutStyle.paddingBottom,
          justifyContent: layoutStyle.justifyContent,
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
        <EditableText
          as="h1"
          value={page.content.title ?? ''}
          placeholder="Untitled"
          onCommit={(value) => onCommit({ title: value || undefined })}
          style={{
            fontFamily: theme.fonts.heading,
            fontWeight: theme.typography.headingWeight,
            fontSize: '2.6em',
            lineHeight: 1.15,
            color: ink,
          }}
        />
        <EditableText
          value={page.content.subtitle ?? ''}
          placeholder="Add a subtitle…"
          onCommit={(value) => onCommit({ subtitle: value || undefined })}
          style={{ fontFamily: theme.fonts.body, fontSize: '1.15em', color: mutedInk }}
        />
        <EditableText
          value={page.content.author ?? ''}
          placeholder="Add an author name…"
          onCommit={(value) => onCommit({ author: value || undefined })}
          style={{
            fontFamily: theme.fonts.body,
            fontSize: '1em',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: accent,
          }}
        />
      </div>
    </div>
  )
}

async function drawCoverPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme, pageBox: PageBox) {
  if (page.type !== 'cover') return

  const bleedPt = pageBox.bleedPx * PX_TO_PT
  const mediaWidthPt = pageBox.widthPx * PX_TO_PT + bleedPt * 2
  const mediaHeightPt = pageBox.heightPx * PX_TO_PT + bleedPt * 2

  let hasImage = false
  if (page.content.imageAssetId) {
    const blob = await getAssetBlob(page.content.imageAssetId)
    if (blob) {
      const { bytes, width, height } = await blobToPng(blob, false)
      const pdfImage = await ctx.page.doc.embedPng(bytes)
      // Cover-fit: scale to fill the full bleed box, centred, may crop —
      // matches the on-screen `object-cover` treatment above.
      const scale = Math.max(mediaWidthPt / width, mediaHeightPt / height)
      const drawWidth = width * scale
      const drawHeight = height * scale
      ctx.page.drawImage(pdfImage, {
        x: (mediaWidthPt - drawWidth) / 2,
        y: (mediaHeightPt - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      })
      ctx.page.drawRectangle({ x: 0, y: 0, width: mediaWidthPt, height: mediaHeightPt, color: rgb(0, 0, 0), opacity: 0.35 })
      hasImage = true
    }
  }
  if (!hasImage) {
    ctx.page.drawRectangle({
      x: 0,
      y: 0,
      width: mediaWidthPt,
      height: mediaHeightPt,
      color: hexToPdfColor(tintHex(theme.page.accent, 0.85)),
    })
  }

  const ink = hasImage ? rgb(1, 1, 1) : hexToPdfColor(theme.page.ink)
  const mutedInk = hasImage ? rgb(0.92, 0.92, 0.92) : hexToPdfColor(theme.page.mutedInk)
  const accent = hasImage ? rgb(0.88, 0.88, 0.88) : hexToPdfColor(theme.page.accent)

  const titleFont = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const bodyFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const title = page.content.title || 'Untitled'
  const titleSize = theme.typography.bodySize * 2.2 * PX_TO_PT
  const titleWidth = titleFont.widthOfTextAtSize(title, titleSize)
  const centerX = mediaWidthPt / 2

  // Same vertical distance the subtitle/author gaps below actually use —
  // precomputed so `computeCoverLayoutCursorY`'s 'bottom' preset can anchor
  // the *last* line near the bottom margin rather than the title.
  let totalSpanPt = 0
  if (page.content.subtitle) totalSpanPt += titleSize * 1.5
  if (page.content.author) totalSpanPt += theme.typography.bodySize * 2.4 * PX_TO_PT

  let cursorY = computeCoverLayoutCursorY({
    layout: page.content.layout,
    mediaHeightPt,
    topLineSizePt: titleSize,
    totalSpanPt,
    nudge: page.content.verticalNudge,
    pxToPt: PX_TO_PT,
  })
  ctx.page.drawText(title, { x: centerX - titleWidth / 2, y: cursorY, size: titleSize, font: titleFont, color: ink })

  if (page.content.subtitle) {
    cursorY -= titleSize * 1.5
    const subSize = theme.typography.bodySize * 1.15 * PX_TO_PT
    const subWidth = bodyFont.widthOfTextAtSize(page.content.subtitle, subSize)
    ctx.page.drawText(page.content.subtitle, { x: centerX - subWidth / 2, y: cursorY, size: subSize, font: bodyFont, color: mutedInk })
  }

  if (page.content.author) {
    cursorY -= theme.typography.bodySize * 2.4 * PX_TO_PT
    const authorSize = theme.typography.bodySize * PX_TO_PT
    const authorWidth = bodyFont.widthOfTextAtSize(page.content.author, authorSize)
    ctx.page.drawText(page.content.author, { x: centerX - authorWidth / 2, y: cursorY, size: authorSize, font: bodyFont, color: accent })
  }
}

export const coverPageType: StructuralPageTypeDefinition = {
  id: 'cover',
  category: 'front-matter',
  label: 'Cover',
  icon: BookImage,
  Render: CoverRender,
  drawPdf: drawCoverPdf,
  defaultContent: () => ({}),
}

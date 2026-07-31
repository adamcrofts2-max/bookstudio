import { useState } from 'react'
import { Book } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import {
  StructuralImageDropZone,
  CoverNudgeHandle,
  CoverImageUploadButton,
  CoverFocalPointPicker,
  CoverSafeZoneGuide,
  FieldVisibilityToggle,
} from '@/structuralPages/shared'
import { computeCoverLayoutScreenStyle, computeCoverLayoutCursorY, COVER_NUDGE_RANGE_PX } from '@/structuralPages/coverLayout'
import { computeCoverImageScreenStyle, computeCoverImagePdfPlacement } from '@/structuralPages/coverImageFit'
import { computeCoverOverlayScreenStyle, drawCoverOverlayPdf } from '@/structuralPages/coverOverlay'
import {
  resolveCoverFontFamily,
  resolveCoverSizeScale,
  resolveCoverWeight,
  resolveCoverColor,
  resolveCoverSecondaryColor,
} from '@/structuralPages/coverTypography'
import { isFieldHidden, toggleHiddenField } from '@/structuralPages/coverVisibility'
import { splitParagraphs } from '@/structuralPages/longForm'
import { useAssetStore } from '@/store/assetStore'
import { useUiStore } from '@/store/uiStore'
import { getAssetBlob } from '@/store/assetDb'
import { blobToPng } from '@/pdf/imageForPdf'
import { pickFont, pickItalicFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { wrapRuns } from '@/pdf/textWrap'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { tintHex } from '@/structuralPages/colorUtils'
import { cn } from '@/lib/utils'

const BLURB_PLACEHOLDER =
  'Add back-cover copy — a short, compelling summary of this book that makes someone want to pick it up.'

/** Back Cover's own pre-existing fixed overlay opacity — deliberately not
 * `coverOverlay.ts`'s exported `DEFAULT_OVERLAY_OPACITY` (that's Cover's
 * `0.35`); this page always used `0.4`. See that module's doc comment. */
const BACK_COVER_DEFAULT_OVERLAY_OPACITY = 0.4

/**
 * The book's last page: back-cover copy (a blurb/synopsis) plus an optional
 * short author-bio line, over a full-bleed image-or-tinted background —
 * same treatment as `cover.tsx`, but text-forward rather than title-forward
 * (the title/author already appear on the front cover). See
 * docs/ROADMAP.md Phase E and docs/STATUS.md's entry for why this exists —
 * there was previously no back-cover page type at all.
 */
function BackCoverRender({ page, theme, pageBox, projectId, selected, onSelect, onCommit }: StructuralPageRenderProps) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  const showSafeZone = useUiStore((s) => s.showCoverSafeZone)
  // See `cover.tsx`'s identical field for why this stays local until
  // pointer-up.
  const [liveNudge, setLiveNudge] = useState<number | null>(null)
  if (page.type !== 'back-cover') return null

  const imageUrl = page.content.imageAssetId ? getObjectUrl(page.content.imageAssetId) : undefined
  const paragraphs = splitParagraphs(page.content.blurb ?? '')
  const committedNudge = page.content.verticalNudge ?? 0
  const effectiveNudge = liveNudge ?? committedNudge
  const layoutStyle = computeCoverLayoutScreenStyle(page.content.layout, pageBox, effectiveNudge)
  const imageStyle = computeCoverImageScreenStyle(page.content.imageFocalPoint, page.content.imageZoom)
  const overlayStyle = computeCoverOverlayScreenStyle(page.content.overlayStyle, page.content.overlayOpacity ?? BACK_COVER_DEFAULT_OVERLAY_OPACITY)
  const typography = page.content.typography
  const blurbFontFamily = resolveCoverFontFamily(typography, theme.fonts.body)
  const blurbWeight = resolveCoverWeight(typography, 400)
  const blurbSizeScale = resolveCoverSizeScale(typography)
  // Same override-wins, else-automatic rule as `cover.tsx` — Phase 49.
  const ink = resolveCoverColor(typography, imageUrl ? '#ffffff' : theme.page.ink)
  const mutedInk = resolveCoverSecondaryColor(typography, imageUrl ? 'rgba(255,255,255,0.85)' : theme.page.mutedInk)
  const hiddenFields = page.content.hiddenFields
  const blurbHidden = isFieldHidden(hiddenFields, 'blurb')
  const authorBioHidden = isFieldHidden(hiddenFields, 'authorBio')

  return (
    <div
      onClick={onSelect}
      className={cn('relative h-full w-full cursor-pointer overflow-hidden', outlineClass(selected, false))}
      style={{ background: imageUrl ? theme.page.background : tintHex(theme.page.accent, 0.92) }}
    >
      {imageUrl && (
        <>
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: 'cover', ...imageStyle }}
          />
          {overlayStyle && <div className="absolute inset-0" style={overlayStyle} />}
        </>
      )}
      {selected && imageUrl && (
        <CoverFocalPointPicker
          focalPoint={page.content.imageFocalPoint}
          onChange={(point) => onCommit({ imageFocalPoint: point })}
        />
      )}
      <StructuralImageDropZone
        hasImage={!!imageUrl}
        label="Drop a back-cover image here"
        onDropAsset={(assetId) => onCommit({ imageAssetId: assetId })}
      />
      {selected && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <CoverImageUploadButton
            projectId={projectId}
            label={imageUrl ? 'Change image' : 'Add back-cover image'}
            onUploaded={(assetId) => onCommit({ imageAssetId: assetId })}
          />
        </div>
      )}
      {showSafeZone && <CoverSafeZoneGuide pageBox={pageBox} />}
      {!(blurbHidden && !selected) && (
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
            <div className="mx-auto flex items-center gap-2">
              <FieldVisibilityToggle
                hidden={blurbHidden}
                label="Back-cover copy"
                onToggle={() => onCommit({ hiddenFields: toggleHiddenField(hiddenFields, 'blurb') })}
              />
              {!blurbHidden && (
                <CoverNudgeHandle
                  value={committedNudge}
                  onLiveChange={setLiveNudge}
                  onCommitFinal={(value) => {
                    setLiveNudge(null)
                    onCommit({ verticalNudge: value })
                  }}
                />
              )}
            </div>
          )}
          {(paragraphs.length > 0 ? paragraphs : [BLURB_PLACEHOLDER]).map((paragraph, i) => (
            <p
              key={i}
              style={{
                fontFamily: blurbFontFamily,
                fontWeight: blurbWeight,
                fontSize: `${1.05 * blurbSizeScale}em`,
                lineHeight: theme.typography.lineHeight,
                color: ink,
                fontStyle: blurbHidden ? 'italic' : paragraphs.length > 0 ? (typography?.italic ? 'italic' : 'normal') : 'italic',
                opacity: blurbHidden ? 0.45 : 1,
              }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      )}
      {(page.content.authorBio || !imageUrl) && !(authorBioHidden && !selected) && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-16 pb-14">
          {selected && (
            <FieldVisibilityToggle
              hidden={authorBioHidden}
              label="Author bio"
              onToggle={() => onCommit({ hiddenFields: toggleHiddenField(hiddenFields, 'authorBio') })}
            />
          )}
          <p
            style={{
              fontFamily: theme.fonts.body,
              fontSize: '0.78em',
              color: mutedInk,
              fontStyle: 'italic',
              opacity: authorBioHidden ? 0.45 : 1,
            }}
          >
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
      const placement = computeCoverImagePdfPlacement({
        mediaWidthPt,
        mediaHeightPt,
        imageWidth: width,
        imageHeight: height,
        focalPoint: page.content.imageFocalPoint,
        zoom: page.content.imageZoom,
      })
      ctx.page.drawImage(pdfImage, placement)
      drawCoverOverlayPdf(
        ctx.page,
        page.content.overlayStyle,
        page.content.overlayOpacity ?? BACK_COVER_DEFAULT_OVERLAY_OPACITY,
        mediaWidthPt,
        mediaHeightPt,
      )
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

  const typography = page.content.typography
  // Same override-wins, else-automatic rule as `cover.tsx` — Phase 49.
  const ink = hexToPdfColor(resolveCoverColor(typography, hasImage ? '#ffffff' : theme.page.ink))
  const mutedInk = hexToPdfColor(resolveCoverSecondaryColor(typography, hasImage ? '#e6e6e6' : theme.page.mutedInk))
  const hiddenFields = page.content.hiddenFields
  const blurbHidden = isFieldHidden(hiddenFields, 'blurb')
  const authorBioHidden = isFieldHidden(hiddenFields, 'authorBio')

  const blurbFontFamily = resolveCoverFontFamily(typography, theme.fonts.body)
  const blurbWeight = resolveCoverWeight(typography, 400)
  const blurbSizeScale = resolveCoverSizeScale(typography)
  const bodyFont = typography?.italic
    ? pickItalicFont(ctx.fonts, blurbFontFamily, blurbWeight)
    : pickFont(ctx.fonts, blurbFontFamily, blurbWeight)
  const bodySize = theme.typography.bodySize * 1.05 * blurbSizeScale * PX_TO_PT
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
  // No `BLURB_PLACEHOLDER` fallback here (fixed Phase 49) — same reasoning
  // as `cover.tsx`'s title fix: that placeholder is an on-screen-only
  // editing cue, never something a real export should print literally.
  if (!blurbHidden && paragraphs.length > 0) {
    const drawCtx: DrawCtx = { ...ctx, contentX, contentWidthPt, cursorY: startCursorY }
    for (const paragraph of paragraphs) {
      const lines = wrapRuns([{ text: paragraph, bold: false }], bodyFont, bodyFont, bodySize, contentWidthPt)
      drawWrappedLines(drawCtx, lines, bodySize, lineHeight, ink, bodyFont, bodyFont)
      drawCtx.cursorY -= lineHeight * 0.5
    }
  }

  if (page.content.authorBio && !authorBioHidden) {
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

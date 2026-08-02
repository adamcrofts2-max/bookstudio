import { useRef, useState } from 'react'
import { BookImage } from 'lucide-react'

import type { StructuralPage, CoverFieldPosition } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import {
  HideableTextField,
  StructuralImageDropZone,
  CoverNudgeHandle,
  CoverImageUploadButton,
  CoverFocalPointPicker,
  CoverSafeZoneGuide,
  DraggableCoverField,
  ResetFieldPositionButton,
} from '@/structuralPages/shared'
import { computeCoverLayoutScreenStyle, computeCoverLayoutCursorY, COVER_NUDGE_RANGE_PX } from '@/structuralPages/coverLayout'
import { computeCoverImageScreenStyle, computeCoverImagePdfPlacement } from '@/structuralPages/coverImageFit'
import { computeCoverOverlayScreenStyle, drawCoverOverlayPdf, DEFAULT_OVERLAY_OPACITY } from '@/structuralPages/coverOverlay'
import {
  resolveCoverFontFamily,
  resolveCoverSizeScale,
  resolveCoverWeight,
  resolveCoverColor,
  resolveCoverSecondaryColor,
} from '@/structuralPages/coverTypography'
import { isFieldHidden, toggleHiddenField } from '@/structuralPages/coverVisibility'
import { CoverElementLayer } from '@/structuralPages/coverElementLayer'
import { CoverElementToolbar } from '@/structuralPages/coverElementToolbar'
import { drawCoverElementsPdf } from '@/structuralPages/coverElements'
import { useAssetStore } from '@/store/assetStore'
import { useUiStore } from '@/store/uiStore'
import { useSelectionStore } from '@/store/selectionStore'
import { getAssetBlob } from '@/store/assetDb'
import { blobToPng } from '@/pdf/imageForPdf'
import { pickFont, pickItalicFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { tintHex } from '@/structuralPages/colorUtils'
import { cn } from '@/lib/utils'

/** Full-bleed cover: background image (if `content.imageAssetId` is set) or
 * a light tint of the theme's accent colour, with title/subtitle/author on
 * top. Font, size, overlay and image crop can all be overridden per-cover
 * (see `types/structuralPage.ts`'s `CoverTypographyOverride`/
 * `CoverOverlayStyle`/`CoverImageFocalPoint`) — absent means every value
 * reproduces this milestone's pre-existing fixed look exactly, so no
 * project made before Phase 46 changes. */
function CoverRender({ page, theme, pageBox, projectId, selected, onSelect, onCommit }: StructuralPageRenderProps) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  const showSafeZone = useUiStore((s) => s.showCoverSafeZone)
  const selectedElementId = useSelectionStore((s) => s.selectedCoverElementId)
  const selectCoverElement = useSelectionStore((s) => s.selectCoverElement)
  // Live-drag preview state — never persisted until the handle's pointer-up
  // fires `onCommit`, so undo history gets exactly one entry per drag
  // gesture. `null` while not dragging, meaning "use the page's committed
  // value" (see `liveNudge ?? page.content.verticalNudge`).
  const [liveNudge, setLiveNudge] = useState<number | null>(null)
  const [liveHNudge, setLiveHNudge] = useState<number | null>(null)
  // Live-drag preview for each independently-positioned field — same
  // null-means-"not dragging" convention as `liveNudge` above, one per field
  // since title/subtitle/author can each be mid-drag independently (though
  // never simultaneously, since a pointer only drives one gesture at a time).
  const [liveTitlePos, setLiveTitlePos] = useState<CoverFieldPosition | null>(null)
  const [liveSubtitlePos, setLiveSubtitlePos] = useState<CoverFieldPosition | null>(null)
  const [liveAuthorPos, setLiveAuthorPos] = useState<CoverFieldPosition | null>(null)
  // `DraggableCoverField`'s 0..1 fraction space is measured against this
  // page's own root element — same "page box" every other cover drag
  // control (`CoverElementLayer`, `CoverFocalPointPicker`) already uses.
  const rootRef = useRef<HTMLDivElement>(null)
  if (page.type !== 'cover') return null

  const imageUrl = page.content.imageAssetId ? getObjectUrl(page.content.imageAssetId) : undefined
  const committedNudge = page.content.verticalNudge ?? 0
  const committedHNudge = page.content.horizontalNudge ?? 0
  const effectiveNudge = liveNudge ?? committedNudge
  const effectiveHNudge = liveHNudge ?? committedHNudge
  const effectiveTitlePos = liveTitlePos ?? page.content.titlePosition
  const effectiveSubtitlePos = liveSubtitlePos ?? page.content.subtitlePosition
  const effectiveAuthorPos = liveAuthorPos ?? page.content.authorPosition
  const layoutStyle = computeCoverLayoutScreenStyle(page.content.layout, pageBox, effectiveNudge, effectiveHNudge)
  const imageStyle = computeCoverImageScreenStyle(page.content.imageFocalPoint, page.content.imageZoom)
  const overlayStyle = computeCoverOverlayScreenStyle(page.content.overlayStyle, page.content.overlayOpacity ?? DEFAULT_OVERLAY_OPACITY)
  const typography = page.content.typography
  const titleFontFamily = resolveCoverFontFamily(typography, theme.fonts.heading)
  const titleWeight = resolveCoverWeight(typography, theme.typography.headingWeight)
  const titleSizeScale = resolveCoverSizeScale(typography)
  // Colour: an explicit override always wins; absent falls back to the
  // pre-existing automatic rule (white on a photo, theme colours
  // otherwise) exactly as before Phase 49.
  const ink = resolveCoverColor(typography, imageUrl ? '#ffffff' : theme.page.ink)
  const mutedInk = resolveCoverSecondaryColor(typography, imageUrl ? 'rgba(255,255,255,0.88)' : theme.page.mutedInk)
  const accent = resolveCoverSecondaryColor(typography, imageUrl ? 'rgba(255,255,255,0.82)' : theme.page.accent)
  const hiddenFields = page.content.hiddenFields
  const titleHidden = isFieldHidden(hiddenFields, 'title')
  const subtitleHidden = isFieldHidden(hiddenFields, 'subtitle')
  const authorHidden = isFieldHidden(hiddenFields, 'author')

  return (
    <div
      ref={rootRef}
      onClick={onSelect}
      className={cn('relative h-full w-full cursor-pointer overflow-hidden', outlineClass(selected, false))}
      style={{ background: imageUrl ? theme.page.background : tintHex(theme.page.accent, 0.85) }}
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
        label="Drop a cover image here"
        onDropAsset={(assetId) => onCommit({ imageAssetId: assetId })}
      />
      {selected && (
        // z-20 (not z-10, matching `CoverElementLayer`'s container below) —
        // deliberately above every content element, not just even with
        // them: this is persistent toolbar chrome, not canvas content, and
        // used to be blocked by an element dragged on top of it (same
        // z-index, later in DOM order wins) before this fix. See
        // docs/STATUS.md's entry for this phase.
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">
          <CoverImageUploadButton
            projectId={projectId}
            label={imageUrl ? 'Change image' : 'Add cover image'}
            onUploaded={(assetId) => onCommit({ imageAssetId: assetId })}
          />
        </div>
      )}
      {selected && (
        <div className="absolute right-4 top-4 z-20">
          <CoverElementToolbar
            elements={page.content.elements}
            onAdd={(elements, newId) => {
              onCommit({ elements })
              selectCoverElement(newId)
            }}
          />
        </div>
      )}
      {showSafeZone && <CoverSafeZoneGuide pageBox={pageBox} />}
      {/* Free-form shapes/text (docs/COVER_CANVAS_PLAN.md) — above the
       * background image/overlay, below the title/subtitle/author block
       * below, matching every existing cover element's stacking order. */}
      <CoverElementLayer
        elements={page.content.elements}
        theme={theme}
        pageBox={pageBox}
        pageSelected={selected}
        selectedElementId={selectedElementId}
        onSelectElement={selectCoverElement}
        onCommitElements={(elements) => onCommit({ elements })}
      />
      {/* `pointer-events-none` (its empty flex space used to swallow clicks
       * across the ENTIRE page — this div is `absolute inset-0`, and a plain
       * div's hit-test area is its full box regardless of how little content
       * actually renders inside it — meaning "Drop a cover image here" and
       * the focal-point picker were unreachable underneath it whenever no
       * image/no elements were blocking IT in turn. Each interactive child
       * below opts back in with its own `pointer-events-auto`, same
       * click-through-container pattern `CoverElementLayer` already uses.
       * See docs/STATUS.md's entry for this phase. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center gap-5 text-center"
        style={{
          paddingLeft: pageBox.marginOuterPx,
          paddingRight: pageBox.marginOuterPx,
          paddingTop: layoutStyle.paddingTop,
          paddingBottom: layoutStyle.paddingBottom,
          justifyContent: layoutStyle.justifyContent,
          transform: `translate(${layoutStyle.translateXPx}px, ${layoutStyle.translateYPx}px)`,
        }}
      >
        {selected && (
          <div className="pointer-events-auto">
            <CoverNudgeHandle
              value={committedNudge}
              onLiveChange={setLiveNudge}
              onCommitFinal={(value) => {
                setLiveNudge(null)
                onCommit({ verticalNudge: value })
              }}
              horizontal={{
                value: committedHNudge,
                onLiveChange: setLiveHNudge,
                onCommitFinal: (value) => {
                  setLiveHNudge(null)
                  onCommit({ horizontalNudge: value })
                },
              }}
            />
          </div>
        )}
        <DraggableCoverField
          position={effectiveTitlePos}
          onLiveMove={setLiveTitlePos}
          onCommitMove={(pos) => onCommit({ titlePosition: pos })}
          containerRef={rootRef}
          pageSelected={selected}
        >
          <div className="flex flex-col items-center gap-1">
            <HideableTextField
              as="h1"
              value={page.content.title ?? ''}
              placeholder="Untitled"
              onCommit={(value) => onCommit({ title: value || undefined })}
              hidden={titleHidden}
              selected={selected}
              fieldLabel="Title"
              onToggleHidden={() => onCommit({ hiddenFields: toggleHiddenField(hiddenFields, 'title') })}
              style={{
                fontFamily: titleFontFamily,
                fontWeight: titleWeight,
                fontStyle: typography?.italic ? 'italic' : 'normal',
                fontSize: `${2.6 * titleSizeScale}em`,
                lineHeight: 1.15,
                color: ink,
              }}
            />
            {selected && page.content.titlePosition && (
              <div onPointerDown={(e) => e.stopPropagation()}>
                <ResetFieldPositionButton onReset={() => onCommit({ titlePosition: undefined })} />
              </div>
            )}
          </div>
        </DraggableCoverField>
        <DraggableCoverField
          position={effectiveSubtitlePos}
          onLiveMove={setLiveSubtitlePos}
          onCommitMove={(pos) => onCommit({ subtitlePosition: pos })}
          containerRef={rootRef}
          pageSelected={selected}
        >
          <div className="flex flex-col items-center gap-1">
            <HideableTextField
              value={page.content.subtitle ?? ''}
              placeholder="Add a subtitle…"
              onCommit={(value) => onCommit({ subtitle: value || undefined })}
              hidden={subtitleHidden}
              selected={selected}
              fieldLabel="Subtitle"
              onToggleHidden={() => onCommit({ hiddenFields: toggleHiddenField(hiddenFields, 'subtitle') })}
              style={{ fontFamily: theme.fonts.body, fontSize: '1.15em', color: mutedInk }}
            />
            {selected && page.content.subtitlePosition && (
              <div onPointerDown={(e) => e.stopPropagation()}>
                <ResetFieldPositionButton onReset={() => onCommit({ subtitlePosition: undefined })} />
              </div>
            )}
          </div>
        </DraggableCoverField>
        <DraggableCoverField
          position={effectiveAuthorPos}
          onLiveMove={setLiveAuthorPos}
          onCommitMove={(pos) => onCommit({ authorPosition: pos })}
          containerRef={rootRef}
          pageSelected={selected}
        >
          <div className="flex flex-col items-center gap-1">
            <HideableTextField
              value={page.content.author ?? ''}
              placeholder="Add an author name…"
              onCommit={(value) => onCommit({ author: value || undefined })}
              hidden={authorHidden}
              selected={selected}
              fieldLabel="Author"
              onToggleHidden={() => onCommit({ hiddenFields: toggleHiddenField(hiddenFields, 'author') })}
              style={{
                fontFamily: theme.fonts.body,
                fontSize: '1em',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: accent,
              }}
            />
            {selected && page.content.authorPosition && (
              <div onPointerDown={(e) => e.stopPropagation()}>
                <ResetFieldPositionButton onReset={() => onCommit({ authorPosition: undefined })} />
              </div>
            )}
          </div>
        </DraggableCoverField>
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
      // Cover-fit + focal point + zoom: matches the on-screen `object-fit:
      // cover` + `object-position` + `scale()` treatment above exactly —
      // see `coverImageFit.ts`'s doc comment for the shared formula.
      const placement = computeCoverImagePdfPlacement({
        mediaWidthPt,
        mediaHeightPt,
        imageWidth: width,
        imageHeight: height,
        focalPoint: page.content.imageFocalPoint,
        zoom: page.content.imageZoom,
      })
      ctx.page.drawImage(pdfImage, placement)
      drawCoverOverlayPdf(ctx.page, page.content.overlayStyle, page.content.overlayOpacity ?? DEFAULT_OVERLAY_OPACITY, mediaWidthPt, mediaHeightPt)
      hasImage = true
    }
  }
  if (!hasImage) {
    ctx.page.drawRectangle({
      x: 0,
      y: 0,
      width: mediaWidthPt,
      height: mediaHeightPt,
      color: hexToPdfColor(tintHex(theme.page.accent, 0.85), ctx.colorMode),
    })
  }

  // Free-form shapes/text — above the background/overlay, below the title
  // block drawn below, matching the on-screen `CoverElementLayer`'s
  // stacking order. Trim-box points (not the bleed-extended media box) are
  // what `CoverElement.x/y/width/height`'s normalised 0..1 fractions are
  // relative to.
  const trimWidthPt = pageBox.widthPx * PX_TO_PT
  const trimHeightPt = pageBox.heightPx * PX_TO_PT
  await drawCoverElementsPdf(ctx, page.content.elements, bleedPt, trimWidthPt, trimHeightPt)

  const typography = page.content.typography
  // Same override-wins, else-automatic rule as the on-screen renderer —
  // see `cover.tsx`'s `CoverRender` for the shared reasoning. The
  // automatic fallbacks below are solid-colour hex approximations of the
  // screen version's translucent whites (PDF text has no alpha blending
  // here), matching the pre-existing `rgb(0.92,0.92,0.92)`/
  // `rgb(0.88,0.88,0.88)` values exactly when nothing is overridden.
  const ink = hexToPdfColor(resolveCoverColor(typography, hasImage ? '#ffffff' : theme.page.ink), ctx.colorMode)
  const mutedInk = hexToPdfColor(resolveCoverSecondaryColor(typography, hasImage ? '#ebebeb' : theme.page.mutedInk), ctx.colorMode)
  const accent = hexToPdfColor(resolveCoverSecondaryColor(typography, hasImage ? '#e0e0e0' : theme.page.accent), ctx.colorMode)
  const hiddenFields = page.content.hiddenFields
  const titleHidden = isFieldHidden(hiddenFields, 'title')
  // "Skip drawing" also covers a field that's simply empty — not the same
  // concept as `isFieldHidden` (an explicit user choice), but the two are
  // only ever consumed together below (skip the draw call, don't reserve
  // layout space for it), so one combined name keeps the draw logic and
  // the space-reservation logic below from being able to disagree.
  const skipSubtitle = isFieldHidden(hiddenFields, 'subtitle') || !page.content.subtitle
  const skipAuthor = isFieldHidden(hiddenFields, 'author') || !page.content.author

  const titleFontFamily = resolveCoverFontFamily(typography, theme.fonts.heading)
  const titleWeight = resolveCoverWeight(typography, theme.typography.headingWeight)
  const titleSizeScale = resolveCoverSizeScale(typography)
  const titleFont = typography?.italic
    ? pickItalicFont(ctx.fonts, titleFontFamily, titleWeight)
    : pickFont(ctx.fonts, titleFontFamily, titleWeight)
  const bodyFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  // No "Untitled" fallback here (fixed Phase 49) — that placeholder is an
  // on-screen-only editing cue (see `EditableText`'s own `placeholder`
  // prop); a real export must never print literal placeholder text for a
  // field the author left blank on purpose (e.g. a deliberately photo-only
  // cover).
  const title = titleHidden ? '' : (page.content.title ?? '').trim()
  const titleSize = theme.typography.bodySize * 2.2 * titleSizeScale * PX_TO_PT
  const titleWidth = title ? titleFont.widthOfTextAtSize(title, titleSize) : 0
  // Matches the on-screen `translateX` exactly — same `COVER_NUDGE_RANGE_PX`
  // constant converted through `PX_TO_PT`, the same pattern
  // `computeCoverLayoutCursorY` already uses for the vertical nudge below.
  const centerX = mediaWidthPt / 2 + (page.content.horizontalNudge ?? 0) * COVER_NUDGE_RANGE_PX * PX_TO_PT

  // Same vertical distance the subtitle/author gaps below actually use —
  // precomputed so `computeCoverLayoutCursorY`'s 'bottom' preset can anchor
  // the *last* line near the bottom margin rather than the title. A hidden
  // field reserves no space, same as one that was never filled in.
  let totalSpanPt = 0
  if (!skipSubtitle) totalSpanPt += titleSize * 1.5
  if (!skipAuthor) totalSpanPt += theme.typography.bodySize * 2.4 * PX_TO_PT

  let cursorY = computeCoverLayoutCursorY({
    layout: page.content.layout,
    mediaHeightPt,
    topLineSizePt: titleSize,
    totalSpanPt,
    nudge: page.content.verticalNudge,
    pxToPt: PX_TO_PT,
  })
  // Independently-positioned fields (`title/subtitle/authorPosition`) draw
  // at their own absolute point instead of the shared `cursorY`/`centerX`
  // waterfall — matches the on-screen `DraggableCoverField`'s anchor
  // exactly: the fraction is relative to the TRIM box (not the bleed-
  // extended media box), offset by `bleedPt`, same convention
  // `drawCoverElementsPdf` already uses for every `CoverElement`, and the Y
  // fraction is flipped since PDF points grow upward while the fraction is
  // top-down like CSS. A detached field still "uses up" its slot in the
  // cursorY waterfall below (deliberately not recomputed away) — the worst
  // case is a harmless gap where it used to sit, not a bug worth the extra
  // complexity of re-flowing the remaining fields.
  function fieldPdfXY(pos: CoverFieldPosition): { x: number; y: number } {
    return { x: bleedPt + pos.x * trimWidthPt, y: bleedPt + trimHeightPt - pos.y * trimHeightPt }
  }

  if (title) {
    if (page.content.titlePosition) {
      const { x, y } = fieldPdfXY(page.content.titlePosition)
      ctx.page.drawText(title, { x: x - titleWidth / 2, y: y - titleSize * 0.35, size: titleSize, font: titleFont, color: ink })
    } else {
      ctx.page.drawText(title, { x: centerX - titleWidth / 2, y: cursorY, size: titleSize, font: titleFont, color: ink })
    }
  }

  if (!skipSubtitle && page.content.subtitle) {
    cursorY -= titleSize * 1.5
    const subSize = theme.typography.bodySize * 1.15 * PX_TO_PT
    const subWidth = bodyFont.widthOfTextAtSize(page.content.subtitle, subSize)
    if (page.content.subtitlePosition) {
      const { x, y } = fieldPdfXY(page.content.subtitlePosition)
      ctx.page.drawText(page.content.subtitle, { x: x - subWidth / 2, y: y - subSize * 0.35, size: subSize, font: bodyFont, color: mutedInk })
    } else {
      ctx.page.drawText(page.content.subtitle, { x: centerX - subWidth / 2, y: cursorY, size: subSize, font: bodyFont, color: mutedInk })
    }
  }

  if (!skipAuthor && page.content.author) {
    cursorY -= theme.typography.bodySize * 2.4 * PX_TO_PT
    const authorSize = theme.typography.bodySize * PX_TO_PT
    const authorWidth = bodyFont.widthOfTextAtSize(page.content.author, authorSize)
    if (page.content.authorPosition) {
      const { x, y } = fieldPdfXY(page.content.authorPosition)
      ctx.page.drawText(page.content.author, { x: x - authorWidth / 2, y: y - authorSize * 0.35, size: authorSize, font: bodyFont, color: accent })
    } else {
      ctx.page.drawText(page.content.author, { x: centerX - authorWidth / 2, y: cursorY, size: authorSize, font: bodyFont, color: accent })
    }
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

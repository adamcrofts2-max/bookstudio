import { useEffect, useState } from 'react'
import { degrees } from 'pdf-lib'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { imageAlignClass, outlineClass } from '@/blocks/shared'
import { useAssetStore } from '@/store/assetStore'
import { useDragStore } from '@/store/dragStore'
import { ASSET_DRAG_MIME } from '@/layout/dragTypes'
import { PX_PER_MM } from '@/renderer/pageGeometry'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { getAssetBlob } from '@/store/assetDb'
import { blobToPng } from '@/pdf/imageForPdf'
import { cn } from '@/lib/utils'

function ImageRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, onCommit, autoEdit, editable, onAutoEditHandled } = props
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  const draggingAssetId = useDragStore((s) => s.draggingAssetId)
  const [isImageDropTarget, setIsImageDropTarget] = useState(false)

  // See list.tsx's comment: the old unconditional autoEdit effect never
  // actually entered edit mode for image blocks (no `primary` field was
  // rendered), only fired `onAutoEditHandled` — reproduced here verbatim.
  useEffect(() => {
    if (autoEdit && editable) {
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'image') return null

  const wrapperClass = cn('outline-offset-4 transition-[outline-color] duration-150', outlineClass(!!selected, false))

  const url = getObjectUrl(block.assetId)
  // Optional field — manuscripts persisted before `widthPercent` existed
  // don't have it; always default to 100 here rather than migrating.
  const widthPercent = block.widthPercent ?? 100
  // `widthMm` (set via ImagePanel's "Custom" size option) takes
  // precedence over `widthPercent` when present — same PX_PER_MM
  // constant used everywhere else mm needs converting to on-screen px.
  const widthStyle = block.widthMm != null ? `${block.widthMm * PX_PER_MM}px` : `${widthPercent}%`
  const align = block.align ?? 'center'
  const alignClass = imageAlignClass(align)

  // Dropping an asset thumbnail directly onto an existing image block
  // replaces its assetId instead of inserting a new block — a sibling
  // interaction to `Page.tsx`'s between-block `ImageDropZone`, sharing
  // the same `ASSET_DRAG_MIME` mechanism. Routed through `onCommit` (the
  // same prop `Page.tsx` already wires to `contentStore.updateBlock`) so
  // this component still never touches the store directly.
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(ASSET_DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsImageDropTarget(true)
  }
  const handleDragLeave = () => setIsImageDropTarget(false)
  const handleDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(ASSET_DRAG_MIME)) return
    e.preventDefault()
    setIsImageDropTarget(false)
    const newAssetId = e.dataTransfer.getData(ASSET_DRAG_MIME) || draggingAssetId
    if (newAssetId) onCommit?.({ assetId: newAssetId })
  }

  return (
    <figure onClick={onSelect} className={cn(wrapperClass, 'cursor-pointer pb-5')}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'overflow-hidden rounded-[var(--radius-image)] outline-offset-2 transition-[outline-color] duration-150',
          alignClass,
          isImageDropTarget ? 'outline outline-2 outline-[var(--color-accent)]' : 'outline outline-2 outline-transparent',
        )}
        style={{ background: theme.page.ruleColor, width: widthStyle }}
      >
        {url ? (
          <img
            src={url}
            alt={block.altText ?? block.caption ?? ''}
            className="w-full object-cover"
            style={{
              transform: `rotate(${block.rotation}deg)`,
              filter: block.grayscale ? 'grayscale(100%)' : undefined,
            }}
          />
        ) : (
          <div className="flex h-40 items-center justify-center text-xs" style={{ color: theme.page.mutedInk }}>
            Image unavailable
          </div>
        )}
      </div>
      {block.caption && (
        <figcaption
          className={cn('pt-2 text-[0.75em] italic', alignClass)}
          style={{ fontFamily: theme.fonts.body, color: theme.page.mutedInk, width: widthStyle }}
        >
          {block.caption}
        </figcaption>
      )}
    </figure>
  )
}

async function drawImagePdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'image') return
  const { theme } = ctx
  const muted = hexToPdfColor(theme.page.mutedInk)
  const blob = await getAssetBlob(block.assetId)
  if (!blob) return
  const { bytes, width, height } = await blobToPng(blob, block.grayscale ?? false)
  const pdfImage = await ctx.page.doc.embedPng(bytes)
  // Priority order (matches ImageRender's on-screen logic so the PDF stays
  // WYSIWYG): explicit mm size, then the percent preset, then full content
  // width as the legacy default for blocks with neither field. mm -> px via
  // PX_PER_MM, then px -> pt via PX_TO_PT, so the same physical size lands
  // on screen and in the exported PDF.
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

  // `block.rotation` (0/90/180/270) is a CSS `transform: rotate(...)deg`
  // on-screen (see `ImageRender` above) — CSS rotation is clockwise-positive
  // around the element's own center, with no change to its layout box size.
  // pdf-lib's `rotate` on `drawImage` is counter-clockwise-positive (its
  // transform matrix is the standard math rotation matrix — see
  // `docs/STATUS.md` Phase 39) and pivots around the image's *bottom-left*
  // corner `(x, y)`, not its center. To reproduce the same "rotate in place
  // about the center, box size unchanged" visual behaviour the screen
  // renders, this computes a shifted `(x, y)` anchor such that after
  // pdf-lib's corner-pivot rotation, the image's *center* lands back on the
  // same point `(imageX + displayWidth/2, cursorY + displayHeight/2)` the
  // unrotated image would have occupied. Derivation: pdf-lib's pipeline is
  // translate(x,y) -> rotate(θ) -> scale(w,h), so a local point p scaled
  // into [0,w]x[0,h] ends up at `(x,y) + Rθ(p)`; solving for the anchor
  // that keeps the scaled rectangle's own center `v = (w/2, h/2)` mapped
  // onto center `C` gives `(x,y) = C - Rθ(v)`.
  if (block.rotation === 0) {
    ctx.page.drawImage(pdfImage, { x: imageX, y: ctx.cursorY, width: displayWidth, height: displayHeight })
  } else {
    const thetaRad = (-block.rotation * Math.PI) / 180 // CSS clockwise -> pdf-lib counter-clockwise
    const cos = Math.cos(thetaRad)
    const sin = Math.sin(thetaRad)
    const vx = displayWidth / 2
    const vy = displayHeight / 2
    const centerX = imageX + vx
    const centerY = ctx.cursorY + vy
    const anchorX = centerX - (vx * cos - vy * sin)
    const anchorY = centerY - (vx * sin + vy * cos)
    ctx.page.drawImage(pdfImage, {
      x: anchorX,
      y: anchorY,
      width: displayWidth,
      height: displayHeight,
      rotate: degrees(-block.rotation),
    })
  }
  if (block.caption) {
    ctx.cursorY -= 4
    const capSize = theme.typography.bodySize * 0.75 * PX_TO_PT
    ctx.cursorY -= capSize
    ctx.page.drawText(block.caption, { x: imageX, y: ctx.cursorY, size: capSize, font: pickFont(ctx.fonts, theme.fonts.body, 400), color: muted })
  }
  ctx.cursorY -= 10
}

export const imageBlockType: BlockTypeDefinition = {
  id: 'image',
  Render: ImageRender,
  drawPdf: drawImagePdf,
  blockSpacing: () => 6,
}

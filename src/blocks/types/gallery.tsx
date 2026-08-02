import { useEffect } from 'react'
import { Images } from 'lucide-react'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { useAssetStore } from '@/store/assetStore'
import { getAssetBlob } from '@/store/assetDb'
import { blobToPng } from '@/pdf/imageForPdf'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

const GAP_PX = 8

/** A grid of multiple images from the asset library — the first block field
 * to hold more than one `assetId` (see `src/types/content.ts`'s
 * `GalleryBlock` doc comment). Reuses `image.tsx`'s exact embedding
 * pipeline (`useAssetStore.getObjectUrl` on screen; `getAssetBlob` +
 * `blobToPng` + `doc.embedPng` in the PDF), just looped per id. */
function GalleryRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled } = props
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)

  const caption = useEditableField({
    mode: 'text',
    initialValue: block.type === 'gallery' ? (block.caption ?? '') : '',
    onCommit: (value) => {
      if (block.type === 'gallery') onCommit?.({ caption: value.trim() || undefined })
    },
  })

  useEffect(() => {
    if (autoEdit && editable) {
      caption.startEditing()
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'gallery') return null

  const count = block.assetIds.length
  // 0 -> a placeholder message; 1 -> a single full-width image; 2+ -> a grid
  // (2 columns keeps individual images legible even for large galleries).
  const gridColsClass = count <= 1 ? 'grid-cols-1' : 'grid-cols-2'

  return (
    <figure
      onClick={!caption.isEditing ? onSelect : undefined}
      className={cn('outline-offset-4 transition-[outline-color] duration-150', outlineClass(!!selected, caption.isEditing), 'cursor-pointer pb-5')}
    >
      {count === 0 ? (
        <div
          className="flex h-32 items-center justify-center rounded-[var(--radius-image)] text-xs"
          style={{ background: theme.page.ruleColor, color: theme.page.mutedInk }}
        >
          No images added yet.
        </div>
      ) : (
        <div className={cn('grid gap-2', gridColsClass)}>
          {block.assetIds.map((assetId, i) => {
            const url = getObjectUrl(assetId)
            return (
              <div key={assetId ? `${assetId}-${i}` : i} className="overflow-hidden rounded-[var(--radius-image)]" style={{ background: theme.page.ruleColor }}>
                {url ? (
                  <img src={url} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-xs" style={{ color: theme.page.mutedInk }}>
                    Image unavailable
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {(block.caption || caption.isEditing || editable) && (
        <figcaption
          ref={(el) => {
            caption.ref.current = el
          }}
          className="pt-2 text-center text-[0.75em] italic"
          style={{ fontFamily: theme.fonts.body, color: theme.page.mutedInk }}
          onDoubleClick={
            editable
              ? (e) => {
                  e.stopPropagation()
                  caption.startEditing()
                }
              : undefined
          }
          contentEditable={caption.isEditing}
          suppressContentEditableWarning
          onBlur={caption.isEditing ? caption.handleBlur : undefined}
          onKeyDown={caption.isEditing ? caption.handleKeyDown : undefined}
        >
          {!caption.isEditing ? (block.caption || (editable ? 'Add caption…' : '')) : null}
        </figcaption>
      )}
    </figure>
  )
}

async function drawGalleryPdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'gallery') return
  const { theme } = ctx
  const muted = hexToPdfColor(theme.page.mutedInk, ctx.colorMode)
  const gapPt = GAP_PX * PX_TO_PT

  if (block.assetIds.length === 0) {
    const font = pickFont(ctx.fonts, theme.fonts.body, 400)
    const size = theme.typography.bodySize * 0.85 * PX_TO_PT
    ctx.cursorY -= size + 10
    ctx.page.drawText('No images added yet.', { x: ctx.contentX, y: ctx.cursorY, size, font, color: muted })
    ctx.cursorY -= 10
    return
  }

  const cols = block.assetIds.length === 1 ? 1 : 2
  const cellWidth = (ctx.contentWidthPt - gapPt * (cols - 1)) / cols

  // Embed every asset first (async), then lay out synchronously — avoids
  // interleaving awaits with cursor math, mirroring `image.tsx`'s single-
  // image drawer's own "resolve everything about the image, then draw" shape.
  const embedded = await Promise.all(
    block.assetIds.map(async (assetId) => {
      const blob = await getAssetBlob(assetId)
      if (!blob) return undefined
      const { bytes, width, height } = await blobToPng(blob, false)
      const pdfImage = await ctx.page.doc.embedPng(bytes)
      return { pdfImage, width, height }
    }),
  )

  for (let row = 0; row * cols < embedded.length; row++) {
    const rowItems = embedded.slice(row * cols, row * cols + cols)
    const rowHeight = Math.max(...rowItems.map((item) => (item ? cellWidth * (item.height / item.width) : cellWidth)))
    ctx.cursorY -= rowHeight
    rowItems.forEach((item, colIndex) => {
      const x = ctx.contentX + colIndex * (cellWidth + gapPt)
      if (item) ctx.page.drawImage(item.pdfImage, { x, y: ctx.cursorY, width: cellWidth, height: cellWidth * (item.height / item.width) })
    })
    ctx.cursorY -= gapPt
  }

  if (block.caption) {
    const capFont = pickFont(ctx.fonts, theme.fonts.body, 400)
    const capSize = theme.typography.bodySize * 0.75 * PX_TO_PT
    const capWidth = capFont.widthOfTextAtSize(block.caption, capSize)
    ctx.cursorY -= capSize + 4
    ctx.page.drawText(block.caption, { x: ctx.contentX + (ctx.contentWidthPt - capWidth) / 2, y: ctx.cursorY, size: capSize, font: capFont, color: muted })
  }
  ctx.cursorY -= 10
}

export const galleryBlockType: BlockTypeDefinition = {
  id: 'gallery',
  label: 'Gallery',
  icon: Images,
  Render: GalleryRender,
  drawPdf: drawGalleryPdf,
  blockSpacing: () => 6,
}

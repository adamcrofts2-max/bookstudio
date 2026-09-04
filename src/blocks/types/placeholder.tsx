import { useEffect } from 'react'
import { ImagePlus, Upload, BarChart3, Table2, Shapes, Box, type LucideIcon } from 'lucide-react'

import type { ContentBlock, ImageBlock, PlaceholderKind } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { useImageUpload } from '@/hooks/useImageUpload'
import { UploadError } from '@/components/common/UploadError'
import { pickFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

const KIND_META: Record<PlaceholderKind, { label: string; icon: LucideIcon }> = {
  image: { label: 'Image', icon: ImagePlus },
  chart: { label: 'Chart', icon: BarChart3 },
  table: { label: 'Table', icon: Table2 },
  diagram: { label: 'Diagram', icon: Shapes },
  generic: { label: 'Content', icon: Box },
}

/** Fixed box height, on screen and in the exported PDF — keeps pagination
 * simple and predictable (no per-kind sizing logic) and gives the block
 * enough room to read as an obvious "something goes here" marker rather
 * than a thin strip. */
const PLACEHOLDER_HEIGHT_PX = 200

function PlaceholderRender(props: BlockRenderProps) {
  const { block, theme, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled, projectId, onReplace } = props

  // Always called (even for non-image-kind or non-editable placeholders) —
  // hooks can't be conditional. `projectId` is only ever undefined on
  // `HeightMeasurer.tsx`'s off-screen instances, where `editable` is also
  // false, so the upload button below never renders there and this stays
  // inert. See `BlockContentProps.onReplace` (Phase 51).
  const { openPicker, error: uploadError, inputProps } = useImageUpload(projectId ?? '', (assetId) => {
    if (block.type !== 'placeholder') return
    const replacement: ImageBlock = {
      id: block.id,
      type: 'image',
      assetId,
      rotation: 0,
      widthPercent: 100,
    }
    onReplace?.(replacement)
  })

  const label = useEditableField({
    mode: 'text',
    initialValue: block.type === 'placeholder' ? (block.label ?? '') : '',
    onCommit: (value) => {
      if (block.type === 'placeholder') onCommit?.({ label: value.trim() || undefined })
    },
  })

  const description = useEditableField({
    mode: 'text',
    initialValue: block.type === 'placeholder' ? (block.description ?? '') : '',
    onCommit: (value) => {
      if (block.type === 'placeholder') onCommit?.({ description: value.trim() || undefined })
    },
  })

  useEffect(() => {
    if (autoEdit && editable) {
      label.startEditing()
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (block.type !== 'placeholder') return null
  const meta = KIND_META[block.kind]
  const Icon = meta.icon

  return (
    <div
      onClick={!label.isEditing && !description.isEditing ? onSelect : undefined}
      className={cn(
        'my-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--color-border)] px-6 py-10 text-center',
        outlineClass(!!selected, label.isEditing || description.isEditing),
      )}
      style={{ minHeight: PLACEHOLDER_HEIGHT_PX }}
    >
      <Icon className="size-7 text-text-secondary" />
      <p
        ref={(el) => {
          label.ref.current = el
        }}
        onDoubleClick={
          editable
            ? (e) => {
                e.stopPropagation()
                label.startEditing()
              }
            : undefined
        }
        contentEditable={label.isEditing}
        suppressContentEditableWarning
        onBlur={label.isEditing ? label.handleBlur : undefined}
        onKeyDown={label.isEditing ? label.handleKeyDown : undefined}
        className="font-medium text-text-primary"
        style={{ fontFamily: theme.fonts.heading }}
      >
        {!label.isEditing ? block.label || `${meta.label} placeholder` : null}
      </p>
      <p
        ref={(el) => {
          description.ref.current = el
        }}
        onDoubleClick={
          editable
            ? (e) => {
                e.stopPropagation()
                description.startEditing()
              }
            : undefined
        }
        contentEditable={description.isEditing}
        suppressContentEditableWarning
        onBlur={description.isEditing ? description.handleBlur : undefined}
        onKeyDown={description.isEditing ? description.handleKeyDown : undefined}
        className="max-w-[85%] text-sm text-text-secondary"
        style={{ fontFamily: theme.fonts.body }}
      >
        {!description.isEditing ? block.description || (editable ? 'Describe what belongs here…' : '') : null}
      </p>
      {editable && block.kind === 'image' && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openPicker()
            }}
            className="mt-1 flex items-center gap-1.5 rounded-[var(--radius-button)] border border-border bg-background-secondary px-3 py-1.5 text-xs font-medium text-text-primary shadow-[var(--shadow-sm)] transition-colors hover:opacity-80"
          >
            <Upload className="size-3.5" />
            Upload photo
          </button>
          <input {...inputProps} />
          <UploadError message={uploadError} />
        </>
      )}
    </div>
  )
}

function drawPlaceholderPdf(ctx: DrawCtx, block: ContentBlock) {
  if (block.type !== 'placeholder') return
  const { theme } = ctx
  const meta = KIND_META[block.kind]
  const mutedInk = hexToPdfColor(theme.page.mutedInk, ctx.colorMode)

  const heightPt = PLACEHOLDER_HEIGHT_PX * PX_TO_PT
  const boxTop = ctx.cursorY
  const boxBottom = boxTop - heightPt

  // Real dashed border — pdf-lib's drawRectangle supports this natively,
  // unlike the gradient overlay approximation `coverOverlay.ts` needed.
  ctx.page.drawRectangle({
    x: ctx.contentX,
    y: boxBottom,
    width: ctx.contentWidthPt,
    height: heightPt,
    borderColor: hexToPdfColor('#c7c7c7', ctx.colorMode),
    borderWidth: 1.5,
    borderDashArray: [6, 4],
  })

  const labelFont = pickFont(ctx.fonts, theme.fonts.heading, 600)
  const descFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const labelSize = theme.typography.bodySize * 1.05 * PX_TO_PT
  const descSize = theme.typography.bodySize * 0.85 * PX_TO_PT
  const descLineHeight = descSize * theme.typography.lineHeight

  const labelText = block.label || `${meta.label} placeholder`
  const labelWidth = labelFont.widthOfTextAtSize(labelText, labelSize)
  const centerX = ctx.contentX + ctx.contentWidthPt / 2
  const padX = ctx.contentWidthPt * 0.15

  const descLines = block.description
    ? wrapRuns([{ text: block.description, bold: false }], descFont, descFont, descSize, ctx.contentWidthPt - padX * 2)
    : []
  // Vertically centres the whole label(+description) group within the
  // fixed box, rather than anchoring to the top — reads more like a
  // deliberate placeholder card, closer to the on-screen `justify-center`
  // treatment above.
  const textBlockHeight = labelSize + (descLines.length > 0 ? 8 + descLines.length * descLineHeight : 0)

  let cursorY = boxTop - (heightPt - textBlockHeight) / 2 - labelSize * 0.85
  ctx.page.drawText(labelText, { x: centerX - labelWidth / 2, y: cursorY, size: labelSize, font: labelFont, color: mutedInk })

  if (descLines.length > 0) {
    cursorY -= labelSize * 0.6 + 8
    const drawCtx = { ...ctx, contentX: ctx.contentX + padX, contentWidthPt: ctx.contentWidthPt - padX * 2, cursorY }
    drawWrappedLines(drawCtx, descLines, descSize, descLineHeight, mutedInk, descFont, descFont)
  }

  ctx.cursorY = boxBottom - 10
}

export const placeholderBlockType: BlockTypeDefinition = {
  id: 'placeholder',
  label: 'Placeholder',
  icon: ImagePlus,
  Render: PlaceholderRender,
  drawPdf: drawPlaceholderPdf,
  blockSpacing: () => 8,
}

import { Heart } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

const DEDICATION_PLACEHOLDER = 'For someone special.'

/** A short, italic, centred line or two — "For ___" is the classic
 * dedication-page convention. Deliberately no heading, unlike Foreword/
 * Preface/Acknowledgements — a dedication is meant to read as a single quiet
 * gesture on an otherwise empty page. */
function DedicationRender({ page, theme, selected, onSelect }: StructuralPageRenderProps) {
  if (page.type !== 'dedication') return null

  const text = page.content.text?.trim() || DEDICATION_PLACEHOLDER

  return (
    <div
      onClick={onSelect}
      className={cn('flex h-full w-full cursor-pointer flex-col items-center justify-center px-20 text-center', outlineClass(selected, false))}
      style={{ background: theme.page.background }}
    >
      <p
        className="whitespace-pre-wrap"
        style={{ fontFamily: theme.fonts.body, fontStyle: 'italic', fontSize: '1.1em', lineHeight: 1.8, color: theme.page.ink }}
      >
        {text}
      </p>
    </div>
  )
}

function drawDedicationPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme, pageBox: PageBox) {
  if (page.type !== 'dedication') return

  const text = page.content.text?.trim() || DEDICATION_PLACEHOLDER
  // PDF export doesn't distinguish italic emphasis (see docs/STATUS.md's
  // existing "known simplification" for `<em>` in the block-content
  // exporter) — regular weight is used here too, for the same reason.
  const font = pickFont(ctx.fonts, theme.fonts.body, 400)
  const size = theme.typography.bodySize * 1.1 * PX_TO_PT
  const lineHeight = size * 1.8
  const color = hexToPdfColor(theme.page.ink, ctx.colorMode)

  const bleedPt = pageBox.bleedPx * PX_TO_PT
  const widthPt = pageBox.widthPx * PX_TO_PT
  const heightPt = pageBox.heightPx * PX_TO_PT
  const centerX = bleedPt + widthPt / 2
  const centerY = bleedPt + heightPt / 2

  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  let cursorY = centerY + ((lines.length - 1) * lineHeight) / 2
  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, size)
    ctx.page.drawText(line, { x: centerX - lineWidth / 2, y: cursorY, size, font, color })
    cursorY -= lineHeight
  }
}

export const dedicationPageType: StructuralPageTypeDefinition = {
  id: 'dedication',
  category: 'front-matter',
  label: 'Dedication',
  icon: Heart,
  Render: DedicationRender,
  drawPdf: drawDedicationPdf,
  defaultContent: () => ({}),
}

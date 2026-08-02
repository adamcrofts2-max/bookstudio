import { Copyright as CopyrightIcon } from 'lucide-react'

import type { StructuralPage, TitlePage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { wrapRuns } from '@/pdf/textWrap'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

/** Default boilerplate when `content.text` is empty — real book convention
 * (small, unobtrusive copyright text), using the current year and, if a
 * Title Page exists in the same project, its author — falling back
 * gracefully when neither is available. */
function defaultCopyrightText(author: string | undefined): string {
  const year = new Date().getFullYear()
  return author ? `© ${year} ${author}. All rights reserved.` : `© ${year}. All rights reserved.`
}

function findTitlePageAuthor(siblingPages: StructuralPage[]): string | undefined {
  const titlePage = siblingPages.find((p): p is TitlePage => p.type === 'title-page')
  return titlePage?.content.author
}

/** Small, unobtrusive body text near the bottom of the page — conventional
 * placement for a copyright page. */
function CopyrightRender({ page, theme, selected, onSelect, siblingPages }: StructuralPageRenderProps) {
  if (page.type !== 'copyright') return null

  const text = page.content.text?.trim() || defaultCopyrightText(findTitlePageAuthor(siblingPages))

  return (
    <div
      onClick={onSelect}
      className={cn('flex h-full w-full cursor-pointer flex-col justify-end px-14 pb-16', outlineClass(selected, false))}
      style={{ background: theme.page.background }}
    >
      <p
        className="whitespace-pre-wrap text-[0.78em] leading-relaxed"
        style={{ fontFamily: theme.fonts.body, color: theme.page.mutedInk }}
      >
        {text}
      </p>
    </div>
  )
}

function drawCopyrightPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme, pageBox: PageBox) {
  if (page.type !== 'copyright') return

  const text = page.content.text?.trim() || defaultCopyrightText(findTitlePageAuthor(ctx.structuralPages))
  const font = pickFont(ctx.fonts, theme.fonts.body, 400)
  const size = theme.typography.bodySize * 0.78 * PX_TO_PT
  const lineHeight = size * 1.45
  const lines = wrapRuns([{ text, bold: false }], font, font, size, ctx.contentWidthPt)

  const bleedPt = pageBox.bleedPx * PX_TO_PT
  const marginBottomPt = pageBox.marginBottomPx * PX_TO_PT
  let y = bleedPt + marginBottomPt + lines.length * lineHeight
  const color = hexToPdfColor(theme.page.mutedInk, ctx.colorMode)
  for (const line of lines) {
    y -= lineHeight
    for (const fragment of line.fragments) {
      ctx.page.drawText(fragment.text, { x: ctx.contentX + fragment.x, y, size, font, color })
    }
  }
}

export const copyrightPageType: StructuralPageTypeDefinition = {
  id: 'copyright',
  category: 'front-matter',
  label: 'Copyright',
  icon: CopyrightIcon,
  Render: CopyrightRender,
  drawPdf: drawCopyrightPdf,
  defaultContent: () => ({}),
}

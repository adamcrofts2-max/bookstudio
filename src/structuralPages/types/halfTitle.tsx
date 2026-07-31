import { BookMarked } from 'lucide-react'

import type { StructuralPage, TitlePage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { EditableText } from '@/structuralPages/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

/** Half Title has no dedicated title field seeded at creation time — rather
 * than complicate `defaultContent()` (a pure, argument-less function) with
 * sibling-lookup logic, it falls back to a sibling Title Page's title at
 * render/draw time instead, the same way `copyright.tsx` already falls back
 * to a sibling Title Page's author. */
function findTitlePageTitle(siblingPages: StructuralPage[]): string | undefined {
  const titlePage = siblingPages.find((p): p is TitlePage => p.type === 'title-page')
  return titlePage?.content.title
}

/** Traditionally the very first page of a printed book: just the title,
 * small and centred, with lots of whitespace above and below — deliberately
 * plainer than the full Title Page that follows it. */
function HalfTitleRender({ page, theme, selected, onSelect, onCommit, siblingPages }: StructuralPageRenderProps) {
  if (page.type !== 'half-title') return null

  // Shows the resolved (own-or-sibling-fallback) title, but editing always
  // writes to this page's own `content.title` — never the sibling Title
  // Page's — same "display the computed default, edit sets an explicit
  // override" precedent as `copyright.tsx`'s boilerplate text.
  const title = page.content.title?.trim() || findTitlePageTitle(siblingPages) || 'Untitled'

  return (
    <div
      onClick={onSelect}
      className={cn('flex h-full w-full cursor-pointer flex-col items-center justify-center px-20 text-center', outlineClass(selected, false))}
      style={{ background: theme.page.background }}
    >
      <EditableText
        as="h1"
        value={title}
        placeholder="Untitled"
        onCommit={(value) => onCommit({ title: value || undefined })}
        style={{
          fontFamily: theme.fonts.heading,
          fontWeight: theme.typography.headingWeight,
          fontSize: '1.3em',
          letterSpacing: '0.02em',
          color: theme.page.ink,
        }}
      />
    </div>
  )
}

function drawHalfTitlePdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme, pageBox: PageBox) {
  if (page.type !== 'half-title') return

  const bleedPt = pageBox.bleedPx * PX_TO_PT
  const widthPt = pageBox.widthPx * PX_TO_PT
  const heightPt = pageBox.heightPx * PX_TO_PT
  const centerX = bleedPt + widthPt / 2
  const centerY = bleedPt + heightPt / 2

  const font = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const title = page.content.title?.trim() || findTitlePageTitle(ctx.structuralPages) || 'Untitled'
  const size = theme.typography.bodySize * 1.3 * PX_TO_PT
  const width = font.widthOfTextAtSize(title, size)
  const color = hexToPdfColor(theme.page.ink)

  ctx.page.drawText(title, { x: centerX - width / 2, y: centerY, size, font, color })
}

export const halfTitlePageType: StructuralPageTypeDefinition = {
  id: 'half-title',
  category: 'front-matter',
  label: 'Half Title',
  icon: BookMarked,
  Render: HalfTitleRender,
  drawPdf: drawHalfTitlePdf,
  defaultContent: () => ({}),
}

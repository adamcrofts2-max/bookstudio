import { File } from 'lucide-react'

import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { outlineClass } from '@/blocks/shared'
import { cn } from '@/lib/utils'

/** Renders nothing but the page background — identical visual treatment to
 * the existing auto-inserted `PageKind === 'blank'` case in `Page.tsx`/
 * `exportPdf.ts` (a blank page there gets zero content drawn on top of the
 * already-painted background, and no running header/page-number footer;
 * this structural "Blank Page" type is meant to look exactly the same, just
 * as an insertable/reorderable/deletable unit instead of an automatic
 * chapter-recto filler). The click target and selection outline are the
 * only thing this component actually renders — a real DOM node is still
 * needed so the page can be selected from the on-screen preview, not just
 * from the Sidebar's Structure tab. */
function BlankRender({ selected, onSelect }: StructuralPageRenderProps) {
  return <div onClick={onSelect} className={cn('h-full w-full cursor-pointer', outlineClass(selected, false))} />
}

/** No parameters declared — a function with fewer params than the
 * `drawPdf` signature is still assignable to it in TypeScript (extra
 * arguments are simply unused), and there's genuinely nothing to draw: the
 * page background is already painted by `exportPdf.ts`'s main loop before
 * any per-kind drawing runs. */
function drawBlankPdf(): void {}

export const blankPageType: StructuralPageTypeDefinition = {
  id: 'blank',
  category: 'front-matter',
  label: 'Blank Page',
  icon: File,
  Render: BlankRender,
  drawPdf: drawBlankPdf,
  defaultContent: () => ({}),
}

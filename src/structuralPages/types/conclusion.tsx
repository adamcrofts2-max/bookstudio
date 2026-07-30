import { Flag } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { LongFormPageRender, drawLongFormPagePdf } from '@/structuralPages/longForm'

const CONCLUSION_PLACEHOLDER = 'This conclusion has no text yet.'

/** Back matter's "heading + paragraphs" type — same shared rendering as
 * `foreword.tsx`/`preface.tsx`/`acknowledgements.tsx` via
 * `src/structuralPages/longForm.tsx`, no attribution field, just placed in
 * the back-matter category instead of front-matter. */
function ConclusionRender(props: StructuralPageRenderProps) {
  const { page, theme, selected, onSelect } = props
  if (page.type !== 'conclusion') return null

  return (
    <LongFormPageRender
      heading="Conclusion"
      text={page.content.text ?? ''}
      emptyPlaceholder={CONCLUSION_PLACEHOLDER}
      theme={theme}
      selected={selected}
      onSelect={onSelect}
    />
  )
}

// Omits the `pageBox` parameter — see `foreword.tsx`'s identical comment on
// why this is a valid, deliberate `drawPdf` signature.
function drawConclusionPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme) {
  if (page.type !== 'conclusion') return
  drawLongFormPagePdf(ctx, theme, 'Conclusion', page.content.text ?? '', CONCLUSION_PLACEHOLDER)
}

export const conclusionPageType: StructuralPageTypeDefinition = {
  id: 'conclusion',
  category: 'back-matter',
  label: 'Conclusion',
  icon: Flag,
  Render: ConclusionRender,
  drawPdf: drawConclusionPdf,
  defaultContent: () => ({}),
}

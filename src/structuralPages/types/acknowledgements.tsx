import { HeartHandshake } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { LongFormPageRender, drawLongFormPagePdf } from '@/structuralPages/longForm'

const ACKNOWLEDGEMENTS_PLACEHOLDER = 'This page has no text yet.'

/** Same shape/rendering as `preface.tsx` — heading + paragraphs, no
 * attribution field — headed "Acknowledgements" instead. */
function AcknowledgementsRender(props: StructuralPageRenderProps) {
  const { page, theme, selected, onSelect } = props
  if (page.type !== 'acknowledgements') return null

  return (
    <LongFormPageRender
      heading="Acknowledgements"
      text={page.content.text ?? ''}
      emptyPlaceholder={ACKNOWLEDGEMENTS_PLACEHOLDER}
      theme={theme}
      selected={selected}
      onSelect={onSelect}
    />
  )
}

// Omits the `pageBox` parameter — see `foreword.tsx`'s identical comment on
// why this is a valid, deliberate `drawPdf` signature.
function drawAcknowledgementsPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme) {
  if (page.type !== 'acknowledgements') return
  drawLongFormPagePdf(ctx, theme, 'Acknowledgements', page.content.text ?? '', ACKNOWLEDGEMENTS_PLACEHOLDER)
}

export const acknowledgementsPageType: StructuralPageTypeDefinition = {
  id: 'acknowledgements',
  category: 'front-matter',
  label: 'Acknowledgements',
  icon: HeartHandshake,
  Render: AcknowledgementsRender,
  drawPdf: drawAcknowledgementsPdf,
  defaultContent: () => ({}),
}

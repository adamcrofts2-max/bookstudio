import { BookOpenText } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { LongFormPageRender, drawLongFormPagePdf } from '@/structuralPages/longForm'

const PREFACE_PLACEHOLDER = 'This preface has no text yet.'

/** Body text written by the author — same shape/rendering as `foreword.tsx`
 * via the shared `src/structuralPages/longForm.tsx` helpers, but no
 * attribution field: a preface needs none since it's by the author. */
function PrefaceRender(props: StructuralPageRenderProps) {
  const { page, theme, selected, onSelect } = props
  if (page.type !== 'preface') return null

  return (
    <LongFormPageRender
      heading="Preface"
      text={page.content.text ?? ''}
      emptyPlaceholder={PREFACE_PLACEHOLDER}
      theme={theme}
      selected={selected}
      onSelect={onSelect}
    />
  )
}

// Omits the `pageBox` parameter — see `foreword.tsx`'s identical comment on
// why this is a valid, deliberate `drawPdf` signature.
function drawPrefacePdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme) {
  if (page.type !== 'preface') return
  drawLongFormPagePdf(ctx, theme, 'Preface', page.content.text ?? '', PREFACE_PLACEHOLDER)
}

export const prefacePageType: StructuralPageTypeDefinition = {
  id: 'preface',
  category: 'front-matter',
  label: 'Preface',
  icon: BookOpenText,
  Render: PrefaceRender,
  drawPdf: drawPrefacePdf,
  defaultContent: () => ({}),
}

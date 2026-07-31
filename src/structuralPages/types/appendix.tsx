import { ListTree } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { LongFormPageRender, drawLongFormPagePdf } from '@/structuralPages/longForm'

const APPENDIX_PLACEHOLDER = 'This appendix has no text yet.'

/** Same "heading + paragraphs" shape as `conclusion.tsx`, but the heading
 * itself is editable — books often have several appendices (e.g. "Appendix
 * A: Plant Species List", "Appendix B: Soil Test Results") each needing its
 * own distinct title, unlike Conclusion's single fixed heading. */
function resolveHeading(title: string | undefined): string {
  return title?.trim() || 'Appendix'
}

function AppendixRender(props: StructuralPageRenderProps) {
  const { page, theme, selected, onSelect, onCommit } = props
  if (page.type !== 'appendix') return null

  return (
    <LongFormPageRender
      heading={resolveHeading(page.content.title)}
      text={page.content.text ?? ''}
      emptyPlaceholder={APPENDIX_PLACEHOLDER}
      theme={theme}
      selected={selected}
      onSelect={onSelect}
      onCommitHeading={(value) => onCommit({ title: value || undefined })}
    />
  )
}

// Omits the `pageBox` parameter — see `foreword.tsx`'s identical comment on
// why this is a valid, deliberate `drawPdf` signature.
function drawAppendixPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme) {
  if (page.type !== 'appendix') return
  drawLongFormPagePdf(ctx, theme, resolveHeading(page.content.title), page.content.text ?? '', APPENDIX_PLACEHOLDER)
}

export const appendixPageType: StructuralPageTypeDefinition = {
  id: 'appendix',
  category: 'back-matter',
  label: 'Appendix',
  icon: ListTree,
  Render: AppendixRender,
  drawPdf: drawAppendixPdf,
  defaultContent: () => ({}),
}

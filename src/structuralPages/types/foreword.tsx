import { Quote } from 'lucide-react'

import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { StructuralPageRenderProps, StructuralPageTypeDefinition } from '@/structuralPages/registry'
import { LongFormPageRender, drawLongFormPagePdf } from '@/structuralPages/longForm'

const FOREWORD_PLACEHOLDER = 'This foreword has no text yet.'

/** Body text written by someone other than the author — the only one of
 * this batch's three "heading + paragraphs" types with an attribution line,
 * since a foreword is conventionally signed by whoever wrote it. See
 * `src/structuralPages/longForm.tsx` for the shared rendering/drawing logic
 * this, `preface.tsx`, and `acknowledgements.tsx` all reuse. */
function ForewordRender(props: StructuralPageRenderProps) {
  const { page, theme, selected, onSelect, onCommit } = props
  if (page.type !== 'foreword') return null

  return (
    <LongFormPageRender
      heading="Foreword"
      text={page.content.text ?? ''}
      emptyPlaceholder={FOREWORD_PLACEHOLDER}
      attribution={page.content.authorName?.trim() || undefined}
      theme={theme}
      selected={selected}
      onSelect={onSelect}
      onCommitAttribution={(value) => onCommit({ authorName: value || undefined })}
    />
  )
}

// Deliberately omits the `pageBox` parameter that `drawPdf`'s type signature
// declares — a function with fewer params is still assignable in
// TypeScript, and `drawLongFormPagePdf` flows purely from `ctx.cursorY`/
// `ctx.contentWidthPt`, which are already resolved from `pageBox` by
// `exportPdf.ts` before this is called (same trick `blank.tsx`'s
// `drawBlankPdf` already uses for the same reason).
function drawForewordPdf(ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme) {
  if (page.type !== 'foreword') return
  drawLongFormPagePdf(ctx, theme, 'Foreword', page.content.text ?? '', FOREWORD_PLACEHOLDER, page.content.authorName?.trim() || undefined)
}

export const forewordPageType: StructuralPageTypeDefinition = {
  id: 'foreword',
  category: 'front-matter',
  label: 'Foreword',
  icon: Quote,
  Render: ForewordRender,
  drawPdf: drawForewordPdf,
  defaultContent: () => ({}),
}

import type { ResolvedBookTheme } from '@/theme/presets'
import type { DrawCtx } from '@/pdf/exportPdf'
import { outlineClass } from '@/blocks/shared'
import { pickFont } from '@/pdf/fonts'
import { hexToPdfColor } from '@/pdf/color'
import { wrapRuns } from '@/pdf/textWrap'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { cn } from '@/lib/utils'

/**
 * Shared by Foreword/Preface/Acknowledgements (`src/structuralPages/types/
 * {foreword,preface,acknowledgements}.tsx`) — all three are "heading + a run
 * of body paragraphs, optionally with a right-aligned attribution line"
 * structural pages, differing only in heading text, whether an attribution
 * field exists, and which `StructuralPage['content']` shape backs them.
 * Mirrors `src/blocks/shared.tsx`'s precedent of factoring out pieces reused
 * by more than one type module rather than copy-pasting three times.
 *
 * Known V1 simplification (see docs/STATUS.md's Phase 20 entry): a
 * structural page is a single fixed page that never reflows, unlike
 * `Chapter`/`ContentBlock`. Foreword/Preface/Acknowledgements text can in
 * principle run longer than one printed page — this milestone does not
 * paginate them. Unusually long text simply overflows visually (clipped by
 * the page's own bounds on screen, and free to run past the page's bottom
 * margin in the PDF) rather than flowing onto a second page. A future
 * milestone could give these types real pagination; that is out of scope
 * here, matching the plan's own framing of structural pages as fixed units.
 */

/** Splits free-form stored text on blank-line boundaries (one or more blank
 * lines) into paragraphs. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

interface LongFormPageRenderProps {
  heading: string
  text: string
  emptyPlaceholder: string
  attribution?: string
  theme: ResolvedBookTheme
  selected: boolean
  onSelect: () => void
}

/** Shared on-screen renderer: a heading, a stack of body paragraphs (split
 * on `\n\n`), and an optional right-aligned "— {attribution}" line. */
export function LongFormPageRender({ heading, text, emptyPlaceholder, attribution, theme, selected, onSelect }: LongFormPageRenderProps) {
  const paragraphs = splitParagraphs(text)

  return (
    <div
      onClick={onSelect}
      className={cn('flex h-full w-full cursor-pointer flex-col gap-6 px-16 py-20', outlineClass(selected, false))}
      style={{ background: theme.page.background }}
    >
      <h2
        style={{
          fontFamily: theme.fonts.heading,
          fontWeight: theme.typography.headingWeight,
          fontSize: '1.5em',
          color: theme.page.ink,
        }}
      >
        {heading}
      </h2>
      <div className="flex flex-col gap-4">
        {(paragraphs.length > 0 ? paragraphs : [emptyPlaceholder]).map((paragraph, i) => (
          <p
            key={i}
            style={{
              fontFamily: theme.fonts.body,
              fontSize: '1em',
              lineHeight: theme.typography.lineHeight,
              color: theme.page.ink,
              whiteSpace: 'pre-wrap',
            }}
          >
            {paragraph}
          </p>
        ))}
      </div>
      {attribution && (
        <p
          className="text-right"
          style={{ fontFamily: theme.fonts.body, fontSize: '0.95em', fontStyle: 'italic', color: theme.page.mutedInk }}
        >
          — {attribution}
        </p>
      )}
    </div>
  )
}

/** Shared PDF drawer mirroring `LongFormPageRender` above. Flows from
 * `ctx.cursorY` downward (structural pages start it at the top margin — see
 * `exportPdf.ts`), exactly like a normal content page's heading + paragraph
 * blocks, rather than the bottom-anchored small print `copyright.tsx` uses. */
export function drawLongFormPagePdf(ctx: DrawCtx, theme: ResolvedBookTheme, heading: string, text: string, emptyPlaceholder: string, attribution?: string) {
  const headingFont = pickFont(ctx.fonts, theme.fonts.heading, theme.typography.headingWeight)
  const bodyFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const ink = hexToPdfColor(theme.page.ink)
  const mutedInk = hexToPdfColor(theme.page.mutedInk)

  const headingSize = theme.typography.bodySize * 1.5 * PX_TO_PT
  ctx.cursorY -= headingSize
  ctx.page.drawText(heading, { x: ctx.contentX, y: ctx.cursorY, size: headingSize, font: headingFont, color: ink })
  ctx.cursorY -= headingSize * 1.1

  const bodySize = theme.typography.bodySize * PX_TO_PT
  const lineHeight = bodySize * theme.typography.lineHeight
  const paragraphs = splitParagraphs(text)
  for (const paragraph of paragraphs.length > 0 ? paragraphs : [emptyPlaceholder]) {
    const lines = wrapRuns([{ text: paragraph, bold: false }], bodyFont, bodyFont, bodySize, ctx.contentWidthPt)
    drawWrappedLines(ctx, lines, bodySize, lineHeight, ink, bodyFont, bodyFont)
    ctx.cursorY -= lineHeight * 0.6
  }

  if (attribution) {
    ctx.cursorY -= lineHeight * 0.3
    const attrText = `— ${attribution}`
    const attrSize = bodySize * 0.95
    const attrWidth = bodyFont.widthOfTextAtSize(attrText, attrSize)
    ctx.page.drawText(attrText, {
      x: ctx.contentX + ctx.contentWidthPt - attrWidth,
      y: ctx.cursorY,
      size: attrSize,
      font: bodyFont,
      color: mutedInk,
    })
  }
}

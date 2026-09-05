import { useEffect, useRef } from 'react'
import { Pilcrow } from 'lucide-react'

import type { ContentBlock } from '@/types/content'
import type { BlockRenderProps, BlockTypeDefinition } from '@/blocks/registry'
import type { DrawCtx } from '@/pdf/exportPdf'
import { useEditableField, outlineClass } from '@/blocks/shared'
import { FloatingFormatToolbar } from '@/renderer/FloatingFormatToolbar'
import { useLiveSpellcheck } from '@/renderer/useLiveSpellcheck'
import { pickFont, pickItalicFont } from '@/pdf/fonts'
import { wrapRuns } from '@/pdf/textWrap'
import { parseInlineRuns } from '@/pdf/htmlRuns'
import { hexToPdfColor } from '@/pdf/color'
import { drawWrappedLines, PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { selectTextRange } from '@/blocks/caretOffset'
import { cn } from '@/lib/utils'

function ParagraphRender(props: BlockRenderProps) {
  const {
    block,
    theme,
    dropCap,
    selected,
    onSelect,
    editable,
    onCommit,
    onSplit,
    onMergeWithPrevious,
    autoEdit,
    autoEditCaretPosition,
    onAutoEditHandled,
    projectId,
  } = props

  const primary = useEditableField({
    mode: 'html',
    initialValue: block.type === 'paragraph' ? block.html : '',
    onCommit: (value) => {
      if (block.type === 'paragraph') onCommit?.({ html: value })
    },
    onSplit: onSplit && block.type === 'paragraph' ? onSplit : undefined,
    onMergeWithPrevious: onMergeWithPrevious && block.type === 'paragraph' ? onMergeWithPrevious : undefined,
  })

  // `startEditing` is re-issued (idempotently) every time `autoEdit` flips
  // true — including on a *fresh* remount of this exact block, not just its
  // first mount. That matters because a just-split paragraph's new "after"
  // half is brand new to the layout engine: its real height isn't known
  // until `HeightMeasurer` reports it (see `BookRenderer.tsx`), so the very
  // first pagination pass that places it uses a fallback guess. If the real
  // height differs enough to shift page boundaries, this component can
  // remount once the corrected layout lands — which would silently drop the
  // focus this effect just set, with no user-visible retry, if the edit
  // request had already been consumed (reported 2026-08-02: "starts a new
  // block but you have to click it again to start typing"). Consuming the
  // request from `onFocus` below instead of here means `editRequestId`
  // stays live — and this effect keeps re-firing `startEditing` — across
  // any number of such remounts, until a focus genuinely sticks.
  useEffect(() => {
    if (autoEdit && editable) primary.startEditing(autoEditCaretPosition ?? 'end')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  /**
   * A misspelled word the reader clicked while this paragraph was not being
   * edited, waiting for edit mode so it can be re-selected.
   *
   * Phase 143 gave every paragraph underlines, editing or not — but
   * `FloatingFormatToolbar` below is mounted with `active={isEditing}`, so
   * on any paragraph the reader had not already clicked into, the red line
   * led nowhere: no toolbar, no suggestions, no way to fix the word it was
   * pointing at (reported 2026-09-05, "there still doesn't seem to be any
   * spelling suggestions when red lines appear"). Clicking a flagged word
   * now opens the paragraph for editing, which is what the toolbar needs.
   *
   * The selection has to be re-applied afterwards rather than simply made
   * once: `startEditing`'s own layout effect reassigns `innerHTML` and
   * places a caret, which destroys any selection that existed before it.
   * Same shape as every other "act after the DOM has settled" fix in this
   * codebase — the offsets are plain-text, so they survive the rewrite.
   */
  const pendingWordRef = useRef<{ start: number; end: number } | null>(null)

  // Phase 116 (2026-08-03): live, dictionary-backed spell-check underlining —
  // see `useLiveSpellcheck.ts`'s own doc comment for the full design (how it
  // avoids disturbing the caret, why it observes rather than listens).
  useLiveSpellcheck(
    primary.ref,
    !!editable,
    projectId,
    block.type === 'paragraph' ? block.html : '',
    (start, end) => {
      // Already editing: the selection the hook just made is the real one
      // and nothing is about to replace the DOM, so leave it alone.
      if (primary.isEditing || !editable) return
      pendingWordRef.current = { start, end }
      primary.startEditing(start)
    },
  )

  useEffect(() => {
    const pending = pendingWordRef.current
    if (!primary.isEditing || !pending) return
    pendingWordRef.current = null
    const el = primary.ref.current
    if (el) selectTextRange(el, pending.start, pending.end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary.isEditing])

  if (block.type !== 'paragraph') return null

  return (
    <>
      <p
        ref={(el) => {
          primary.ref.current = el
        }}
        onClick={!primary.isEditing ? onSelect : undefined}
        // Phase 122 (2026-08-03, user: "doesn't work if you double click the
        // word to highlight it, only if user drags") — this used to fire
        // unconditionally on every double-click, including ones that happen
        // *while already editing* (e.g. double-clicking a misspelled word to
        // select it for the Fix-spelling toolbar). `startEditing()`'s own
        // layout effect (`shared.tsx`) reassigns `innerHTML` and force-places
        // the caret every time it runs — even when the content is textually
        // identical, that's a fresh set of DOM nodes, which silently destroys
        // whatever Selection/Range the browser's native double-click-selects-
        // word behaviour had just created a moment earlier. A manual
        // click-drag selection never had this problem because dragging never
        // fires `dblclick` at all. Gating on `!primary.isEditing` leaves the
        // original "double-click an unselected paragraph to start editing it"
        // affordance intact (still fires exactly once, on the transition into
        // edit mode) while letting every *subsequent* double-click behave as
        // plain native word-selection once already editing.
        onDoubleClick={editable && !primary.isEditing ? () => primary.startEditing() : undefined}
        contentEditable={primary.isEditing}
        suppressContentEditableWarning
        // The browser's own native spellchecker would otherwise underline
        // words independently of (and inconsistently with) the custom,
        // dictionary-backed one `useLiveSpellcheck` just added above —
        // Chrome's dictionary doesn't know this project's Layer 0 names or
        // acronym exclusions, so leaving native spellcheck on would show a
        // second, uncorrectable set of squiggles alongside the real one
        // (Phase 117, 2026-08-03, found live-testing exactly this).
        spellCheck={false}
        onFocus={autoEdit ? () => onAutoEditHandled?.() : undefined}
        onBlur={primary.isEditing ? primary.handleBlur : undefined}
        onKeyDown={primary.isEditing ? primary.handleKeyDown : undefined}
        className={cn(
          'outline-offset-4 transition-[outline-color] duration-150',
          outlineClass(!!selected, primary.isEditing),
          'cursor-pointer pb-3.5',
          dropCap && 'book-drop-cap',
        )}
        style={{
          fontFamily: theme.fonts.body,
          fontSize: theme.typography.bodySize,
          lineHeight: theme.typography.lineHeight,
          color: theme.page.ink,
          textAlign: theme.typography.justify ? 'justify' : 'left',
          hyphens: 'auto',
          fontVariantLigatures: 'common-ligatures',
          wordBreak: 'normal',
          overflowWrap: 'break-word',
        }}
        {...(!primary.isEditing ? { dangerouslySetInnerHTML: { __html: block.html } } : {})}
      />
      <FloatingFormatToolbar containerRef={primary.ref} active={primary.isEditing} projectId={projectId} />
    </>
  )
}

function drawParagraphPdf(ctx: DrawCtx, block: ContentBlock, dropCap: boolean) {
  if (block.type !== 'paragraph') return
  const { theme } = ctx
  const ink = hexToPdfColor(theme.page.ink, ctx.colorMode)
  const accent = hexToPdfColor(theme.page.accent, ctx.colorMode)
  const sizePt = theme.typography.bodySize * PX_TO_PT
  const regularFont = pickFont(ctx.fonts, theme.fonts.body, 400)
  const boldFont = pickFont(ctx.fonts, theme.fonts.body, 700)
  const italicFont = pickItalicFont(ctx.fonts, theme.fonts.body, 400)
  const boldItalicFont = pickItalicFont(ctx.fonts, theme.fonts.body, 700)
  const runs = parseInlineRuns(block.html)
  // Paragraph is the only block type with real inline HTML, so it's the
  // only caller that passes `justify`/italic fonts to `wrapRuns` — see
  // that function's own doc comment for why every other block type's
  // simpler `wrapRuns` calls are unaffected. `theme.typography.justify`
  // is the same flag the on-screen `<p>` already reads for its CSS
  // `text-align: justify` — this makes the exported PDF match it instead
  // of silently staying left-aligned (docs/ROADMAP.md Phase D).
  const wrapOptions = { italicFont, boldItalicFont, justify: theme.typography.justify }
  const drawOptions = { italicFont, boldItalicFont, linkColor: accent }
  if (dropCap && runs.length > 0 && runs[0].text.length > 0) {
    // Faux drop cap: draw the first letter oversized, offset the rest of
    // the paragraph's first line to its right. Simplified vs. the CSS
    // ::first-letter float used on screen.
    const capLetter = runs[0].text[0]
    runs[0] = { ...runs[0], text: runs[0].text.slice(1) }
    const capSize = sizePt * 2.4
    ctx.page.drawText(capLetter, { x: ctx.contentX, y: ctx.cursorY - capSize * 0.78, size: capSize, font: boldFont, color: ink })
    const capWidth = boldFont.widthOfTextAtSize(capLetter, capSize) + 2
    // Drop-cap paragraphs skip justification on their first (indented)
    // line's width calculation — the capWidth-narrowed first line would
    // otherwise justify against the wrong (narrower) maxWidth than every
    // later line. A drop-cap paragraph is typically short relative to a
    // whole page, so this is a minor, documented simplification rather
    // than a silent bug.
    const lines = wrapRuns(runs, regularFont, boldFont, sizePt, ctx.contentWidthPt - capWidth, { italicFont, boldItalicFont })
    // Shift every fragment right by capWidth for this block's lines.
    for (const line of lines) for (const f of line.fragments) f.x += capWidth
    drawWrappedLines(ctx, lines, sizePt, sizePt * theme.typography.lineHeight, ink, regularFont, boldFont, drawOptions)
  } else {
    const lines = wrapRuns(runs, regularFont, boldFont, sizePt, ctx.contentWidthPt, wrapOptions)
    drawWrappedLines(ctx, lines, sizePt, sizePt * theme.typography.lineHeight, ink, regularFont, boldFont, drawOptions)
  }
  ctx.cursorY -= 4
}

export const paragraphBlockType: BlockTypeDefinition = {
  id: 'paragraph',
  label: 'Paragraph',
  icon: Pilcrow,
  Render: ParagraphRender,
  drawPdf: drawParagraphPdf,
}

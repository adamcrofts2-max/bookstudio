import { memo, useLayoutEffect, useRef } from 'react'
import { CHAPTER_OPENER } from '@/renderer/chapterOpenerMetrics'

import type { Chapter } from '@/types/content'
import type { ResolvedBookTheme } from '@/theme/presets'
import { BlockContent } from '@/renderer/BlockContent'
import { getChapterNumberLabel } from '@/renderer/chapterOpenerLabel'

interface HeightMeasurerProps {
  chapters: Chapter[]
  contentWidthPx: number
  theme: ResolvedBookTheme
  dropCapBlockIds: Set<string>
  /** Recomputed whenever any of these change; identity-stable between. */
  measureKey: string
  /**
   * Keyed by block id for every block, and additionally by
   * `` `opener:${chapterId}` `` for each chapter's opener-page header (number
   * label + title) — see that key's own measurement below for why.
   */
  onMeasured: (heights: Record<string, number>) => void
}

/**
 * Renders every block off-screen, at the real page content width and
 * theme typography, purely to read back each block's true rendered
 * height. This is what lets the layout engine be text-flow-accurate
 * instead of guessing — the same `BlockContent` component used for real
 * pages is used here, so measurement and final render can never disagree.
 */
function HeightMeasurerImpl({ chapters, contentWidthPx, theme, dropCapBlockIds, measureKey, onMeasured }: HeightMeasurerProps) {
  const refs = useRef(new Map<string, HTMLDivElement>())

  useLayoutEffect(() => {
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const heights: Record<string, number> = {}
      refs.current.forEach((el, id) => {
        heights[id] = el.getBoundingClientRect().height
      })
      onMeasured(heights)
    }

    // Measure right away so layout isn't blocked on network fonts — but
    // `index.css`'s self-hosted @font-face rules all use `font-display:
    // swap`, meaning this first measurement can happen while the browser is
    // still showing a fallback font. Once the real woff2 (Inter / Source
    // Serif 4) finishes loading, every block's line-height and character
    // width change, so its true height changes too — and since this first
    // measurement already fed `paginate()`, more text was assigned to a page
    // than the real font actually allows once it swaps in. Page.tsx's
    // content container clips overflow, so the result was a paragraph
    // silently cut off mid-way down a page (reported 2026-07-31). Waiting on
    // `document.fonts.ready` and re-measuring closes that gap with a second,
    // corrected pagination pass; it's a no-op if fonts were already
    // loaded/cached, since the two measurements will just agree.
    measure()
    document.fonts?.ready?.then(measure).catch(() => {})

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureKey, contentWidthPx])

  return (
    <div
      aria-hidden
      style={{ position: 'fixed', top: 0, left: -100000, width: contentWidthPx, visibility: 'hidden', pointerEvents: 'none' }}
    >
      {chapters.map((chapter, chapterIndex) => (
        <div key={`opener-wrap-${chapter.id}`}>
          {/*
           * Chapter-opener pages render a number label + title *above* the
           * first block (see `Page.tsx`'s `chapter-start` markup) — real,
           * variable-height content (a two-line-wrapping title takes roughly
           * double the space of a one-line title) that `paginate.ts` needs to
           * know about to correctly reserve space on that first page. Before
           * this, `paginate.ts` only subtracted the theme's fixed
           * `topSpacer` padding, never the title/label's own rendered
           * height — so a long or wrapping chapter title silently ate into
           * space pagination assumed was free for blocks, overflowing
           * `Page.tsx`'s clipped content container (reported 2026-07-31,
           * "chapters are still getting cut off occasionally"). Markup here
           * must mirror `Page.tsx`'s exactly (same classes/styles, and the
           * same `getChapterNumberLabel` helper for the label text) or the
           * two heights will silently drift apart again.
           */}
          <div key={`opener-${chapter.id}`} ref={(el) => { if (el) refs.current.set(`opener:${chapter.id}`, el) }}>
            {getChapterNumberLabel(theme, chapterIndex) !== null && (
              <p
                className="font-medium uppercase"
                style={{
                  // `chapterOpenerMetrics.ts` — shared with Page.tsx and the
                  // PDF exporter, which all have to agree.
                  fontSize: CHAPTER_OPENER.label.fontPx,
                  lineHeight: `${CHAPTER_OPENER.label.lineHeightPx}px`,
                  paddingBottom: CHAPTER_OPENER.label.afterPx,
                  letterSpacing: `${CHAPTER_OPENER.label.letterSpacingEm}em`,
                  color: theme.page.accent,
                  fontFamily: theme.fonts.heading,
                }}
              >
                {getChapterNumberLabel(theme, chapterIndex)}
              </p>
            )}
            <h1
              className=""
              style={{
                fontSize: CHAPTER_OPENER.title.fontPx,
                lineHeight: `${CHAPTER_OPENER.title.lineHeightPx}px`,
                paddingBottom: CHAPTER_OPENER.title.afterPx,
                fontFamily: theme.fonts.heading,
                fontWeight: theme.typography.headingWeight,
                color: theme.page.ink,
              }}
            >
              {chapter.title}
            </h1>
          </div>
          {chapter.blocks.map((block) => (
            <div key={block.id} ref={(el) => { if (el) refs.current.set(block.id, el) }}>
              <BlockContent block={block} theme={theme} dropCap={dropCapBlockIds.has(block.id)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Memoised, because this renders every block in the book off-screen and
 * nothing above it should be able to make it do that again for free.
 *
 * Honest scope: this was tried first as a fix for the structural-page freeze
 * and it barely moved the number (4,340ms -> 3,986ms on a 1,700-block book).
 * The freeze was an unbounded DOM, not React render work — see
 * `LazySpread.tsx` for the measurements that settled it. This stays because
 * re-rendering a thousand `BlockContent` subtrees on a parent render that
 * cannot change a single measured height is still waste, not because it is
 * what fixed anything.
 *
 * Every prop here is already reference-stable between real changes —
 * `manuscript.chapters`, a memoised `pageBox`, `resolveTheme`'s cached
 * object, a memoised Set, a string, and `setHeights` — so the default
 * shallow comparison is exactly right, and measurement still reruns whenever
 * `measureKey` or the content width genuinely change.
 */
export const HeightMeasurer = memo(HeightMeasurerImpl)

import { useLayoutEffect, useRef } from 'react'

import type { Chapter } from '@/types/content'
import type { ResolvedBookTheme } from '@/theme/presets'
import { BlockContent } from '@/renderer/BlockContent'

interface HeightMeasurerProps {
  chapters: Chapter[]
  contentWidthPx: number
  theme: ResolvedBookTheme
  dropCapBlockIds: Set<string>
  /** Recomputed whenever any of these change; identity-stable between. */
  measureKey: string
  onMeasured: (heights: Record<string, number>) => void
}

/**
 * Renders every block off-screen, at the real page content width and
 * theme typography, purely to read back each block's true rendered
 * height. This is what lets the layout engine be text-flow-accurate
 * instead of guessing — the same `BlockContent` component used for real
 * pages is used here, so measurement and final render can never disagree.
 */
export function HeightMeasurer({ chapters, contentWidthPx, theme, dropCapBlockIds, measureKey, onMeasured }: HeightMeasurerProps) {
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
      {chapters.flatMap((chapter) =>
        chapter.blocks.map((block) => (
          <div key={block.id} ref={(el) => { if (el) refs.current.set(block.id, el) }}>
            <BlockContent block={block} theme={theme} dropCap={dropCapBlockIds.has(block.id)} />
          </div>
        )),
      )}
    </div>
  )
}

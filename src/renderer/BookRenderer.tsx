import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import type { Project } from '@/types'
import type { Manuscript } from '@/types/content'
import { useUiStore } from '@/store/uiStore'
import { computePageBox } from '@/renderer/pageGeometry'
import { resolveTheme } from '@/theme/presets'
import { paginate, type LaidOutPage } from '@/renderer/paginate'
import { HeightMeasurer } from '@/renderer/HeightMeasurer'
import { LazySpread } from '@/renderer/LazySpread'
import { ThumbnailRail } from '@/renderer/ThumbnailRail'
import { useExportStore } from '@/store/exportStore'
import { useContentStore } from '@/store/contentStore'
import { useSelectionStore } from '@/store/selectionStore'

interface BookRendererProps {
  project: Project
  manuscript: Manuscript
}

function groupIntoSpreads(pages: LaidOutPage[]): LaidOutPage[][] {
  if (pages.length === 0) return []
  const spreads: LaidOutPage[][] = [[pages[0]]]
  for (let i = 1; i < pages.length; i += 2) {
    spreads.push(pages.slice(i, i + 2))
  }
  return spreads
}

export function BookRenderer({ project, manuscript }: BookRendererProps) {
  const theme = resolveTheme(project.settings.themeId)
  const pageBox = useMemo(() => computePageBox(project.settings), [project.settings])
  const viewMode = useUiStore((s) => s.viewMode)
  const zoom = useUiStore((s) => s.zoom)
  const showThumbnails = useUiStore((s) => s.showThumbnails)

  const dropCapBlockIds = useMemo(() => {
    const ids = new Set<string>()
    if (!theme.typography.dropCap) return ids
    for (const chapter of manuscript.chapters) {
      const first = chapter.blocks.find((b) => b.type === 'paragraph')
      if (first) ids.add(first.id)
    }
    return ids
  }, [manuscript, theme.typography.dropCap])

  // Bumped by contentStore on every updateBlock/renameChapter/setManuscript
  // call for this project — folding it into measureKey is what makes an
  // inline text edit actually trigger remeasurement + repagination instead
  // of silently keeping a block's stale cached height (see contentStore.ts).
  const contentRevision = useContentStore((s) => s.revisionByProject[project.id] ?? 0)

  const [heights, setHeights] = useState<Record<string, number> | null>(null)
  const measureKey = `${project.settings.themeId}-${Math.round(pageBox.contentWidthPx)}-${manuscript.importedAt}-${contentRevision}`

  const { pages, toc } = useMemo(() => {
    if (!heights) return { pages: [] as LaidOutPage[], toc: [] }
    return paginate(manuscript.chapters, (b) => heights[b.id] ?? 24, pageBox.contentHeightPx, theme.chapterOpener.topSpacer)
  }, [heights, manuscript, pageBox.contentHeightPx, theme.chapterOpener.topSpacer])

  const spreads = useMemo(() => (viewMode === 'spread' ? groupIntoSpreads(pages) : pages.map((p) => [p])), [pages, viewMode])

  const setExportLayout = useExportStore((s) => s.setLayout)
  useEffect(() => {
    if (pages.length > 0) setExportLayout(project.id, { pages, toc, pageBox, theme })
  }, [pages, toc, pageBox, theme, project.id, setExportLayout])

  // Sidebar's chapter nav can't just scrollIntoView `[data-chapter-start]`
  // directly: LazySpread doesn't mount a spread's real pages until it's
  // scrolled near the viewport, so a chapter further down the book may have
  // no such DOM node yet — that's why chapter clicks used to silently do
  // nothing some of the time. Force-mount the target spread first, then
  // scroll once it's actually in the DOM.
  const [forcedSpreadIndices, setForcedSpreadIndices] = useState<Set<number>>(() => new Set())
  const scrollRequest = useSelectionStore((s) => s.scrollRequest)
  const consumeScrollRequest = useSelectionStore((s) => s.consumeScrollRequest)
  const scrollRequestRef = useRef(scrollRequest)
  scrollRequestRef.current = scrollRequest

  useEffect(() => {
    if (!scrollRequest) return
    const { target } = scrollRequest
    const spreadIndex = spreads.findIndex((spread) =>
      spread.some((page) =>
        target.type === 'chapter'
          ? page.kind === 'chapter-start' && page.chapterId === target.chapterId
          : page.id === target.pageId,
      ),
    )
    if (spreadIndex === -1) {
      consumeScrollRequest()
      return
    }
    setForcedSpreadIndices((prev) => (prev.has(spreadIndex) ? prev : new Set(prev).add(spreadIndex)))

    // Wait a couple of paints so the forced spread's real <Page> (and the
    // DOM node we're about to look up) actually exists before we scroll.
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el =
          target.type === 'chapter'
            ? document.querySelector(`[data-chapter-start="${target.chapterId}"]`)
            : document.getElementById(`page-${target.pageId}`)
        el?.scrollIntoView({ behavior: 'smooth', block: target.type === 'chapter' ? 'start' : 'center' })
        // Only clear the request if nothing newer has come in while we waited.
        if (scrollRequestRef.current?.requestId === scrollRequest.requestId) consumeScrollRequest()
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [scrollRequest, spreads, consumeScrollRequest])

  return (
    <div className="flex min-h-0 flex-1">
      <HeightMeasurer
        chapters={manuscript.chapters}
        contentWidthPx={pageBox.contentWidthPx}
        theme={theme}
        dropCapBlockIds={dropCapBlockIds}
        measureKey={measureKey}
        onMeasured={setHeights}
      />

      {showThumbnails && pages.length > 0 && (
        <ThumbnailRail pages={pages} pageBox={pageBox} theme={theme} />
      )}

      <div className="flex flex-1 items-start justify-center overflow-auto px-10 py-10">
        {!heights ? (
          <div className="flex flex-col items-center gap-3 pt-24 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            <Loader2 className="size-5 animate-spin" />
            Laying out your book…
          </div>
        ) : (
          <div style={{ zoom }} className="flex flex-col items-center gap-10">
            {spreads.map((spread, i) => (
              <LazySpread
                key={i}
                projectId={project.id}
                spread={spread}
                pageBox={pageBox}
                theme={theme}
                dropCapBlockIds={dropCapBlockIds}
                toc={toc}
                bookTitle={project.name}
                language={project.settings.language}
                forceVisible={forcedSpreadIndices.has(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

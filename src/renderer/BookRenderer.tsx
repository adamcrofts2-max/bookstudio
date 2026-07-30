import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import type { Project } from '@/types'
import type { Manuscript } from '@/types/content'
import { useUiStore } from '@/store/uiStore'
import { computePageBox } from '@/renderer/pageGeometry'
import { resolveTheme } from '@/theme/presets'
import { paginate, type LaidOutPage } from '@/renderer/paginate'
import { HeightMeasurer } from '@/renderer/HeightMeasurer'
import { Page } from '@/renderer/Page'
import { ThumbnailRail } from '@/renderer/ThumbnailRail'

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

  const [heights, setHeights] = useState<Record<string, number> | null>(null)
  const measureKey = `${project.settings.themeId}-${Math.round(pageBox.contentWidthPx)}-${manuscript.importedAt}`

  const { pages, toc } = useMemo(() => {
    if (!heights) return { pages: [] as LaidOutPage[], toc: [] }
    return paginate(manuscript.chapters, (b) => heights[b.id] ?? 24, pageBox.contentHeightPx, theme.chapterOpener.topSpacer)
  }, [heights, manuscript, pageBox.contentHeightPx, theme.chapterOpener.topSpacer])

  const spreads = useMemo(() => (viewMode === 'spread' ? groupIntoSpreads(pages) : pages.map((p) => [p])), [pages, viewMode])

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
              <div key={i} className="flex gap-px">
                {spread.map((page) => (
                  <Page key={page.id} page={page} pageBox={pageBox} theme={theme} dropCapBlockIds={dropCapBlockIds} toc={toc} bookTitle={project.name} language={project.settings.language} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

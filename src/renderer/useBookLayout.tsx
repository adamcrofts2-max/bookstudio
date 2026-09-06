import { useEffect, useMemo, useState, type ReactElement } from 'react'

import type { Project } from '@/types'
import { useContentStore } from '@/store/contentStore'
import { useExportStore } from '@/store/exportStore'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { computePageBox, type PageBox } from '@/renderer/pageGeometry'
import { resolveTheme, type ResolvedBookTheme } from '@/theme/presets'
import { paginate, type LaidOutPage, type TocEntry } from '@/renderer/paginate'
import { composeBookPages } from '@/renderer/composePages'
import { HeightMeasurer } from '@/renderer/HeightMeasurer'

export interface BookLayout {
  pages: LaidOutPage[]
  toc: TocEntry[]
  pageBox: PageBox
  theme: ResolvedBookTheme
  dropCapBlockIds: Set<string>
  /** True once real measured heights have produced a paginated book. */
  ready: boolean
  /**
   * Must be rendered by the caller. Measurement happens in the DOM — a
   * paragraph's height is whatever the browser says it is at this trim size
   * and this typeface — so there is no way to lay a book out without putting
   * it on the page first. `HeightMeasurer` does that off-screen.
   */
  measurer: ReactElement
}

/**
 * Measure, paginate, compose, and publish a book's layout.
 *
 * Extracted from `MobilePreviewView` because being trapped inside that
 * component was a real defect, not a tidiness problem: PDF export renders
 * `exportStore`'s layout rather than deriving its own (that is what keeps the
 * PDF identical to the preview), and nothing else on mobile ever populated
 * it. So the More tab had to tell people **"Open Preview once to lay the book
 * out first"** — an app asking its user to perform a ritual to work around
 * where a component happens to be mounted.
 *
 * None of this work needs anything to be visible. `HeightMeasurer` renders
 * off-screen, `paginate` and `composeBookPages` are pure. The only thing that
 * ever tied it to the Preview tab was where it was written.
 */
export function useBookLayout(project: Project): BookLayout {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const contentRevision = useContentStore((s) => s.revisionByProject[project.id] ?? 0)
  const structuralPages = useStructuralPageStore((s) => s.byProject[project.id] ?? EMPTY_STRUCTURAL_PAGES)

  const theme = resolveTheme(project.settings.themeId)
  const pageBox = useMemo(() => computePageBox(project.settings), [project.settings])
  const chapters = useMemo(() => manuscript?.chapters ?? [], [manuscript])

  const dropCapBlockIds = useMemo(() => {
    const ids = new Set<string>()
    if (!theme.typography.dropCap) return ids
    for (const chapter of chapters) {
      const first = chapter.blocks.find((b) => b.type === 'paragraph')
      if (first) ids.add(first.id)
    }
    return ids
  }, [chapters, theme.typography.dropCap])

  const [heights, setHeights] = useState<Record<string, number> | null>(null)
  // Folding in the content revision is what makes an edit made elsewhere
  // actually repaginate rather than reusing stale cached heights.
  const measureKey = `${project.settings.themeId}-${Math.round(pageBox.contentWidthPx)}-${manuscript?.importedAt ?? ''}-${contentRevision}`

  const { pages: paginatedPages, toc } = useMemo(() => {
    if (!heights) return { pages: [] as LaidOutPage[], toc: [] as TocEntry[] }
    return paginate(
      chapters,
      (b) => heights[b.id] ?? 24,
      pageBox.contentHeightPx,
      theme.chapterOpener.topSpacer,
      (chapter) => heights[`opener:${chapter.id}`] ?? 0,
    )
  }, [heights, chapters, pageBox.contentHeightPx, theme.chapterOpener.topSpacer])

  const frontMatter = useMemo(
    () => structuralPages.filter((p) => p.category === 'front-matter').sort((a, b) => a.order - b.order),
    [structuralPages],
  )
  const backMatter = useMemo(
    () => structuralPages.filter((p) => p.category === 'back-matter').sort((a, b) => a.order - b.order),
    [structuralPages],
  )
  const pages = useMemo(
    () => composeBookPages(frontMatter, paginatedPages, backMatter),
    [frontMatter, paginatedPages, backMatter],
  )

  // Publishes exactly what was laid out, mirroring `BookRenderer`'s own
  // effect — populating export from the same pagination is what keeps the
  // exported file identical to the preview.
  const setExportLayout = useExportStore((s) => s.setLayout)
  useEffect(() => {
    if (pages.length > 0) setExportLayout(project.id, { pages, toc, pageBox, theme, blockHeights: heights ?? {} })
  }, [pages, toc, pageBox, theme, heights, project.id, setExportLayout])

  const measurer = (
    <HeightMeasurer
      chapters={chapters}
      contentWidthPx={pageBox.contentWidthPx}
      theme={theme}
      dropCapBlockIds={dropCapBlockIds}
      measureKey={measureKey}
      onMeasured={setHeights}
    />
  )

  return { pages, toc, pageBox, theme, dropCapBlockIds, ready: pages.length > 0, measurer }
}

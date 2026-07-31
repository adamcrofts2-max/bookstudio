import { useMemo } from 'react'

import { useContentStore } from '@/store/contentStore'
import { useExportStore } from '@/store/exportStore'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { EMPTY_ASSETS, useAssetStore } from '@/store/assetStore'
import { checkExportReadiness, hasBlockingReadinessIssues } from '@/virtualEditor/exportReadiness'
import type { CheckerContext } from '@/virtualEditor/types'
import type { Project } from '@/types'

/**
 * Builds the same `CheckerContext` shape `VirtualEditorWorkspace.tsx`
 * assembles for a full review — manuscript, project, structural pages,
 * assets, and (if the manuscript view has rendered this session) real
 * paginated `pages` — and runs only the print-readiness/commercial-quality
 * checkers against it (see `exportReadiness.ts`). Used by the Export
 * button to warn before shipping a file that would fail a print-on-demand
 * platform's own validation (or simply look unfinished as an ebook).
 */
export function useExportReadiness(project: Project) {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const pages = useExportStore((s) => s.byProject[project.id]?.pages)
  const structuralPages = useStructuralPageStore((s) => s.byProject[project.id]) ?? EMPTY_STRUCTURAL_PAGES
  const assets = useAssetStore((s) => s.byProject[project.id]) ?? EMPTY_ASSETS

  const findings = useMemo(() => {
    if (!manuscript) return []
    const ctx: CheckerContext = { manuscript, project, structuralPages, assets, pages }
    return checkExportReadiness(ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manuscript, project, structuralPages, assets, pages])

  return { findings, hasBlockingIssues: hasBlockingReadinessIssues(findings) }
}

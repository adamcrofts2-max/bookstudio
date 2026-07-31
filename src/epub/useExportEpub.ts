import { useState } from 'react'

import { useContentStore } from '@/store/contentStore'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { saveBlob } from '@/utils/saveBlob'
import type { Project } from '@/types'

/**
 * Drives the "Export EPUB" toolbar action — same shape as
 * `pdf/useExportPdf.ts`'s hook, but reads the raw manuscript/structural
 * pages directly instead of `useExportStore`'s paginated `layout`, since
 * EPUB export never needs pagination (see `exportEpub.ts`'s own doc
 * comment). `canExport` only requires a manuscript to exist, so — unlike
 * PDF export — EPUB export works even before the manuscript workspace has
 * rendered this session.
 */
export function useExportEpub(project: Project) {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const structuralPages = useStructuralPageStore((s) => s.byProject[project.id]) ?? EMPTY_STRUCTURAL_PAGES
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canExport = Boolean(manuscript)

  const runExport = async () => {
    if (!manuscript) return
    setBusy(true)
    setError(null)
    try {
      const { exportBookToEpub } = await import('@/epub/exportEpub')
      const blob = await exportBookToEpub(manuscript, structuralPages, project, project.name)
      const fileName = `${project.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'book'}.epub`
      await saveBlob(blob, fileName, 'EPUB Book', 'application/epub+zip', '.epub')
    } catch (err) {
      console.error(err)
      setError('Export failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return { canExport, busy, error, runExport }
}

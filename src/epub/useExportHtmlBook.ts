import { useState } from 'react'

import { useContentStore } from '@/store/contentStore'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { saveBlob } from '@/utils/saveBlob'
import type { Project } from '@/types'

/** Drives the "Export HTML" toolbar action — same shape as
 * `epub/useExportEpub.ts`, producing a single self-contained `.html` file
 * via `exportHtmlBook.ts`. */
export function useExportHtmlBook(project: Project) {
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
      const { exportBookToHtml } = await import('@/epub/exportHtmlBook')
      const blob = await exportBookToHtml(manuscript, structuralPages, project, project.name)
      const fileName = `${project.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'book'}.html`
      await saveBlob(blob, fileName, 'Web Book (HTML)', 'text/html', '.html')
    } catch (err) {
      console.error(err)
      setError('Export failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return { canExport, busy, error, runExport }
}

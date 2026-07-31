import { useState } from 'react'

import { useExportStore } from '@/store/exportStore'
import { saveBlob } from '@/utils/saveBlob'
import type { Project } from '@/types'

/** Drives the "Export PDF" toolbar action: takes whatever `BookRenderer`
 * currently has laid out (see `exportStore`) and renders it to a
 * print-ready PDF via `exportBookToPdf`. */
export function useExportPdf(project: Project) {
  const layout = useExportStore((s) => s.byProject[project.id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canExport = Boolean(layout)

  const runExport = async () => {
    if (!layout) return
    setBusy(true)
    setError(null)
    try {
      const { exportBookToPdf } = await import('@/pdf/exportPdf')
      const blob = await exportBookToPdf(layout, project.name, project.settings, project.id)
      const fileName = `${project.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'book'}.pdf`
      await saveBlob(blob, fileName, 'PDF Document', 'application/pdf', '.pdf')
    } catch (err) {
      console.error(err)
      setError('Export failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return { canExport, busy, error, runExport }
}

import { useState } from 'react'

import { useExportStore } from '@/store/exportStore'
import type { Project } from '@/types'

interface FilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>
}

async function saveBlob(blob: Blob, suggestedName: string) {
  const win = window as FilePickerWindow
  if (win.showSaveFilePicker) {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Fall through to the anchor-download fallback below.
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

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
      const blob = await exportBookToPdf(layout, project.name, project.settings)
      const fileName = `${project.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'book'}.pdf`
      await saveBlob(blob, fileName)
    } catch (err) {
      console.error(err)
      setError('Export failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return { canExport, busy, error, runExport }
}

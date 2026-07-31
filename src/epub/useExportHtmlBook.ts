import { useState } from 'react'

import { useContentStore } from '@/store/contentStore'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
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
        types: [{ description: 'Web Book (HTML)', accept: { 'text/html': ['.html'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
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

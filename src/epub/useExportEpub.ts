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

async function saveBlob(blob: Blob, suggestedName: string, description: string, mimeType: string, extension: string) {
  const win = window as FilePickerWindow
  if (win.showSaveFilePicker) {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName,
        types: [{ description, accept: { [mimeType]: [extension] } }],
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

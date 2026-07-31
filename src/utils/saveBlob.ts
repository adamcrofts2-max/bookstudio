interface FilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>
}

/**
 * Saves `blob` to the user's computer: the native save dialog
 * (`showSaveFilePicker`) where the browser supports it, falling back to an
 * anchor-tag download everywhere else (Safari doesn't implement the File
 * System Access API). Shared by every export path that produces a
 * downloadable file — PDF (`pdf/useExportPdf.ts`), EPUB
 * (`epub/useExportEpub.ts`), single-file HTML (`epub/useExportHtmlBook.ts`)
 * and the project-file save/load feature
 * (`projectFile/useExportProjectFile.ts`, Phase 51) — previously each of
 * the first three kept its own near-identical copy of this function; this
 * is that logic in one place instead of four.
 */
export async function saveBlob(blob: Blob, suggestedName: string, description: string, mimeType: string, extension: string) {
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

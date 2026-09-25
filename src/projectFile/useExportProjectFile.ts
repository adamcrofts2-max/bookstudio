import { useState } from 'react'

import { readProjectFileSource, projectFileName } from '@/projectFile/readProjectFileSource'
import { saveBlob } from '@/utils/saveBlob'
import { PROJECT_FILE_EXTENSION } from '@/types/projectFile'
import type { Project } from '@/types'

/**
 * Drives the "Save project file" action — bundles the whole project
 * (manuscript, structural pages, notes, custom theme, image assets, Layer 0's
 * planning bible) into a single `.bookstudio` archive via
 * `exportProjectFile.ts` and saves it to the user's computer via the shared
 * `saveBlob` helper, same shape as `pdf/useExportPdf.ts`/`epub/useExportEpub.ts`.
 * Unlike those, `canExport` only requires the project to exist — even a
 * brand-new, empty project is worth being able to save and resume later.
 *
 * What goes *into* the bundle is `readProjectFileSource`'s business, shared
 * with the automatic backup (Phase 158) so the two can never drift apart.
 */
export function useExportProjectFile(project: Project) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runExport = async () => {
    setBusy(true)
    setError(null)
    try {
      const { buildProjectFile } = await import('@/projectFile/exportProjectFile')
      const blob = await buildProjectFile(readProjectFileSource(project))
      await saveBlob(blob, projectFileName(project, PROJECT_FILE_EXTENSION), 'Book Studio Project', 'application/zip', PROJECT_FILE_EXTENSION)
    } catch (err) {
      console.error(err)
      setError('Save failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, runExport }
}

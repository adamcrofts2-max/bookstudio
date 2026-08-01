import { useState } from 'react'

import { useContentStore } from '@/store/contentStore'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { EMPTY_NOTES, useNotesStore } from '@/store/notesStore'
import { EMPTY_ASSETS, useAssetStore } from '@/store/assetStore'
import { EMPTY_LAYER0_BIBLE, useLayer0Store } from '@/store/layer0Store'
import { useCustomThemeStore } from '@/store/customThemeStore'
import { getAssetBlob } from '@/store/assetDb'
import { saveBlob } from '@/utils/saveBlob'
import { PROJECT_FILE_EXTENSION } from '@/types/projectFile'
import type { Project } from '@/types'

/**
 * Drives the "Save to file" toolbar action — bundles the whole project
 * (manuscript, structural pages, notes, custom theme, image assets, Layer 0's
 * planning bible) into a single `.bookstudio` archive via
 * `exportProjectFile.ts` and saves it to the user's computer via the shared
 * `saveBlob` helper, same shape as `pdf/useExportPdf.ts`/`epub/useExportEpub.ts`.
 * Unlike those, `canExport` only requires the project to exist — even a
 * brand-new, empty project is worth being able to save and resume later.
 */
export function useExportProjectFile(project: Project) {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const structuralPages = useStructuralPageStore((s) => s.byProject[project.id]) ?? EMPTY_STRUCTURAL_PAGES
  const notes = useNotesStore((s) => s.byProject[project.id]) ?? EMPTY_NOTES
  const assets = useAssetStore((s) => s.byProject[project.id]) ?? EMPTY_ASSETS
  const layer0Bible = useLayer0Store((s) => s.byProject[project.id]) ?? EMPTY_LAYER0_BIBLE
  const customThemes = useCustomThemeStore((s) => s.customThemes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runExport = async () => {
    setBusy(true)
    setError(null)
    try {
      const { buildProjectFile } = await import('@/projectFile/exportProjectFile')
      const customTheme = customThemes.find((t) => t.id === project.settings.themeId) ?? null
      const blob = await buildProjectFile({
        project,
        manuscript: manuscript ?? { chapters: [], importedAt: new Date().toISOString(), sourceFileName: '' },
        structuralPages,
        notes,
        customTheme,
        assets,
        getAssetBlob,
        layer0Bible,
      })
      const fileName = `${project.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'book'}${PROJECT_FILE_EXTENSION}`
      await saveBlob(blob, fileName, 'Book Studio Project', 'application/zip', PROJECT_FILE_EXTENSION)
    } catch (err) {
      console.error(err)
      setError('Save failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, runExport }
}

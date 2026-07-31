import { useState } from 'react'

import { useProjectStore } from '@/store/projectStore'
import { useContentStore } from '@/store/contentStore'
import { useStructuralPageStore } from '@/store/structuralPageStore'
import { useNotesStore } from '@/store/notesStore'
import { useCustomThemeStore } from '@/store/customThemeStore'
import { useAssetStore } from '@/store/assetStore'

/**
 * Drives "Load from file" (`Toolbar.tsx` and `ProjectsPage.tsx`, Phase 51):
 * parses a `.bookstudio` archive and writes it into every store it touches,
 * always as a brand-new project rather than overwriting anything already in
 * the library — see `importProjectFile.ts`'s `parseProjectFile` for the
 * archive-reading half.
 *
 * Deliberately mints a *fresh* project id (`projectStore.createProject`)
 * instead of reusing whatever id the file was originally exported under:
 * the same file could be imported twice, or into a browser that already has
 * a different project sitting at that id, and per-project data here is
 * keyed by id across five separate stores — reusing the original id risks
 * silently clobbering unrelated existing data in any one of them. Assets
 * are the one exception to "everything gets a fresh id": `assetStore.
 * restoreAsset` keeps each asset's own original id (only its `projectId`
 * field is re-pointed at the new project), because `ImageBlock.assetId`
 * references inside the imported manuscript/structural pages were captured
 * at export time and only keep resolving if the asset comes back under
 * that same id.
 */
export function useImportProjectFile() {
  const createProject = useProjectStore((s) => s.createProject)
  const updateProjectSettings = useProjectStore((s) => s.updateProjectSettings)
  const setManuscript = useContentStore((s) => s.setManuscript)
  const replaceAllPages = useStructuralPageStore((s) => s.replaceAllPages)
  const replaceAllNotes = useNotesStore((s) => s.replaceAllNotes)
  const importCustomTheme = useCustomThemeStore((s) => s.importCustomTheme)
  const restoreAsset = useAssetStore((s) => s.restoreAsset)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Returns the new project's id on success, or `undefined` on failure
   * (with `error` set to a message safe to show the user). */
  const runImport = async (file: File): Promise<string | undefined> => {
    setBusy(true)
    setError(null)
    try {
      const { parseProjectFile } = await import('@/projectFile/importProjectFile')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const bundle = await parseProjectFile(bytes)

      const project = createProject(bundle.manifest.project.name, bundle.manifest.project.category)
      updateProjectSettings(project.id, bundle.manifest.project.settings)
      setManuscript(project.id, bundle.manuscript)
      replaceAllPages(project.id, bundle.structuralPages)
      replaceAllNotes(project.id, bundle.notes)
      if (bundle.customTheme) importCustomTheme(bundle.customTheme)
      for (const { asset, blob } of bundle.assets) {
        await restoreAsset(project.id, { ...asset, projectId: project.id }, blob)
      }

      return project.id
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'This file could not be opened. It may be corrupt or not a Book Studio project file.')
      return undefined
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, runImport }
}

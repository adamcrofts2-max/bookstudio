import { useCallback } from 'react'

import { useProjectStore } from '@/store/projectStore'
import { stopBackingUp } from '@/projectFile/backupService'
import { useContentStore } from '@/store/contentStore'
import { useStructuralPageStore } from '@/store/structuralPageStore'
import { useNotesStore } from '@/store/notesStore'
import { useIdeaStore } from '@/store/ideaStore'
import { useLayer0Store } from '@/store/layer0Store'
import { useGraphLayoutStore } from '@/store/graphLayoutStore'
import { useVersionStore } from '@/store/versionStore'
import { useWritingSessionStore } from '@/store/writingSessionStore'
import { useExportStore } from '@/store/exportStore'
import { useHistoryStore } from '@/store/historyStore'
import { useVirtualEditorStore } from '@/store/virtualEditorStore'
import { useAssetStore } from '@/store/assetStore'

/**
 * Deletes a project and everything that belonged to it.
 *
 * `projectStore.deleteProject` removes the Layer 1 row and nothing else, by
 * design: a Layer 1 store must never reach into Layer 2's manuscript or
 * Layer 0's bible to mutate them (`docs/SYSTEM_ARCHITECTURE.md`). But
 * nothing was doing the rest of the work either, so a deleted book left its
 * manuscript, structural pages, notes, ideas, planning entities, graph
 * layout, snapshots, undo history, editorial report, writing sessions and
 * image blobs behind — keyed by an id that no longer appeared anywhere, so
 * nothing could ever name them to clean them up. Measured before this
 * existed (`scripts/e2e/projectDelete.e2e.mjs`): the sentence typed into a
 * deleted project was still sitting in `localStorage` afterwards. On a
 * browser's few-megabyte quota that is not untidiness — deleting books to
 * make room genuinely did nothing.
 *
 * So the coordination lives here instead, at the component layer, exactly
 * as `useImportProjectFile` already seeds those same layers one public
 * action at a time on the way in. This is the mirror of that hook.
 *
 * The manuscript is sacred right up until the user asks for it to be gone
 * (`ConfirmDialog` makes that ask explicit) — at which point leaving half of
 * it behind is its own kind of failure.
 */
export function useDeleteProject() {
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const clearContent = useContentStore((s) => s.clearProject)
  const clearStructuralPages = useStructuralPageStore((s) => s.clearProject)
  const clearNotes = useNotesStore((s) => s.clearProject)
  const clearIdeas = useIdeaStore((s) => s.clearProject)
  const clearLayer0 = useLayer0Store((s) => s.clearProject)
  const clearGraphLayout = useGraphLayoutStore((s) => s.clearProject)
  const clearVersions = useVersionStore((s) => s.clearProject)
  const clearWritingSessions = useWritingSessionStore((s) => s.clearProject)
  const clearExportLayout = useExportStore((s) => s.clearProject)
  const clearHistory = useHistoryStore((s) => s.clearProject)
  const clearVirtualEditor = useVirtualEditorStore((s) => s.clearProject)
  const clearAssets = useAssetStore((s) => s.clearProject)

  return useCallback(
    async (projectId: string) => {
      // The two IndexedDB-backed stores first, and awaited: they need the
      // project id to find their own rows, and `deleteProject` is what makes
      // that id unfindable. Reversing this order strands the blobs.
      await clearAssets(projectId)
      await clearVersions(projectId)
      // A third IndexedDB-backed store since Phase 158. Deleting the
      // project must drop its backup *target* — the handle to a file on
      // this computer — but never the file: that copy is the user's, and
      // it may be the only one left. Dropping the handle simply means the
      // app stops writing to it.
      await stopBackingUp(projectId)

      clearContent(projectId)
      clearStructuralPages(projectId)
      clearNotes(projectId)
      clearIdeas(projectId)
      clearLayer0(projectId)
      clearGraphLayout(projectId)
      clearWritingSessions(projectId)
      clearExportLayout(projectId)
      clearHistory(projectId)
      clearVirtualEditor(projectId)

      deleteProject(projectId)
    },
    [
      clearAssets,
      clearVersions,
      clearContent,
      clearStructuralPages,
      clearNotes,
      clearIdeas,
      clearLayer0,
      clearGraphLayout,
      clearWritingSessions,
      clearExportLayout,
      clearHistory,
      clearVirtualEditor,
      deleteProject,
    ],
  )
}

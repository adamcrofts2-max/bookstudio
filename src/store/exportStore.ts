import { create } from 'zustand'

import type { LaidOutPage, TocEntry } from '@/renderer/paginate'
import type { PageBox } from '@/renderer/pageGeometry'
import type { ResolvedBookTheme } from '@/theme/presets'

export interface ExportableLayout {
  pages: LaidOutPage[]
  toc: TocEntry[]
  pageBox: PageBox
  theme: ResolvedBookTheme
  /**
   * Every block's real rendered height on screen, in CSS px, keyed by block
   * id — `HeightMeasurer`'s output, the same numbers `paginate` used to
   * decide what fits on which page.
   *
   * Added Phase 162 so the PDF can flow blocks by the heights the author
   * was actually looking at. Each block type's `drawPdf` composes its own
   * spacing from hand-chosen point values, and Phase 159 found those
   * disagreed with the screen for every type it measured. Fixing them one
   * by one only works for types somebody remembered to measure; passing the
   * measured height through makes the flow agree by construction, for the
   * fourteen types that exist and any added later.
   */
  blockHeights: Record<string, number>
}

interface ExportStoreState {
  byProject: Record<string, ExportableLayout | undefined>
  setLayout: (projectId: string, layout: ExportableLayout) => void
  /** Drops everything this store holds for a project. Called only from
   * `useDeleteProject`. Not persisted, so this only matters within a
   * session — but a deleted project's layout lingering in memory is still a
   * deleted project's layout. */
  clearProject: (projectId: string) => void
}

/**
 * Mirrors whatever `BookRenderer` currently has on screen (the exact
 * paginated result, not a re-derivation) so PDF export is guaranteed
 * WYSIWYG. Ephemeral — never persisted, recomputed each session.
 */
export const useExportStore = create<ExportStoreState>()((set) => ({
  byProject: {},
  setLayout: (projectId, layout) => set((state) => ({ byProject: { ...state.byProject, [projectId]: layout } })),
  clearProject: (projectId) =>
    set((state) => {
      const nextByProject = { ...state.byProject }
      delete nextByProject[projectId]
      return { byProject: nextByProject }
    }),
}))

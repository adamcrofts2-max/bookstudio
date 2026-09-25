import { create } from 'zustand'

import type { LaidOutPage, TocEntry } from '@/renderer/paginate'
import type { BlockTypographyOverride } from '@/types/blockStyle'
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
  /**
   * Per-block typographic overrides (Phase 171), mirrored here for the same
   * reason `blockHeights` is: the exporter must draw from exactly what the
   * screen laid out, and reading a store directly would let the two drift
   * the moment anything published a layout from stale state.
   */
  blockStyles: Record<string, BlockTypographyOverride>
  /**
   * Where each paragraph's lines start on screen, in CSS px from the top of
   * the paragraph — `HeightMeasurer`'s per-line measurement (Phase 181).
   * The PDF exporter compares its own line count against this for every
   * paragraph it draws (`PdfLineCheck`), which turns "the browser and
   * `wrapRuns` agree" from a property of test fixtures into one checked on
   * every real export. Splitting paragraphs across pages
   * (`docs/LINE_LEVEL_FLOW_PLAN.md` milestone 2) needs exactly this data.
   * Optional: a layout published before the first line measurement lands
   * simply has nothing to compare against.
   */
  blockLineTops?: Record<string, number[]>
}

/** One paragraph whose line count differs between the screen and the PDF. */
export interface PdfLineMismatch {
  blockId: string
  pageNumber: number
  screenLines: number
  pdfLines: number
}

/**
 * The result of comparing every exported paragraph's PDF line count with
 * the screen's. A paragraph with *more* lines in print than on screen is the
 * dangerous direction: the exporter keeps its room, so everything below it
 * on the page sits lower than the author saw.
 */
export interface PdfLineCheck {
  checkedAt: string
  paragraphsCompared: number
  mismatches: PdfLineMismatch[]
}

interface ExportStoreState {
  byProject: Record<string, ExportableLayout | undefined>
  setLayout: (projectId: string, layout: ExportableLayout) => void
  /** The line check from the most recent PDF export of each project. */
  lineChecks: Record<string, PdfLineCheck | undefined>
  setLineCheck: (projectId: string, check: PdfLineCheck) => void
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
  lineChecks: {},
  setLineCheck: (projectId, check) => set((state) => ({ lineChecks: { ...state.lineChecks, [projectId]: check } })),
  clearProject: (projectId) =>
    set((state) => {
      const nextByProject = { ...state.byProject }
      delete nextByProject[projectId]
      const nextLineChecks = { ...state.lineChecks }
      delete nextLineChecks[projectId]
      return { byProject: nextByProject, lineChecks: nextLineChecks }
    }),
}))

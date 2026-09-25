import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { BlockTypographyOverride } from '@/types/blockStyle'
import { isDefaultOverride } from '@/types/blockStyle'

/**
 * Layer 3 (Theme) — per-block typographic overrides, keyed by project and
 * then by block id.
 *
 * Keyed by block id rather than stored on the block for the reason
 * `types/blockStyle.ts` sets out: the Content layer holds no styling. This
 * is the same shape `notesStore` uses to attach notes to blocks without the
 * manuscript ever learning that notes exist, and it has the same
 * consequence — the manuscript is untouched by a styling change, so a
 * theme switch, a re-import or an undo of a *content* edit can never lose
 * one, and nothing here can ever corrupt a manuscript.
 *
 * `localStorage`, like every other small per-project map here: an override
 * is two numbers, and a book with a hundred of them is a few kilobytes.
 */
interface BlockStyleState {
  byProject: Record<string, Record<string, BlockTypographyOverride>>
}

interface BlockStyleActions {
  getOverrides: (projectId: string) => Record<string, BlockTypographyOverride>
  getOverride: (projectId: string, blockId: string) => BlockTypographyOverride | undefined
  setOverride: (projectId: string, blockId: string, override: BlockTypographyOverride) => void
  clearOverride: (projectId: string, blockId: string) => void
}

/** One stable identity, so a selector for a project with no overrides
 * doesn't hand React a fresh object on every render. */
export const EMPTY_BLOCK_STYLES: Record<string, BlockTypographyOverride> = {}

export const useBlockStyleStore = create<BlockStyleState & BlockStyleActions>()(
  persist(
    (set, get) => ({
      byProject: {},

      getOverrides: (projectId) => get().byProject[projectId] ?? EMPTY_BLOCK_STYLES,

      getOverride: (projectId, blockId) => get().byProject[projectId]?.[blockId],

      setOverride: (projectId, blockId, override) => {
        // An override equal to the theme is deleted, not stored: "has an
        // override" and "differs from the theme" must never drift apart, or
        // the Inspector would show a block as customised when it isn't.
        if (isDefaultOverride(override)) {
          get().clearOverride(projectId, blockId)
          return
        }
        set((state) => ({
          byProject: {
            ...state.byProject,
            [projectId]: { ...(state.byProject[projectId] ?? {}), [blockId]: override },
          },
        }))
      },

      clearOverride: (projectId, blockId) => {
        set((state) => {
          const forProject = state.byProject[projectId]
          if (!forProject || !(blockId in forProject)) return state
          const next = { ...forProject }
          delete next[blockId]
          return { byProject: { ...state.byProject, [projectId]: next } }
        })
      },
    }),
    { name: 'book-studio.block-styles', version: 1 },
  ),
)

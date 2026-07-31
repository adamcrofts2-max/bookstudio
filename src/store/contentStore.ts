import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Chapter, ContentBlock, Manuscript } from '@/types/content'
import { generateId } from '@/utils'

interface ContentStoreState {
  /** Manuscript per project id. Never imported by Theme/Layout/Rendering
   * code to mutate — they only ever read. */
  byProject: Record<string, Manuscript>
  /**
   * Bumped on every content-mutating action (`updateBlock`/`renameChapter`/
   * `setManuscript`) for a given project. A cheap "content changed" signal
   * downstream layers can fold into their own cache/memo keys without
   * deep-diffing or re-hashing the whole manuscript on every render.
   *
   * This exists to fix a real bug: `BookRenderer`'s `measureKey` used to be
   * built only from themeId/contentWidth/`manuscript.importedAt`, none of
   * which change when a block's text is edited via `updateBlock` — so an
   * edited block kept its stale (possibly now-wrong) cached height until
   * something else forced a full remeasure. Folding this counter into
   * `measureKey` makes every content edit reliably trigger remeasurement +
   * repagination. See `docs/STATUS.md`.
   */
  revisionByProject: Record<string, number>
}

interface ContentStoreActions {
  setManuscript: (projectId: string, manuscript: Manuscript) => void
  clearManuscript: (projectId: string) => void
  getManuscript: (projectId: string) => Manuscript | undefined
  /** The current content revision for a project — 0 if never touched. */
  getRevision: (projectId: string) => number
  updateBlock: (projectId: string, chapterId: string, blockId: string, updates: Partial<ContentBlock>) => void
  /**
   * Full (non-merging) block replacement — the undo half of
   * `editorActions.ts`'s `editBlock`, mirroring
   * `structuralPageStore.replacePageContent`'s fix exactly (see
   * docs/STATUS.md's Phase 20 entry for the original bug/fix writeup).
   * `updateBlock`'s shallow merge (`{ ...block, ...updates }`) is correct for
   * a live edit, but the same merge silently no-ops when undo tries to
   * restore a field from present back to *absent*: merging a snapshot
   * object that never had a given optional key at all (e.g. a block created
   * before that field was ever set) can't clear a key the current block
   * already has, since a merge only ever adds/overwrites keys, never
   * deletes them. `editBlock`'s undo needs the exact prior block object
   * restored wholesale, not merged — this is that.
   */
  replaceBlock: (projectId: string, chapterId: string, blockId: string, block: ContentBlock) => void
  renameChapter: (projectId: string, chapterId: string, title: string) => void
  /**
   * Inserts `block` into `chapterId`'s block list, immediately after the
   * block with id `afterBlockId` — or at index 0 if `afterBlockId` is
   * `null`. The only sanctioned way anything (e.g. drag-and-drop image
   * placement in `Page.tsx`) adds a new block to the manuscript; no other
   * layer reaches into `chapter.blocks` directly. Only the named chapter is
   * touched — every other chapter/project is left byte-for-byte alone.
   * Bumps `revisionByProject` exactly like `updateBlock`/`renameChapter`.
   */
  insertBlock: (projectId: string, chapterId: string, afterBlockId: string | null, block: ContentBlock) => void
  /**
   * Removes the block with id `blockId` from `chapterId`'s block list. The
   * only sanctioned way anything removes a block from the manuscript — no
   * other layer reaches into `chapter.blocks` directly. Only the named
   * chapter is touched; every other chapter/project is left byte-for-byte
   * alone. Bumps `revisionByProject` exactly like `updateBlock`/
   * `insertBlock`. There is no undo system yet, so callers (`ImagePanel.tsx`)
   * are expected to confirm with the user before calling this.
   */
  deleteBlock: (projectId: string, chapterId: string, blockId: string) => void
  /**
   * Removes every block whose id is in `blockIds` from `chapterId`'s block
   * list, in one commit (one `revisionByProject` bump, one history entry
   * upstream) rather than N separate `deleteBlock` calls. This is the
   * primitive behind "delete this page" for chapter-content/-start pages —
   * unlike a structural page, a content page has no single stored object to
   * delete; it's whichever blocks `paginate.ts` happened to flow onto it, so
   * deleting "the page" means bulk-deleting those blocks. See
   * `editorActions.ts`'s `deletePageBlocksWithHistory` and docs/STATUS.md.
   */
  deleteBlocks: (projectId: string, chapterId: string, blockIds: string[]) => void
  /**
   * Full (non-merging) replacement of an entire chapter's block list — the
   * undo half of `deletePageBlocksWithHistory`. Restoring the whole array in
   * one commit (rather than re-inserting each deleted block individually at
   * its own remembered position) keeps the deleted blocks' relative order
   * and position trivially correct regardless of how many were removed,
   * mirroring `replaceBlock`'s "full snapshot restore, not a merge" pattern.
   */
  replaceChapterBlocks: (projectId: string, chapterId: string, blocks: ContentBlock[]) => void
  /**
   * Deep-clones `blockId` (fresh id) and inserts the clone immediately after
   * the original within the same chapter. Mirrors
   * `structuralPageStore.duplicatePage`'s exact shape (read via `get()`, then
   * delegate to `insertBlock` — the "insert this exact object at this exact
   * position" primitive — rather than duplicating that splice logic here).
   * Returns the new block's id, or `undefined` if `blockId` doesn't exist.
   */
  duplicateBlock: (projectId: string, chapterId: string, blockId: string) => string | undefined
  /**
   * Simple adjacent-swap reorder within `chapterId`'s block list. No-ops at
   * a chapter boundary (first block can't move up, last can't move down) —
   * moving a block into an adjacent chapter is out of scope, mirrors
   * `structuralPageStore.movePage`'s within-category-only behaviour.
   */
  moveBlock: (projectId: string, chapterId: string, blockId: string, direction: 'up' | 'down') => void
}

export const useContentStore = create<ContentStoreState & ContentStoreActions>()(
  persist(
    (set, get) => ({
      byProject: {},
      revisionByProject: {},

      setManuscript: (projectId, manuscript) =>
        set((state) => ({
          byProject: { ...state.byProject, [projectId]: manuscript },
          revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
        })),

      clearManuscript: (projectId) =>
        set((state) => {
          const next = { ...state.byProject }
          delete next[projectId]
          return { byProject: next }
        }),

      getManuscript: (projectId) => get().byProject[projectId],

      getRevision: (projectId) => get().revisionByProject[projectId] ?? 0,

      updateBlock: (projectId, chapterId, blockId, updates) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters: Chapter[] = manuscript.chapters.map((chapter) => {
            if (chapter.id !== chapterId) return chapter
            return {
              ...chapter,
              blocks: chapter.blocks.map((block) =>
                block.id === blockId ? ({ ...block, ...updates } as ContentBlock) : block,
              ),
            }
          })
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },

      replaceBlock: (projectId, chapterId, blockId, block) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters: Chapter[] = manuscript.chapters.map((chapter) => {
            if (chapter.id !== chapterId) return chapter
            return {
              ...chapter,
              blocks: chapter.blocks.map((b) => (b.id === blockId ? block : b)),
            }
          })
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },

      renameChapter: (projectId, chapterId, title) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters = manuscript.chapters.map((c) => (c.id === chapterId ? { ...c, title } : c))
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },

      insertBlock: (projectId, chapterId, afterBlockId, block) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters: Chapter[] = manuscript.chapters.map((chapter) => {
            if (chapter.id !== chapterId) return chapter
            const afterIndex = afterBlockId === null ? -1 : chapter.blocks.findIndex((b) => b.id === afterBlockId)
            const insertAt = afterIndex === -1 ? 0 : afterIndex + 1
            const blocks = chapter.blocks.slice()
            blocks.splice(insertAt, 0, block)
            return { ...chapter, blocks }
          })
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },

      deleteBlock: (projectId, chapterId, blockId) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters: Chapter[] = manuscript.chapters.map((chapter) => {
            if (chapter.id !== chapterId) return chapter
            return { ...chapter, blocks: chapter.blocks.filter((b) => b.id !== blockId) }
          })
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },

      deleteBlocks: (projectId, chapterId, blockIds) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const idSet = new Set(blockIds)
          const chapters: Chapter[] = manuscript.chapters.map((chapter) => {
            if (chapter.id !== chapterId) return chapter
            return { ...chapter, blocks: chapter.blocks.filter((b) => !idSet.has(b.id)) }
          })
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },

      replaceChapterBlocks: (projectId, chapterId, blocks) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters: Chapter[] = manuscript.chapters.map((chapter) =>
            chapter.id === chapterId ? { ...chapter, blocks } : chapter,
          )
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },

      duplicateBlock: (projectId, chapterId, blockId) => {
        const manuscript = get().byProject[projectId]
        const chapter = manuscript?.chapters.find((c) => c.id === chapterId)
        const original = chapter?.blocks.find((b) => b.id === blockId)
        if (!original) return undefined
        const clone = { ...structuredClone(original), id: generateId('block') } as ContentBlock
        get().insertBlock(projectId, chapterId, blockId, clone)
        return clone.id
      },

      moveBlock: (projectId, chapterId, blockId, direction) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters: Chapter[] = manuscript.chapters.map((chapter) => {
            if (chapter.id !== chapterId) return chapter
            const index = chapter.blocks.findIndex((b) => b.id === blockId)
            if (index === -1) return chapter
            const swapIndex = direction === 'up' ? index - 1 : index + 1
            if (swapIndex < 0 || swapIndex >= chapter.blocks.length) return chapter // no-op at a chapter boundary
            const blocks = chapter.blocks.slice()
            ;[blocks[index], blocks[swapIndex]] = [blocks[swapIndex], blocks[index]]
            return { ...chapter, blocks }
          })
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },
    }),
    {
      name: 'book-studio.content',
      version: 1,
    },
  ),
)

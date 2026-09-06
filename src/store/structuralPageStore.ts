import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { StructuralPage, StructuralPageCategory, StructuralPageType } from '@/types/structuralPage'
import { getStructuralPageTypeDefinition } from '@/structuralPages/registry'
import { generateId } from '@/utils/id'

/** Stable empty reference for selectors — see `assetStore.ts`'s
 * `EMPTY_ASSETS` / `historyStore.ts`'s `EMPTY_HISTORY` for why: Zustand v5 +
 * `useSyncExternalStore` infinite-loops if a selector returns a fresh `[]`
 * literal on every call. */
export const EMPTY_STRUCTURAL_PAGES: readonly StructuralPage[] = []

interface StructuralPageStoreState {
  /**
   * Front-matter and back-matter structural pages per project, kept as one
   * flat array per project — front-matter pages stay ordered among
   * themselves and back-matter among themselves (each category is its own
   * independently-ordered list; `composeBookPages` reads the two filtered
   * slices separately). Defaults to `[]` per project — zero migration for
   * existing projects, per `CLAUDE.md`'s "optional field, default in code"
   * schema-evolution rule.
   */
  byProject: Record<string, StructuralPage[]>
  /** Bumped on every mutating action for a given project — same pattern as
   * `contentStore.revisionByProject` / `historyStore`. */
  revisionByProject: Record<string, number>
}

interface StructuralPageStoreActions {
  /** Drops everything this store holds for a project. Called only from
   * `useDeleteProject` — see that hook for why the coordination lives
   * outside the stores. */
  clearProject: (projectId: string) => void
  getPages: (projectId: string) => StructuralPage[]
  getPagesByCategory: (projectId: string, category: StructuralPageCategory) => StructuralPage[]
  getRevision: (projectId: string) => number
  /**
   * Creates a new page of `type` (content seeded from the registry's
   * `defaultContent()`) and inserts it into `category`'s slice, immediately
   * after `afterPageId` (or at the start of that category's slice when
   * `null`). Returns the new page's id.
   */
  insertPage: (projectId: string, category: StructuralPageCategory, type: StructuralPageType, afterPageId: string | null) => string
  /**
   * Low-level primitive: inserts an already-fully-formed `page` object
   * (exact id, exact content) into `category`'s slice, after `afterPageId`
   * (or at the start of that category's slice when `null`). Exists so
   * `editorActions.ts`'s history wrappers can restore an exact snapshot at
   * an exact position — undo of a delete, or redo of an insert/duplicate —
   * without generating a new id the way `insertPage`/`duplicatePage`
   * deliberately do for a fresh user-initiated add. Mirrors
   * `contentStore.insertBlock`'s "insert this exact object" contract.
   */
  insertPageAt: (projectId: string, category: StructuralPageCategory, page: StructuralPage, afterPageId: string | null) => void
  /** Deep-clones `pageId` (content and all) under a fresh id, inserted
   * immediately after the original within the same category. Returns the
   * new page's id, or `undefined` if `pageId` doesn't exist. */
  duplicatePage: (projectId: string, pageId: string) => string | undefined
  deletePage: (projectId: string, pageId: string) => void
  /** Simple adjacent-swap reorder within the page's own category — full
   * drag-and-drop is deferred to a later milestone (see
   * docs/MODULAR_PAGE_SYSTEM_PLAN.md). No-ops at the start/end of a
   * category. */
  movePage: (projectId: string, pageId: string, direction: 'up' | 'down') => void
  updatePageContent: (projectId: string, pageId: string, updates: Partial<StructuralPage['content']>) => void
  /**
   * Full (non-merging) content replacement — the undo half of
   * `editorActions.ts`'s `updatePageContentWithHistory`. `updatePageContent`'s
   * shallow merge is correct for a live edit (typing into one field must
   * never clobber sibling fields), but that same merge silently no-ops when
   * undo tries to restore a field from present back to absent: merging `{}`
   * into `{ text: 'x' }` leaves `text: 'x'` untouched, since a merge only
   * ever adds/overwrites keys, never deletes them. Undo needs the exact
   * prior `content` object restored wholesale, not merged — this is that.
   */
  replacePageContent: (projectId: string, pageId: string, content: StructuralPage['content']) => void
  /**
   * Wholesale replacement of every structural page for a project — mirrors
   * `contentStore.setManuscript`'s "bulk import, not a tracked edit" shape.
   * The only current caller is project-file import (Phase 51,
   * `projectFile/importProjectFile.ts`): unlike every other action here,
   * this isn't a user-initiated edit inside an already-open project, so it
   * deliberately isn't wrapped in `editorActions.ts`'s undo/redo history —
   * same reasoning as `setManuscript` not being history-tracked either.
   */
  replaceAllPages: (projectId: string, pages: StructuralPage[]) => void
}

function bumpRevision(state: StructuralPageStoreState, projectId: string): Record<string, number> {
  return { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 }
}

/**
 * Recomputes every page's `.order` field to match its index within its own
 * category slice — called after any structural mutation so `.order` never
 * drifts from actual array position.
 */
function renumberOrders(pages: StructuralPage[]): StructuralPage[] {
  const counters: Record<StructuralPageCategory, number> = { 'front-matter': 0, 'back-matter': 0 }
  return pages.map((p) => {
    const order = counters[p.category]
    counters[p.category] += 1
    return { ...p, order }
  })
}

function insertAtCategoryPosition(
  pages: StructuralPage[],
  category: StructuralPageCategory,
  page: StructuralPage,
  afterPageId: string | null,
): StructuralPage[] {
  let insertAt: number
  if (afterPageId === null) {
    // Start of this category's own slice: right before the first existing
    // page of that category, or at the end of the whole array if there is
    // none yet.
    const firstOfCategory = pages.findIndex((p) => p.category === category)
    insertAt = firstOfCategory === -1 ? pages.length : firstOfCategory
  } else {
    const afterIndex = pages.findIndex((p) => p.id === afterPageId)
    insertAt = afterIndex === -1 ? pages.length : afterIndex + 1
  }
  const next = pages.slice()
  next.splice(insertAt, 0, page)
  return next
}

export const useStructuralPageStore = create<StructuralPageStoreState & StructuralPageStoreActions>()(
  persist(
    (set, get) => ({
      byProject: {},
      revisionByProject: {},

      clearProject: (projectId) =>
        set((state) => {
          const nextByProject = { ...state.byProject }
          delete nextByProject[projectId]
          const nextRevisionByProject = { ...state.revisionByProject }
          delete nextRevisionByProject[projectId]
          return { byProject: nextByProject, revisionByProject: nextRevisionByProject }
        }),

      getPages: (projectId) => get().byProject[projectId] ?? EMPTY_STRUCTURAL_PAGES,
      getPagesByCategory: (projectId, category) =>
        (get().byProject[projectId] ?? EMPTY_STRUCTURAL_PAGES).filter((p) => p.category === category),
      getRevision: (projectId) => get().revisionByProject[projectId] ?? 0,

      insertPageAt: (projectId, category, page, afterPageId) => {
        set((state) => {
          const pages = state.byProject[projectId] ?? []
          const next = insertAtCategoryPosition(pages, category, page, afterPageId)
          return {
            byProject: { ...state.byProject, [projectId]: renumberOrders(next) },
            revisionByProject: bumpRevision(state, projectId),
          }
        })
      },

      insertPage: (projectId, category, type, afterPageId) => {
        const def = getStructuralPageTypeDefinition(type)
        const newPage = {
          id: generateId('spage'),
          category,
          order: 0, // corrected by renumberOrders inside insertPageAt
          type,
          content: def ? def.defaultContent() : {},
        } as StructuralPage
        get().insertPageAt(projectId, category, newPage, afterPageId)
        return newPage.id
      },

      duplicatePage: (projectId, pageId) => {
        const pages = get().byProject[projectId] ?? []
        const original = pages.find((p) => p.id === pageId)
        if (!original) return undefined
        const clone: StructuralPage = { ...structuredClone(original), id: generateId('spage') }
        get().insertPageAt(projectId, original.category, clone, pageId)
        return clone.id
      },

      deletePage: (projectId, pageId) => {
        set((state) => {
          const pages = state.byProject[projectId]
          if (!pages) return state
          const next = pages.filter((p) => p.id !== pageId)
          return {
            byProject: { ...state.byProject, [projectId]: renumberOrders(next) },
            revisionByProject: bumpRevision(state, projectId),
          }
        })
      },

      movePage: (projectId, pageId, direction) => {
        set((state) => {
          const pages = state.byProject[projectId]
          if (!pages) return state
          const page = pages.find((p) => p.id === pageId)
          if (!page) return state
          const sameCategory = pages.filter((p) => p.category === page.category)
          const idxInCategory = sameCategory.findIndex((p) => p.id === pageId)
          const swapIdxInCategory = direction === 'up' ? idxInCategory - 1 : idxInCategory + 1
          if (swapIdxInCategory < 0 || swapIdxInCategory >= sameCategory.length) return state // no-op at a category boundary
          const swapPage = sameCategory[swapIdxInCategory]
          const fullIdxA = pages.findIndex((p) => p.id === page.id)
          const fullIdxB = pages.findIndex((p) => p.id === swapPage.id)
          const next = pages.slice()
          ;[next[fullIdxA], next[fullIdxB]] = [next[fullIdxB], next[fullIdxA]]
          return {
            byProject: { ...state.byProject, [projectId]: renumberOrders(next) },
            revisionByProject: bumpRevision(state, projectId),
          }
        })
      },

      updatePageContent: (projectId, pageId, updates) => {
        set((state) => {
          const pages = state.byProject[projectId]
          if (!pages) return state
          const next = pages.map((p) => {
            if (p.id !== pageId) return p
            const merged = { ...p, content: { ...p.content, ...updates } } as StructuralPage
            // Mirror `ImageBlock.assetId`'s asset-reference tracking: if
            // this update touches an image-bearing page's `imageAssetId`
            // (Cover, Back Cover, About the Author — the three types with a
            // real image-drop UI, see `structuralPages/shared.tsx`'s
            // `StructuralImageDropZone`), keep `assets` in sync so future
            // asset-cleanup logic has something to check (see
            // docs/MODULAR_PAGE_SYSTEM_PLAN.md's `StructuralPage` shape /
            // this type's own doc comment).
            if ((merged.type === 'cover' || merged.type === 'back-cover' || merged.type === 'about-the-author') && 'imageAssetId' in updates) {
              const imageAssetId = (updates as { imageAssetId?: string }).imageAssetId
              return { ...merged, assets: imageAssetId ? [imageAssetId] : [] }
            }
            return merged
          })
          return {
            byProject: { ...state.byProject, [projectId]: next },
            revisionByProject: bumpRevision(state, projectId),
          }
        })
      },

      replacePageContent: (projectId, pageId, content) => {
        set((state) => {
          const pages = state.byProject[projectId]
          if (!pages) return state
          const next = pages.map((p) => {
            if (p.id !== pageId) return p
            const replaced = { ...p, content } as StructuralPage
            if (replaced.type === 'cover' || replaced.type === 'back-cover' || replaced.type === 'about-the-author') {
              const imageAssetId = (content as { imageAssetId?: string }).imageAssetId
              return { ...replaced, assets: imageAssetId ? [imageAssetId] : [] }
            }
            return replaced
          })
          return {
            byProject: { ...state.byProject, [projectId]: next },
            revisionByProject: bumpRevision(state, projectId),
          }
        })
      },
      replaceAllPages: (projectId, pages) => {
        set((state) => ({
          byProject: { ...state.byProject, [projectId]: renumberOrders(pages) },
          revisionByProject: bumpRevision(state, projectId),
        }))
      },
    }),
    {
      name: 'book-studio.structuralPages',
      version: 1,
    },
  ),
)

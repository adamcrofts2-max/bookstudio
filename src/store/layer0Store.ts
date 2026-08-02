import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { BaseLayer0Entity, Layer0Bible, TimelineEvent } from '@/types/layer0'

/**
 * Layer 0 (Planning) persistence — one `Layer0Bible` per project, the exact
 * same `byProject: Record<projectId, X>` shape every other per-project
 * store in this codebase already uses (`notesStore.ts`, `structuralPageStore
 * .ts`). Deliberately its own store, not folded into `contentStore`: Layer 0
 * is upstream of and structurally separate from Layer 2 (Content) — see
 * `types/layer0.ts`'s doc comment for the full one-way-boundary reasoning.
 */
export const EMPTY_LAYER0_BIBLE: Layer0Bible = {
  characters: [],
  locations: [],
  timelineEvents: [],
  glossaryTerms: [],
  references: [],
  illustrationBriefs: [],
  styleRules: [],
  researchNotes: [],
  relationships: [],
}

interface Layer0StoreState {
  byProject: Record<string, Layer0Bible>
}

interface Layer0StoreActions {
  getBible: (projectId: string) => Layer0Bible
  /** Low-level "insert this exact object" primitive — same naming/shape
   * convention as `notesStore.addNote`, so `editorActions.ts`'s history
   * wrapper can restore an exact snapshot at undo/redo without generating a
   * fresh id each time. Generic over `collection` rather than one function
   * per entity kind (`addCharacter`/`addLocation`/...) — eight near-
   * identical CRUD triplets would be exactly the duplicate logic
   * `CLAUDE.md`'s Code Standards ask to avoid; the generic signature keeps
   * every call site fully typed (`collection`'s literal type narrows
   * `entity`/`updates` automatically) with one implementation instead of
   * eight. */
  addEntity: <K extends keyof Layer0Bible>(projectId: string, collection: K, entity: Layer0Bible[K][number]) => void
  updateEntity: <K extends keyof Layer0Bible>(
    projectId: string,
    collection: K,
    id: string,
    updates: Partial<Layer0Bible[K][number]>,
  ) => void
  deleteEntity: <K extends keyof Layer0Bible>(projectId: string, collection: K, id: string) => void
  /** Wholesale replacement of one project's whole bible — reserved for a
   * future project-file import's bulk-load primitive, mirrors
   * `notesStore.replaceAllNotes`/`structuralPageStore.replaceAllPages`. Not
   * a tracked user edit, deliberately outside `editorActions.ts`'s
   * undo/redo history. Not wired into `exportProjectFile.ts`/
   * `importProjectFile.ts` yet — see `docs/STATUS.md`'s Phase F entry for
   * why that's a flagged, deliberate follow-up rather than an oversight. */
  replaceBible: (projectId: string, bible: Layer0Bible) => void
  /** `TimelineEvent`'s manual reorder — not part of the four generic CRUD
   * methods above since `order` only exists on this one collection, same
   * reasoning `structuralPageStore.movePage` (adjacent-swap-then-renumber
   * within a scope, there per category, here across the whole timeline)
   * isn't part of that store's own generic surface either. Swaps this event
   * with its immediate neighbour by *current `order`*, not array position —
   * the array itself isn't guaranteed sorted (`addEntity` always appends),
   * so sorting first is what makes "up"/"down" match what the UI displays. */
  moveTimelineEvent: (projectId: string, id: string, direction: 'up' | 'down') => void
}

type Layer0Store = Layer0StoreState & Layer0StoreActions

/** The four generic CRUD methods all touch an array keyed by a generic
 * `K extends keyof Layer0Bible` — TypeScript can't statically prove that
 * every `Layer0Bible[K]` element extends `BaseLayer0Entity` from inside a
 * function generic over `K` (that fact is only true because all eight
 * concrete collections happen to share that base, not something expressible
 * as a constraint on an indexed-access type). This narrow, local cast is the
 * accepted escape hatch for that gap — every public method signature above
 * stays fully generic and type-safe for callers; only this internal helper
 * needs to assert what's already true by construction. */
function asEntities(collection: unknown): BaseLayer0Entity[] {
  // Defensive `?? []`, not just a cast: a project bible persisted before a
  // given collection existed (this store predates `relationships`, Phase 99)
  // has that key simply absent from its stored object — `persist` doesn't
  // run a migration, it just rehydrates whatever shape was actually saved.
  // Every existing collection is always populated by the time a project is
  // created post-Phase-F, so this is a no-op for them; it's what stops
  // `addEntity`/`deleteEntity` on a brand-new collection from throwing
  // "cannot spread undefined" the first time it's touched on an old project.
  return (collection as BaseLayer0Entity[] | undefined) ?? []
}

export const useLayer0Store = create<Layer0Store>()(
  persist(
    (set, get) => ({
      byProject: {},

      getBible: (projectId) => {
        const bible = get().byProject[projectId] ?? EMPTY_LAYER0_BIBLE
        // Same missing-collection defence as `asEntities` below, but for
        // direct reads (`BookGraphView.tsx`/`EntityListPanel.tsx` read
        // `.relationships` straight off this, never through `addEntity`) —
        // returns the same object reference whenever the field is already
        // present, so this never causes an extra re-render for the common
        // case (every project created since Phase 99, or already touched
        // once this session).
        return bible.relationships ? bible : { ...bible, relationships: [] }
      },

      addEntity: (projectId, collection, entity) => {
        set((state) => {
          const bible = state.byProject[projectId] ?? EMPTY_LAYER0_BIBLE
          const nextCollection = [...asEntities(bible[collection]), entity]
          return { byProject: { ...state.byProject, [projectId]: { ...bible, [collection]: nextCollection } } }
        })
      },

      updateEntity: (projectId, collection, id, updates) => {
        set((state) => {
          const bible = state.byProject[projectId] ?? EMPTY_LAYER0_BIBLE
          const nextCollection = asEntities(bible[collection]).map((entity) =>
            entity.id === id ? { ...entity, ...updates, updatedAt: new Date().toISOString() } : entity,
          )
          return { byProject: { ...state.byProject, [projectId]: { ...bible, [collection]: nextCollection } } }
        })
      },

      deleteEntity: (projectId, collection, id) => {
        set((state) => {
          const bible = state.byProject[projectId] ?? EMPTY_LAYER0_BIBLE
          const nextCollection = asEntities(bible[collection]).filter((entity) => entity.id !== id)
          return { byProject: { ...state.byProject, [projectId]: { ...bible, [collection]: nextCollection } } }
        })
      },

      replaceBible: (projectId, bible) => {
        set((state) => ({ byProject: { ...state.byProject, [projectId]: bible } }))
      },

      moveTimelineEvent: (projectId, id, direction) => {
        set((state) => {
          const bible = state.byProject[projectId] ?? EMPTY_LAYER0_BIBLE
          const sorted = [...bible.timelineEvents].sort((a, b) => a.order - b.order)
          const idx = sorted.findIndex((event) => event.id === id)
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1
          if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return state // no-op at a boundary or missing id
          ;[sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]]
          const renumbered: TimelineEvent[] = sorted.map((event, i) => ({ ...event, order: i }))
          return { byProject: { ...state.byProject, [projectId]: { ...bible, timelineEvents: renumbered } } }
        })
      },
    }),
    {
      name: 'book-studio.layer0',
      version: 1,
    },
  ),
)

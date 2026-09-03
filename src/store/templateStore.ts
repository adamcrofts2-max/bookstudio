import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { BookTemplate } from '@/types/bookTemplate'
import { generateId } from '@/utils/id'

/**
 * Book templates — global, persisted, reusable across every project.
 *
 * Modelled directly on `customThemeStore`: same "global library the user
 * builds up, not per-project data" shape, same persistence, same
 * delete-without-confirmation convention as every other delete in this app.
 * A theme captures how the type and colour look; a template captures that
 * plus page setup and the whole structural-page set, which is what a series
 * actually needs to stay consistent.
 */
interface TemplateStoreState {
  templates: BookTemplate[]
}

interface TemplateStoreActions {
  getTemplates: () => BookTemplate[]
  getTemplate: (id: string) => BookTemplate | undefined
  /** Returns the new template's id so the caller can confirm which one was
   * just created. */
  addTemplate: (template: Omit<BookTemplate, 'id' | 'createdAt' | 'schemaVersion'>) => string
  renameTemplate: (id: string, name: string, description: string) => void
  deleteTemplate: (id: string) => void
}

/** Shared empty array so selectors never return a fresh `[]` literal.
 * Zustand v5 compares a selector's return value across calls to decide
 * whether to re-render; a new array every time never settles and re-renders
 * forever (see `docs/STATUS.md`'s post-deploy incident). */
export const EMPTY_TEMPLATES: BookTemplate[] = []

export const useTemplateStore = create<TemplateStoreState & TemplateStoreActions>()(
  persist(
    (set, get) => ({
      templates: EMPTY_TEMPLATES,

      getTemplates: () => get().templates,

      getTemplate: (id) => get().templates.find((t) => t.id === id),

      addTemplate: (template) => {
        const id = generateId('tpl')
        set((state) => ({
          templates: [
            ...state.templates,
            { ...template, id, schemaVersion: 1, createdAt: new Date().toISOString() },
          ],
        }))
        return id
      },

      renameTemplate: (id, name, description) => {
        set((state) => ({
          templates: state.templates.map((t) => (t.id === id ? { ...t, name, description } : t)),
        }))
      },

      deleteTemplate: (id) => {
        set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }))
      },
    }),
    {
      name: 'book-studio.templates',
      version: 1,
    },
  ),
)

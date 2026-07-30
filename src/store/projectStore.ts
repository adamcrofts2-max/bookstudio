import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Project, ProjectCategory, ProjectSettings } from '@/types'
import { DEFAULT_PROJECT_SETTINGS } from '@/types'
import { generateId } from '@/utils'

interface ProjectStoreState {
  projects: Project[]
  activeProjectId: string | null
}

interface ProjectStoreActions {
  createProject: (name: string, category?: ProjectCategory) => Project
  deleteProject: (id: string) => void
  renameProject: (id: string, name: string) => void
  updateProjectSettings: (id: string, partial: Partial<ProjectSettings>) => void
  setActiveProject: (id: string | null) => void
  getProject: (id: string) => Project | undefined
}

type ProjectStore = ProjectStoreState & ProjectStoreActions

/**
 * Layer 1 (Project) persistence.
 *
 * This store owns project metadata and settings only. It must never be
 * imported by content, theme, layout or rendering code that mutates
 * manuscript data — see docs/SYSTEM_ARCHITECTURE.md.
 */
export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      createProject: (name, category = 'other') => {
        const now = new Date().toISOString()
        const project: Project = {
          id: generateId('proj'),
          name: name.trim() || 'Untitled Book',
          category,
          createdAt: now,
          updatedAt: now,
          settings: { ...DEFAULT_PROJECT_SETTINGS },
        }
        set((state) => ({ projects: [project, ...state.projects] }))
        return project
      },

      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }))
      },

      renameProject: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, name: trimmed, updatedAt: new Date().toISOString() } : p,
          ),
        }))
      },

      updateProjectSettings: (id, partial) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id
              ? { ...p, settings: { ...p.settings, ...partial }, updatedAt: new Date().toISOString() }
              : p,
          ),
        }))
      },

      setActiveProject: (id) => set({ activeProjectId: id }),

      getProject: (id) => get().projects.find((p) => p.id === id),
    }),
    {
      name: 'book-studio.projects',
      version: 1,
    },
  ),
)

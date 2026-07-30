import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppearanceMode = 'light' | 'dark' | 'system'
export type InspectorTab = 'typography' | 'image' | 'page' | 'theme' | 'export' | 'book'

interface UiStoreState {
  appearance: AppearanceMode
  sidebarCollapsed: boolean
  inspectorCollapsed: boolean
  inspectorTab: InspectorTab
}

interface UiStoreActions {
  setAppearance: (mode: AppearanceMode) => void
  toggleSidebar: () => void
  toggleInspector: () => void
  setInspectorTab: (tab: InspectorTab) => void
}

/**
 * Application UI state — appearance (dark mode), panel visibility, etc.
 * Deliberately separate from `projectStore`: this is preference for the
 * app shell itself, not project data.
 */
export const useUiStore = create<UiStoreState & UiStoreActions>()(
  persist(
    (set) => ({
      appearance: 'system',
      sidebarCollapsed: false,
      inspectorCollapsed: false,
      inspectorTab: 'page',

      setAppearance: (mode) => set({ appearance: mode }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleInspector: () => set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),
      setInspectorTab: (tab) => set({ inspectorTab: tab }),
    }),
    {
      name: 'book-studio.ui',
      version: 1,
    },
  ),
)

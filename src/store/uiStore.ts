import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppearanceMode = 'light' | 'dark' | 'system'
export type InspectorTab = 'typography' | 'image' | 'page' | 'theme' | 'export' | 'book'
export type BookViewMode = 'single' | 'spread'
/** Which workspace the centre column shows. `manuscript` is the existing
 * book preview; `virtualEditor` is the new Editorial Dashboard — see
 * `src/layout/virtualEditor/VirtualEditorWorkspace.tsx`. Per the fixed
 * three-column shell in docs/UI_DESIGN_SYSTEM.md, this only swaps the
 * centre column's contents, never the shell itself. */
export type WorkspaceMode = 'manuscript' | 'virtualEditor'

interface UiStoreState {
  appearance: AppearanceMode
  sidebarCollapsed: boolean
  inspectorCollapsed: boolean
  inspectorTab: InspectorTab
  viewMode: BookViewMode
  zoom: number
  showThumbnails: boolean
  workspaceMode: WorkspaceMode
}

interface UiStoreActions {
  setAppearance: (mode: AppearanceMode) => void
  toggleSidebar: () => void
  toggleInspector: () => void
  setInspectorTab: (tab: InspectorTab) => void
  setViewMode: (mode: BookViewMode) => void
  setZoom: (zoom: number) => void
  toggleThumbnails: () => void
  setWorkspaceMode: (mode: WorkspaceMode) => void
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
      viewMode: 'spread',
      zoom: 1,
      showThumbnails: true,
      workspaceMode: 'manuscript',

      setAppearance: (mode) => set({ appearance: mode }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleInspector: () => set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),
      setInspectorTab: (tab) => set({ inspectorTab: tab }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.4, zoom)) }),
      toggleThumbnails: () => set((state) => ({ showThumbnails: !state.showThumbnails })),
      setWorkspaceMode: (mode) => set({ workspaceMode: mode }),
    }),
    {
      name: 'book-studio.ui',
      version: 1,
    },
  ),
)

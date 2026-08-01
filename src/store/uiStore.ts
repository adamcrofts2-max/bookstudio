import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppearanceMode = 'light' | 'dark' | 'system'
export type InspectorTab = 'typography' | 'image' | 'page' | 'theme' | 'export' | 'book' | 'notes'
export type BookViewMode = 'single' | 'spread'
/** Which workspace the centre column shows. `manuscript` is the existing
 * book preview; `virtualEditor` is the new Editorial Dashboard — see
 * `src/layout/virtualEditor/VirtualEditorWorkspace.tsx`. Per the fixed
 * three-column shell in docs/UI_DESIGN_SYSTEM.md, this only swaps the
 * centre column's contents, never the shell itself. */
export type WorkspaceMode = 'manuscript' | 'virtualEditor'

/** Which top-level shell the app renders — `editor` is the existing fixed
 * three-column `AppShell` (Sidebar/Toolbar+Workspace/Inspector); `planning`
 * is Layer 0's own shell (`PlanningShell.tsx`), a structurally separate
 * screen entirely, per `docs/AI_WORKSPACE_VISION.md`'s decided "new
 * top-level mode/tab, not a sidebar section" placement. Distinct from
 * `WorkspaceMode` above, which only ever swaps `AppShell`'s centre column —
 * this instead swaps which shell renders at all, one level higher up (see
 * `EditorPage.tsx`). */
export type AppMode = 'editor' | 'planning'

interface UiStoreState {
  appearance: AppearanceMode
  sidebarCollapsed: boolean
  inspectorCollapsed: boolean
  inspectorTab: InspectorTab
  viewMode: BookViewMode
  zoom: number
  showThumbnails: boolean
  workspaceMode: WorkspaceMode
  /** Toggleable dashed safe-text-zone guide on the Cover/Back Cover
   * preview (`CoverSafeZoneGuide` in `structuralPages/shared.tsx`) — an app
   * preference, not project data, so it stays on/off across every project
   * the user opens, same reasoning as `showThumbnails`. See
   * docs/STATUS.md Phase 46. */
  showCoverSafeZone: boolean
  /** Whether `ProjectSettingsDialog` (rendered once, in `Toolbar`) is open.
   * Lifted here — rather than kept as `Toolbar`-local state — so the
   * Inspector's Theme tab can open it too, e.g. its "Change theme…" button.
   * Deliberately excluded from persistence (see `partialize` below): a
   * dialog shouldn't reopen itself after a page reload. */
  projectSettingsOpen: boolean
  appMode: AppMode
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
  toggleCoverSafeZone: () => void
  setProjectSettingsOpen: (open: boolean) => void
  setAppMode: (mode: AppMode) => void
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
      showCoverSafeZone: false,
      projectSettingsOpen: false,
      appMode: 'editor',

      setAppearance: (mode) => set({ appearance: mode }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleInspector: () => set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),
      setInspectorTab: (tab) => set({ inspectorTab: tab }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.4, zoom)) }),
      toggleThumbnails: () => set((state) => ({ showThumbnails: !state.showThumbnails })),
      setWorkspaceMode: (mode) => set({ workspaceMode: mode }),
      toggleCoverSafeZone: () => set((state) => ({ showCoverSafeZone: !state.showCoverSafeZone })),
      setProjectSettingsOpen: (open) => set({ projectSettingsOpen: open }),
      setAppMode: (mode) => set({ appMode: mode }),
    }),
    {
      name: 'book-studio.ui',
      version: 1,
      partialize: ({ projectSettingsOpen: _projectSettingsOpen, ...rest }) => rest,
    },
  ),
)

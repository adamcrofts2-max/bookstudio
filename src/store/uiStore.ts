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

/** `none` is the normal three-column shell. `write` and `read` both render
 * `FocusModeLayout` instead (just the book canvas, full-screen, no Sidebar/
 * Toolbar/Inspector) — the only difference between them is whether the
 * canvas is editable. `write` is "distraction-free writing" (today's normal
 * editing, minus the chrome); `read` is a clean, non-interactive preview
 * (reuses `Page.tsx`'s existing `decorative` flag — no BlockToolbar, no
 * insert-block drop zones, no contentEditable — the same flag `ThumbnailPage
 * .tsx` already relies on, just at full size instead of thumbnail scale).
 * Both Phase F items from `docs/ROADMAP.md` ("distraction-free writing
 * mode" and the user-requested "reading mode") share this one piece of
 * state rather than two independent booleans, since a user is never in both
 * at once. */
export type FocusMode = 'none' | 'write' | 'read'

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
  focusMode: FocusMode
  /** Phase 111 (2026-08-02, user: "how about adding an option for
   * typewriter mode(sound)"). Keeps the caret's line vertically centred as
   * the user types, instead of drifting toward the bottom of the screen —
   * see `src/hooks/useTypewriterMode.ts`. Only has any visible effect in
   * Focus Mode's `write` view (`FocusModeLayout.tsx`); persisted like
   * `showThumbnails` since it's a standing preference, not session state. */
  /** Live spell-check underlining while writing. On by default — a writing
   * tool that silently doesn't check spelling is worse than one that
   * doesn't offer it — but genuinely worth turning off for a manuscript
   * full of invented words, or in a language the bundled dictionaries don't
   * cover. Scoped to the underlining only: the Virtual Editor's own
   * spelling review is a deliberate action and stays available either way. */
  spellcheckWhileWriting: boolean
  typewriterMode: boolean
  /** Whether typewriter mode also plays a soft synthesised key-click on
   * each keystroke. Independent toggle so a user can keep the scroll-
   * centring without the sound, or vice versa. Has no effect unless
   * `typewriterMode` is also on. */
  typewriterSound: boolean
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
  setFocusMode: (mode: FocusMode) => void
  toggleSpellcheckWhileWriting: () => void
  toggleTypewriterMode: () => void
  toggleTypewriterSound: () => void
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
      focusMode: 'none',
      spellcheckWhileWriting: true,
      typewriterMode: false,
      typewriterSound: false,

      setAppearance: (mode) => set({ appearance: mode }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleInspector: () => set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),
      // Also un-collapses the Inspector. Every caller of `setInspectorTab`
      // is responding to the user selecting something on the canvas (a
      // structural page, a block, a cover element) and wants its editor
      // visible right now — see `Page.tsx`/`cover.tsx`'s `onSelect`
      // handlers. Before this, selecting a Cover page while the Inspector
      // happened to be collapsed silently switched the tab behind a hidden
      // panel: the click "worked" internally but nothing appeared, so a
      // user in that state would reasonably conclude clicking the page
      // does nothing and go hunting for another way in (e.g. the Sidebar's
      // Structure tab) — flagged 2026-08-01. Collapsing the Inspector
      // remains a one-click, explicit choice via `toggleInspector`; this
      // only ever re-opens it, never closes it.
      setInspectorTab: (tab) => set({ inspectorTab: tab, inspectorCollapsed: false }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.4, zoom)) }),
      toggleThumbnails: () => set((state) => ({ showThumbnails: !state.showThumbnails })),
      setWorkspaceMode: (mode) => set({ workspaceMode: mode }),
      toggleCoverSafeZone: () => set((state) => ({ showCoverSafeZone: !state.showCoverSafeZone })),
      setProjectSettingsOpen: (open) => set({ projectSettingsOpen: open }),
      setAppMode: (mode) => set({ appMode: mode }),
      setFocusMode: (mode) => set({ focusMode: mode }),
      toggleSpellcheckWhileWriting: () => set((state) => ({ spellcheckWhileWriting: !state.spellcheckWhileWriting })),
      toggleTypewriterMode: () => set((state) => ({ typewriterMode: !state.typewriterMode })),
      toggleTypewriterSound: () => set((state) => ({ typewriterSound: !state.typewriterSound })),
    }),
    {
      name: 'book-studio.ui',
      version: 1,
      // Neither a dialog's open state nor focus mode should reopen/resume
      // itself after a page reload — same reasoning as `projectSettingsOpen`.
      partialize: ({ projectSettingsOpen: _projectSettingsOpen, focusMode: _focusMode, ...rest }) => rest,
    },
  ),
)

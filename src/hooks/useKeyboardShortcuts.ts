import { useEffect } from 'react'

import { useHistoryStore } from '@/store/historyStore'
import { useUiStore } from '@/store/uiStore'
import { useSelectionStore } from '@/store/selectionStore'
import { deleteBlockWithHistory } from '@/store/editorActions'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/**
 * Global editor shortcuts, scoped to the editor shell. Never intercepts
 * browser-owned combinations (Ctrl/Cmd+anything) and never fires while
 * the user is typing in a field — see docs/UI_DESIGN_SYSTEM.md's
 * "everything should feel effortless" principle applied to keybindings.
 *
 * Undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y) is a deliberate,
 * narrow exception to the "ignore all Ctrl/Cmd" rule below — but it still
 * respects `isTypingTarget`: while focus is on a text field or the
 * manuscript's inline-editable blocks, Ctrl/Cmd+Z is left alone so the
 * browser's native field-level undo fires instead of the app-level stack.
 *
 * `projectId` is the active project's id (there is no manuscript to undo
 * against otherwise) — `null` disables the shortcut, e.g. before a project
 * has loaded.
 */
export function useKeyboardShortcuts(projectId: string | null) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const toggleInspector = useUiStore((s) => s.toggleInspector)
  const setZoom = useUiStore((s) => s.setZoom)
  const zoom = useUiStore((s) => s.zoom)
  const viewMode = useUiStore((s) => s.viewMode)
  const setViewMode = useUiStore((s) => s.setViewMode)
  const focusMode = useUiStore((s) => s.focusMode)
  const setFocusMode = useUiStore((s) => s.setFocusMode)
  const clearSelection = useSelectionStore((s) => s.clear)
  const selectedChapterId = useSelectionStore((s) => s.selectedChapterId)
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId)
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const isUndoRedoCombo = (e.metaKey || e.ctrlKey) && !e.altKey && (key === 'z' || key === 'y')

      if (isUndoRedoCombo) {
        // Typing in a field/inline-editable block: let the browser's own
        // field-level undo handle it, don't touch the app-level stack.
        if (isTypingTarget(e.target)) return
        if (!projectId) return
        e.preventDefault()
        const isRedo = key === 'y' || (key === 'z' && e.shiftKey)
        if (isRedo) redo(projectId)
        else undo(projectId)
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      switch (e.key) {
        case '[':
          toggleSidebar()
          break
        case ']':
          toggleInspector()
          break
        case '+':
        case '=':
          setZoom(zoom + 0.1)
          break
        case '-':
        case '_':
          setZoom(zoom - 0.1)
          break
        case '0':
          setZoom(1)
          break
        case 'v':
          setViewMode(viewMode === 'spread' ? 'single' : 'spread')
          break
        case 'Escape':
          // Exiting focus mode takes priority over deselecting — the two
          // things Escape does are never both relevant at once in practice
          // (Sidebar/Inspector selection has nothing to show while focus
          // mode's chrome-free layout is active), and "get me back to the
          // normal shell" is the more urgent of the two.
          if (focusMode !== 'none') {
            setFocusMode('none')
            break
          }
          clearSelection()
          break
        case 'Delete':
        case 'Backspace':
          // Only ever reaches here once `isTypingTarget` above has already
          // ruled out a contentEditable field / input / textarea — i.e. a
          // block is *selected* but not currently being edited. Deletes the
          // whole block; see docs/ROADMAP.md Phase B ("no way to delete a
          // paragraph"). Structural pages already have a delete action in
          // the Sidebar's Structure tab, so this is content-block-only.
          if (!projectId || !selectedChapterId || !selectedBlockId) return
          deleteBlockWithHistory(projectId, selectedChapterId, selectedBlockId)
          clearSelection()
          break
        default:
          return
      }
      e.preventDefault()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    projectId,
    undo,
    redo,
    toggleSidebar,
    toggleInspector,
    setZoom,
    zoom,
    viewMode,
    setViewMode,
    focusMode,
    setFocusMode,
    clearSelection,
    selectedChapterId,
    selectedBlockId,
  ])
}

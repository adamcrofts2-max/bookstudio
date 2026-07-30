import { useEffect } from 'react'

import { useUiStore } from '@/store/uiStore'
import { useSelectionStore } from '@/store/selectionStore'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/**
 * Global editor shortcuts, scoped to the editor shell. Never intercepts
 * browser-owned combinations (Ctrl/Cmd+anything) and never fires while
 * the user is typing in a field — see docs/UI_DESIGN_SYSTEM.md's
 * "everything should feel effortless" principle applied to keybindings.
 */
export function useKeyboardShortcuts() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const toggleInspector = useUiStore((s) => s.toggleInspector)
  const setZoom = useUiStore((s) => s.setZoom)
  const zoom = useUiStore((s) => s.zoom)
  const viewMode = useUiStore((s) => s.viewMode)
  const setViewMode = useUiStore((s) => s.setViewMode)
  const clearSelection = useSelectionStore((s) => s.clear)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
          clearSelection()
          break
        default:
          return
      }
      e.preventDefault()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleSidebar, toggleInspector, setZoom, zoom, viewMode, setViewMode, clearSelection])
}

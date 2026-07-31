import { useEffect, useState } from 'react'
import { Bold, Italic, Link as LinkIcon } from 'lucide-react'

interface FloatingFormatToolbarProps {
  /** The exact contentEditable element being edited — same ref object
   * `useEditableField` already attaches to the field's DOM node. Used only
   * to confirm the current browser selection actually lives inside this
   * field (a page can have many editable fields at once). */
  containerRef: React.RefObject<HTMLElement | null>
  /** Mirrors the owning field's `isEditing` — the toolbar only ever tracks
   * selection while its own field is the one being edited. */
  active: boolean
}

const iconButtonClass =
  'flex size-7 items-center justify-center rounded-[var(--radius-preview)] text-text-secondary transition-colors hover:bg-hover hover:text-text-primary'

/**
 * Small floating bold/italic/link toolbar that appears above the current
 * text selection while editing a paragraph's inline HTML — see
 * docs/ROADMAP.md Phase B ("we can edit text, but it needs improving with a
 * small editor or something"). Only ever used by `paragraph.tsx`: it's the
 * only block field using `useEditableField({ mode: 'html', ... })` — every
 * other field is `mode: 'text'`, which strips all markup on commit
 * (`textContent`), so bold/italic/link would have no effect there.
 *
 * Uses `document.execCommand('bold' | 'italic' | 'createLink')` — deprecated
 * but still universally supported for exactly this contentEditable
 * formatting use case, and the simplest way to get real rich-text commands
 * without pulling in a rich-text-editor library this codebase doesn't
 * otherwise depend on. Whatever markup this produces (`<b>`/`<i>`/`<a>`) is
 * normalised back down to `<strong>`/`<em>`/`<a>` by the existing
 * `sanitiseInline` on commit — no new sanitisation path.
 *
 * Every button uses `onMouseDown` + `preventDefault` (not `onClick`) so the
 * browser never collapses the text selection before the format command
 * runs — the classic contentEditable-toolbar pattern.
 */
export function FloatingFormatToolbar({ containerRef, active }: FloatingFormatToolbarProps) {
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!active) {
      setRect(null)
      return
    }

    const update = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setRect(null)
        return
      }
      const container = containerRef.current
      const range = selection.getRangeAt(0)
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setRect(null)
        return
      }
      const box = range.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) {
        setRect(null)
        return
      }
      setRect({ top: box.top, left: box.left + box.width / 2 })
    }

    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [active, containerRef])

  if (!rect) return null

  const format = (command: string, value?: string) => {
    document.execCommand(command, false, value)
  }

  return (
    <div
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-[var(--radius-button)] border border-border bg-background-secondary p-1 shadow-[var(--shadow-md)]"
      style={{ top: rect.top - 8, left: rect.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className={iconButtonClass}
        onMouseDown={(e) => {
          e.preventDefault()
          format('bold')
        }}
        aria-label="Bold"
        title="Bold"
      >
        <Bold className="size-3.5" />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        onMouseDown={(e) => {
          e.preventDefault()
          format('italic')
        }}
        aria-label="Italic"
        title="Italic"
      >
        <Italic className="size-3.5" />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        onMouseDown={(e) => {
          e.preventDefault()
          const url = window.prompt('Link URL')
          if (url) format('createLink', url)
        }}
        aria-label="Link"
        title="Link"
      >
        <LinkIcon className="size-3.5" />
      </button>
    </div>
  )
}

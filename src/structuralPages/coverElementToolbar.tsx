import { Shapes, Square, Circle, Minus, Type } from 'lucide-react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { CoverElement, CoverElementKind } from '@/types/structuralPage'
import { createCoverElement, addElement, nextZIndex } from '@/structuralPages/coverElements'

const ADD_OPTIONS: { kind: CoverElementKind; label: string; Icon: typeof Square }[] = [
  { kind: 'rect', label: 'Rectangle', Icon: Square },
  { kind: 'ellipse', label: 'Ellipse', Icon: Circle },
  { kind: 'line', label: 'Line', Icon: Minus },
  { kind: 'text', label: 'Text box', Icon: Type },
]

interface CoverElementToolbarProps {
  elements: CoverElement[] | undefined
  onAdd: (elements: CoverElement[], newId: string) => void
}

/**
 * "Add" menu for the free-form element canvas (see
 * `docs/COVER_CANVAS_PLAN.md`) — only rendered while the parent Cover/Back
 * Cover page is selected, same gating as `CoverImageUploadButton`. Adding an
 * element also selects it immediately (via `onAdd`'s `newId`), so a user can
 * start dragging/resizing/styling it right away without a separate click.
 */
export function CoverElementToolbar({ elements, onAdd }: CoverElementToolbarProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto flex items-center gap-1.5 rounded-[var(--radius-button)] border border-dashed border-white/60 bg-black/45 px-3 py-1.5 text-xs text-white transition-colors hover:bg-black/60"
        >
          <Shapes className="size-3.5" />
          Add element
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ADD_OPTIONS.map(({ kind, label, Icon }) => (
          <DropdownMenuItem
            key={kind}
            className="gap-2"
            onClick={() => {
              const element = createCoverElement(kind, elements?.length ?? 0, nextZIndex(elements))
              onAdd(addElement(elements, element), element.id)
            }}
          >
            <Icon className="size-3.5" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

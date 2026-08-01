import { ChevronUp, ChevronDown, Square, Circle, Minus, Type, Award, ImageIcon, Layers } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { CoverElement } from '@/types/structuralPage'
import { bringForward, sendBackward } from '@/structuralPages/coverElements'
import { COVER_ICON_COMPONENTS } from '@/structuralPages/coverIcons'
import { cn } from '@/lib/utils'

const KIND_ICON: Record<Exclude<CoverElement['kind'], 'icon'>, typeof Square> = {
  rect: Square,
  ellipse: Circle,
  line: Minus,
  text: Type,
  badge: Award,
  image: ImageIcon,
}

/** Short row label — element text for kinds with visible text, a generic
 * kind name otherwise. Mirrors `CoverElementPanel`'s `KIND_LABEL` but
 * prefers actual content when there is any, since "Text box" for every text
 * element in a stack of five is useless for telling them apart. */
function layerLabel(element: CoverElement): string {
  if (element.kind === 'text') return element.text || 'Text'
  if (element.kind === 'badge') return element.text || 'Badge'
  if (element.kind === 'icon') return element.iconId
  if (element.kind === 'image') return 'Image'
  if (element.kind === 'rect') return 'Rectangle'
  if (element.kind === 'ellipse') return 'Ellipse'
  return 'Line'
}

interface CoverLayersPanelProps {
  elements: CoverElement[]
  selectedId: string | null
  onSelect: (id: string) => void
  onChange: (elements: CoverElement[]) => void
}

/**
 * Stacking-order list for a Cover/Back Cover's free-form elements — the
 * biggest gap flagged in the Phase 59 brainstorm. Once a couple of elements
 * fully overlap (a badge over a photo, an icon over a shape), clicking
 * through the visual stack to grab the one underneath gets old fast; this
 * lists every element regardless of what's currently on top, topmost first
 * (matching Figma/Canva's convention), so any element is reachable by name
 * with one click. The up/down chevrons are `bringForward`/`sendBackward`
 * (one step at a time) — a precision complement to `CoverElementPanel`'s
 * existing bring-to-front/send-to-back buttons, the same "click nudge vs.
 * jump to the end" pairing `SNAP_THRESHOLD` drag-snap and the align-to-page
 * buttons already established for position.
 *
 * Always visible once elements exist, independent of whether one is
 * currently selected — this is a picker as much as a status display, so it
 * can't be gated behind `CoverElementPanel`'s "something is already
 * selected" precondition without defeating its own purpose.
 */
export function CoverLayersPanel({ elements, selectedId, onSelect, onChange }: CoverLayersPanelProps) {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)

  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-border bg-panel p-3">
      <div className="flex items-center gap-1.5">
        <Layers className="size-3.5 text-text-secondary" />
        <Label>Layers</Label>
      </div>
      <div className="flex flex-col gap-0.5">
        {sorted.map((el, i) => {
          const Icon = el.kind === 'icon' ? COVER_ICON_COMPONENTS[el.iconId] : KIND_ICON[el.kind]
          const isSelected = el.id === selectedId
          return (
            <div
              key={el.id}
              className={cn(
                'flex items-center gap-1.5 rounded-[var(--radius-control)] px-1.5 py-1 text-left text-xs',
                isSelected ? 'bg-accent/15 text-text-primary' : 'text-text-secondary hover:bg-hover',
              )}
            >
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2" onClick={() => onSelect(el.id)}>
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{layerLabel(el)}</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Move forward"
                disabled={i === 0}
                onClick={() => onChange(bringForward(elements, el.id))}
              >
                <ChevronUp className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Move backward"
                disabled={i === sorted.length - 1}
                onClick={() => onChange(sendBackward(elements, el.id))}
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

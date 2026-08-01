import { ArrowDownToLine, ArrowUpToLine, Trash2 } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { CoverElement, CoverFontChoice } from '@/types/structuralPage'
import { updateElement, removeElement, bringToFront, sendToBack } from '@/structuralPages/coverElements'

const FONT_CHOICE_OPTIONS: { id: CoverFontChoice; label: string }[] = [
  { id: 'theme', label: "Book's theme" },
  { id: 'serif', label: 'Serif' },
  { id: 'sans', label: 'Sans-serif' },
  { id: 'anton', label: 'Anton' },
  { id: 'bebas-neue', label: 'Bebas Neue' },
  { id: 'oswald', label: 'Oswald' },
  { id: 'playfair-display', label: 'Playfair Display' },
  { id: 'dm-serif-display', label: 'DM Serif Display' },
  { id: 'abril-fatface', label: 'Abril Fatface' },
  { id: 'fraunces', label: 'Fraunces' },
]

const ALIGN_OPTIONS: { id: NonNullable<Extract<CoverElement, { kind: 'text' }>['align']>; label: string }[] = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Centre' },
  { id: 'right', label: 'Right' },
]

const KIND_LABEL: Record<CoverElement['kind'], string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  text: 'Text box',
}

interface CoverElementPanelProps {
  element: CoverElement
  elements: CoverElement[] | undefined
  onChange: (elements: CoverElement[]) => void
  onDeselect: () => void
}

/**
 * Property editor for one selected `CoverElement` — shown in the Inspector's
 * Page panel above the rest of the Cover/Back Cover fields whenever
 * `selectionStore.selectedCoverElementId` is set. See
 * `docs/COVER_CANVAS_PLAN.md`: position/size are dragged directly on canvas
 * (`coverElementLayer.tsx`), not typed here — this panel only covers style
 * properties that don't have an obvious on-canvas gesture, plus delete and
 * layer order.
 */
export function CoverElementPanel({ element, elements, onChange, onDeselect }: CoverElementPanelProps) {
  const patch = (updates: Partial<CoverElement>) => onChange(updateElement(elements, element.id, updates))

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">{KIND_LABEL[element.kind]}</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="Send backward" onClick={() => onChange(sendToBack(elements, element.id))}>
            <ArrowDownToLine className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" title="Bring forward" onClick={() => onChange(bringToFront(elements, element.id))}>
            <ArrowUpToLine className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Delete"
            onClick={() => {
              onDeselect()
              onChange(removeElement(elements, element.id))
            }}
          >
            <Trash2 className="size-3.5 text-danger" />
          </Button>
        </div>
      </div>

      {element.kind === 'text' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cover-el-text">Text</Label>
            <Input id="cover-el-text" value={element.text} onChange={(e) => patch({ text: e.target.value })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Font</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {FONT_CHOICE_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={(element.fontChoice ?? 'theme') === option.id ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => patch({ fontChoice: option.id })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Align</Label>
            <div className="flex gap-1.5">
              {ALIGN_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={(element.align ?? 'center') === option.id ? 'primary' : 'secondary'}
                  size="sm"
                  className="flex-1"
                  onClick={() => patch({ align: option.id })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="cover-el-italic">Italic</Label>
            <Switch id="cover-el-italic" checked={element.italic ?? false} onCheckedChange={(checked) => patch({ italic: checked })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Size ({element.fontSize ?? 24}px)</Label>
            <input
              type="range"
              min={10}
              max={120}
              step={1}
              value={element.fontSize ?? 24}
              onChange={(e) => patch({ fontSize: Number(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Colour</Label>
            <input
              type="color"
              aria-label="Text colour"
              className="h-9 w-12 shrink-0 rounded-[var(--radius-control)] border border-border"
              value={element.color ?? '#ffffff'}
              onChange={(e) => patch({ color: e.target.value })}
            />
          </div>
        </>
      )}

      {element.kind !== 'text' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Fill</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Fill colour"
                className="h-9 w-12 shrink-0 rounded-[var(--radius-control)] border border-border"
                value={element.fill ?? '#ffffff'}
                onChange={(e) => patch({ fill: e.target.value })}
              />
              {element.fill && (
                <Button type="button" variant="ghost" size="sm" onClick={() => patch({ fill: undefined })}>
                  Remove fill
                </Button>
              )}
            </div>
          </div>

          {element.fill && (
            <div className="flex flex-col gap-1.5">
              <Label>Fill opacity</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={element.fillOpacity ?? 1}
                onChange={(e) => patch({ fillOpacity: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Stroke</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Stroke colour"
                className="h-9 w-12 shrink-0 rounded-[var(--radius-control)] border border-border"
                value={element.stroke ?? '#000000'}
                onChange={(e) => patch({ stroke: e.target.value })}
              />
              {element.stroke && (
                <Button type="button" variant="ghost" size="sm" onClick={() => patch({ stroke: undefined })}>
                  Remove stroke
                </Button>
              )}
            </div>
          </div>

          {element.stroke && (
            <div className="flex flex-col gap-1.5">
              <Label>Stroke width ({element.strokeWidth ?? 1}px)</Label>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={element.strokeWidth ?? 1}
                onChange={(e) => patch({ strokeWidth: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
          )}

          {element.kind === 'rect' && (
            <div className="flex flex-col gap-1.5">
              <Label>Corner radius ({element.cornerRadius ?? 0}px)</Label>
              <input
                type="range"
                min={0}
                max={80}
                step={2}
                value={element.cornerRadius ?? 0}
                onChange={(e) => patch({ cornerRadius: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
          )}
        </>
      )}

      <Separator />
      <p className="text-xs text-text-secondary">Drag the element or its corner handles in the preview to move or resize it.</p>
    </div>
  )
}

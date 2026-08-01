import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Trash2,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from 'lucide-react'

import { ImagePlus, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { CoverElement, CoverFontChoice, CoverIconId } from '@/types/structuralPage'
import { updateElement, removeElement, bringToFront, sendToBack, duplicateElement } from '@/structuralPages/coverElements'
import { COVER_ICON_COMPONENTS, COVER_ICON_LABELS } from '@/structuralPages/coverIcons'
import { useImageUpload } from '@/hooks/useImageUpload'

const ICON_OPTIONS = Object.keys(COVER_ICON_LABELS) as CoverIconId[]

const BADGE_SHAPE_OPTIONS: { id: NonNullable<Extract<CoverElement, { kind: 'badge' }>['shape']>; label: string }[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'rect', label: 'Ribbon' },
]

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
  icon: 'Icon',
  badge: 'Badge',
  image: 'Image',
}

interface CoverElementPanelProps {
  element: CoverElement
  elements: CoverElement[] | undefined
  /** Needed only for the 'image' kind's upload control — `useImageUpload`
   * imports the picked file into this project's asset store. */
  projectId: string
  onChange: (elements: CoverElement[]) => void
  onDeselect: () => void
  /** Selects a different element by id — used after duplicating, so the
   * Inspector follows the new copy rather than continuing to show the
   * original. */
  onSelect: (id: string) => void
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
export function CoverElementPanel({ element, elements, projectId, onChange, onDeselect, onSelect }: CoverElementPanelProps) {
  const patch = (updates: Partial<CoverElement>) => onChange(updateElement(elements, element.id, updates))
  // Always called (hooks can't be conditional) — only rendered for the
  // 'image' kind below, same "cheap to call, only used sometimes" tradeoff
  // as every other kind-specific branch in this panel already accepts.
  const { openPicker, inputProps } = useImageUpload(projectId, (assetId) => patch({ imageAssetId: assetId }))

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
            title="Duplicate"
            onClick={() => {
              const result = duplicateElement(elements, element.id)
              if (!result) return
              onChange(result.elements)
              onSelect(result.newId)
            }}
          >
            <Copy className="size-3.5" />
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

      {/* One-click alignment relative to the page — a precision complement
       * to drag-based snap-to-centre (`coverElementLayer.tsx`'s
       * `SNAP_THRESHOLD`), for the two positions (flush left/right/top/
       * bottom) a drag can't land on as reliably as a click can. Applies to
       * every element kind (position-only, no kind-specific fields), so
       * it's rendered once here rather than duplicated per branch below. */}
      <div className="flex flex-col gap-1.5">
        <Label>Align to page</Label>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="icon" title="Align left" onClick={() => patch({ x: 0 })}>
            <AlignHorizontalJustifyStart className="size-3.5" />
          </Button>
          <Button variant="secondary" size="icon" title="Centre horizontally" onClick={() => patch({ x: (1 - element.width) / 2 })}>
            <AlignHorizontalJustifyCenter className="size-3.5" />
          </Button>
          <Button variant="secondary" size="icon" title="Align right" onClick={() => patch({ x: 1 - element.width })}>
            <AlignHorizontalJustifyEnd className="size-3.5" />
          </Button>
          <Button variant="secondary" size="icon" title="Align top" onClick={() => patch({ y: 0 })}>
            <AlignVerticalJustifyStart className="size-3.5" />
          </Button>
          <Button variant="secondary" size="icon" title="Centre vertically" onClick={() => patch({ y: (1 - element.height) / 2 })}>
            <AlignVerticalJustifyCenter className="size-3.5" />
          </Button>
          <Button variant="secondary" size="icon" title="Align bottom" onClick={() => patch({ y: 1 - element.height })}>
            <AlignVerticalJustifyEnd className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Whole-element opacity — declared once on `BaseCoverElement` (not
       * per-kind) so it applies uniformly, same reasoning as "Align to page"
       * above. rect/ellipse also have their own `fillOpacity` further down
       * (fill-only, leaves a stroke fully opaque); this composes with that
       * rather than replacing it. Added in response to the Phase 59
       * brainstorm's "icon/badge/image had no opacity control at all" gap. */}
      <div className="flex flex-col gap-1.5">
        <Label>Opacity ({Math.round((element.opacity ?? 1) * 100)}%)</Label>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={element.opacity ?? 1}
          onChange={(e) => patch({ opacity: Number(e.target.value) })}
          className="w-full accent-accent"
        />
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

      {element.kind === 'icon' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Icon</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {ICON_OPTIONS.map((id) => {
                const Icon = COVER_ICON_COMPONENTS[id]
                return (
                  <Button
                    key={id}
                    type="button"
                    variant={element.iconId === id ? 'primary' : 'secondary'}
                    size="icon"
                    title={COVER_ICON_LABELS[id]}
                    onClick={() => patch({ iconId: id })}
                  >
                    <Icon className="size-4" />
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Colour</Label>
            <input
              type="color"
              aria-label="Icon colour"
              className="h-9 w-12 shrink-0 rounded-[var(--radius-control)] border border-border"
              value={element.color ?? '#ffffff'}
              onChange={(e) => patch({ color: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Stroke width ({element.strokeWidth ?? 2}px)</Label>
            <input
              type="range"
              min={1}
              max={4}
              step={0.5}
              value={element.strokeWidth ?? 2}
              onChange={(e) => patch({ strokeWidth: Number(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>
        </>
      )}

      {element.kind === 'badge' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cover-el-badge-text">Text</Label>
            <Input id="cover-el-badge-text" value={element.text} onChange={(e) => patch({ text: e.target.value })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Shape</Label>
            <div className="flex gap-1.5">
              {BADGE_SHAPE_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={element.shape === option.id ? 'primary' : 'secondary'}
                  size="sm"
                  className="flex-1"
                  onClick={() => patch({ shape: option.id })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Background</Label>
              <input
                type="color"
                aria-label="Badge background colour"
                className="h-9 w-12 shrink-0 rounded-[var(--radius-control)] border border-border"
                value={element.backgroundColor ?? '#dc2626'}
                onChange={(e) => patch({ backgroundColor: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Text colour</Label>
              <input
                type="color"
                aria-label="Badge text colour"
                className="h-9 w-12 shrink-0 rounded-[var(--radius-control)] border border-border"
                value={element.textColor ?? '#ffffff'}
                onChange={(e) => patch({ textColor: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Size ({element.fontSize ?? 15}px)</Label>
            <input
              type="range"
              min={8}
              max={40}
              step={1}
              value={element.fontSize ?? 15}
              onChange={(e) => patch({ fontSize: Number(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Border</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Badge border colour"
                className="h-9 w-12 shrink-0 rounded-[var(--radius-control)] border border-border"
                value={element.borderColor ?? '#ffffff'}
                onChange={(e) => patch({ borderColor: e.target.value })}
              />
              {element.borderColor && (
                <Button type="button" variant="ghost" size="sm" onClick={() => patch({ borderColor: undefined })}>
                  Remove border
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {element.kind === 'image' && (
        <div className="flex flex-col gap-1.5">
          <Label>Image</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={openPicker} className="flex-1 justify-start gap-2">
              <ImagePlus className="size-3.5" />
              {element.imageAssetId ? 'Replace image' : 'Choose image'}
            </Button>
            {element.imageAssetId && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Remove image"
                onClick={() => patch({ imageAssetId: undefined, imageFocalPoint: undefined, imageZoom: undefined })}
              >
                <X className="size-3.5 text-danger" />
              </Button>
            )}
          </div>
          <input {...inputProps} />
          <p className="text-xs text-text-secondary">Cropped to fill this box — drag a corner handle in the preview to change its shape.</p>

          {element.imageAssetId && (
            <>
              {/* X/Y sliders rather than an on-canvas click-to-set picker
               * (like the main background image's `CoverFocalPointPicker`)
               * — deliberately: this element's own box is already the
               * drag-to-move/resize target, so a click-anywhere gesture on
               * the same area would recreate the exact pointer-conflict bug
               * Phase 57/59 just fixed. See `coverElementLayer.tsx`'s image
               * branch for the matching reasoning. */}
              <div className="flex flex-col gap-1.5">
                <Label>Focal point — horizontal ({Math.round((element.imageFocalPoint?.x ?? 0.5) * 100)}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={element.imageFocalPoint?.x ?? 0.5}
                  onChange={(e) => patch({ imageFocalPoint: { x: Number(e.target.value), y: element.imageFocalPoint?.y ?? 0.5 } })}
                  className="w-full accent-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Focal point — vertical ({Math.round((element.imageFocalPoint?.y ?? 0.5) * 100)}%)</Label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={element.imageFocalPoint?.y ?? 0.5}
                  onChange={(e) => patch({ imageFocalPoint: { x: element.imageFocalPoint?.x ?? 0.5, y: Number(e.target.value) } })}
                  className="w-full accent-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Zoom ({(element.imageZoom ?? 1).toFixed(2)}×)</Label>
                <input
                  type="range"
                  min={1}
                  max={2.5}
                  step={0.05}
                  value={element.imageZoom ?? 1}
                  onChange={(e) => patch({ imageZoom: Number(e.target.value) })}
                  className="w-full accent-accent"
                />
              </div>
            </>
          )}
        </div>
      )}

      {(element.kind === 'rect' || element.kind === 'ellipse' || element.kind === 'line') && (
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

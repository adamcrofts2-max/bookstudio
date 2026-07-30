import { AlignCenter, AlignLeft, AlignRight, Image as ImageIcon, Lock, LockOpen, RotateCw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/common/EmptyState'
import { useContentStore } from '@/store/contentStore'
import { deleteBlockWithHistory, editBlock } from '@/store/editorActions'
import { useSelectionStore } from '@/store/selectionStore'
import { EMPTY_ASSETS, useAssetStore } from '@/store/assetStore'
import type { ImageBlock } from '@/types/content'
import { cn } from '@/lib/utils'

interface ImagePanelProps {
  projectId: string
}

const DEFAULT_CUSTOM_WIDTH_MM = 80

/**
 * Image tab of the Inspector: shows the currently selected image block and
 * lets the user caption, resize, rotate, align, desaturate, replace or
 * delete it. Mirrors TypographyPanel's pattern of resolving selectionStore
 * against the real manuscript in contentStore.
 */
export function ImagePanel({ projectId }: ImagePanelProps) {
  const selectedChapterId = useSelectionStore((s) => s.selectedChapterId)
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId)
  const clearSelection = useSelectionStore((s) => s.clear)
  const manuscript = useContentStore((s) => s.getManuscript(projectId))
  const assets = useAssetStore((s) => s.byProject[projectId] ?? EMPTY_ASSETS)

  const chapter = manuscript?.chapters.find((c) => c.id === selectedChapterId)
  const block = chapter?.blocks.find((b) => b.id === selectedBlockId)

  if (!chapter || !block || block.type !== 'image') {
    return (
      <EmptyState
        icon={ImageIcon}
        title="No image selected"
        description="Select an image in the preview to caption or rotate it."
        className="py-12"
      />
    )
  }

  const asset = assets.find((a) => a.id === block.assetId)
  const aspectRatio = asset && asset.width && asset.height ? asset.height / asset.width : undefined
  const aspectLocked = block.aspectLocked ?? true
  const sizeMode = block.widthMm != null ? 'custom' : String(block.widthPercent ?? 100)

  const patch = (updates: Partial<ImageBlock>) => editBlock(projectId, chapter.id, block.id, updates)

  const handleSizeModeChange = (value: string) => {
    if (value === 'custom') {
      if (block.widthMm == null) {
        const widthMm = DEFAULT_CUSTOM_WIDTH_MM
        const heightMm = aspectRatio ? Math.round(widthMm * aspectRatio * 10) / 10 : widthMm
        patch({ widthMm, heightMm, aspectLocked: block.aspectLocked ?? true })
      }
      return
    }
    // Switching back to a percent preset — widthMm takes precedence over
    // widthPercent everywhere it's read, so it must be cleared or the
    // preset would have no visible effect.
    patch({ widthPercent: Number(value), widthMm: undefined, heightMm: undefined })
  }

  const handleWidthMmChange = (raw: string) => {
    const widthMm = Number(raw)
    if (!Number.isFinite(widthMm) || widthMm <= 0) return
    if (aspectLocked && aspectRatio) {
      patch({ widthMm, heightMm: Math.round(widthMm * aspectRatio * 10) / 10 })
    } else {
      patch({ widthMm })
    }
  }

  const handleHeightMmChange = (raw: string) => {
    const heightMm = Number(raw)
    if (!Number.isFinite(heightMm) || heightMm <= 0) return
    if (aspectLocked && aspectRatio) {
      patch({ heightMm, widthMm: Math.round((heightMm / aspectRatio) * 10) / 10 })
    } else {
      patch({ heightMm })
    }
  }

  const handleDelete = () => {
    if (window.confirm('Delete this image? This cannot be undone.')) {
      deleteBlockWithHistory(projectId, chapter.id, block.id)
      clearSelection()
    }
  }

  return (
    <div className="flex flex-col gap-4 px-1 pt-1">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-primary">Image</p>
        {asset && (
          <p className="text-xs text-text-secondary">
            {asset.name} · {asset.width} × {asset.height}px
          </p>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="image-caption">Caption</Label>
        <Input
          id="image-caption"
          placeholder="Add a caption…"
          value={block.caption ?? ''}
          onChange={(e) => patch({ caption: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="image-alt">Alt text (for accessibility)</Label>
        <Input
          id="image-alt"
          placeholder="Describe this image for screen readers…"
          value={block.altText ?? ''}
          onChange={(e) => patch({ altText: e.target.value })}
        />
        <p className="text-xs text-text-secondary">
          Read by screen readers — separate from the visible caption above. Falls back to the caption if left blank.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="image-size">Size</Label>
        <Select value={sizeMode} onValueChange={handleSizeModeChange}>
          <SelectTrigger id="image-size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="40">Small — 40%</SelectItem>
            <SelectItem value="65">Medium — 65%</SelectItem>
            <SelectItem value="85">Large — 85%</SelectItem>
            <SelectItem value="100">Full — 100%</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>

        {sizeMode === 'custom' && (
          <div className="flex items-end gap-2 pt-1">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="image-width-mm">Width (mm)</Label>
              <Input
                id="image-width-mm"
                type="number"
                min={1}
                value={block.widthMm ?? ''}
                onChange={(e) => handleWidthMmChange(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => patch({ aspectLocked: !aspectLocked })}
              aria-label={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              aria-pressed={aspectLocked}
            >
              {aspectLocked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            </Button>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="image-height-mm">Height (mm)</Label>
              <Input
                id="image-height-mm"
                type="number"
                min={1}
                value={block.heightMm ?? ''}
                onChange={(e) => handleHeightMmChange(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Alignment</Label>
        <div className="flex gap-1.5">
          {(
            [
              { value: 'left' as const, Icon: AlignLeft, label: 'Align left' },
              { value: 'center' as const, Icon: AlignCenter, label: 'Align center' },
              { value: 'right' as const, Icon: AlignRight, label: 'Align right' },
            ]
          ).map(({ value, Icon, label }) => (
            <Button
              key={value}
              type="button"
              variant={(block.align ?? 'center') === value ? 'primary' : 'secondary'}
              size="icon"
              onClick={() => patch({ align: value })}
              aria-label={label}
              aria-pressed={(block.align ?? 'center') === value}
            >
              <Icon className="size-3.5" />
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="image-grayscale" className="cursor-pointer">
          Black &amp; white
        </Label>
        <Switch
          id="image-grayscale"
          checked={block.grayscale ?? false}
          onCheckedChange={(checked) => patch({ grayscale: checked })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Rotation</Label>
        <Button
          variant="secondary"
          size="sm"
          className="w-fit gap-1.5"
          onClick={() =>
            patch({
              rotation: ((block.rotation + 90) % 360) as 0 | 90 | 180 | 270,
            })
          }
        >
          <RotateCw className="size-3.5" />
          Rotate 90° (currently {block.rotation}°)
        </Button>
      </div>

      <Separator />

      <Button
        type="button"
        variant="danger"
        size="sm"
        className={cn('w-fit gap-1.5')}
        onClick={handleDelete}
      >
        <Trash2 className="size-3.5" />
        Delete image
      </Button>
    </div>
  )
}

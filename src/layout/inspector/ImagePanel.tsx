import { Image as ImageIcon, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/common/EmptyState'
import { useContentStore } from '@/store/contentStore'
import { useSelectionStore } from '@/store/selectionStore'
import { EMPTY_ASSETS, useAssetStore } from '@/store/assetStore'

interface ImagePanelProps {
  projectId: string
}

/**
 * Image tab of the Inspector: shows the currently selected image block and
 * lets the user caption or rotate it. Mirrors TypographyPanel's pattern of
 * resolving selectionStore against the real manuscript in contentStore.
 */
export function ImagePanel({ projectId }: ImagePanelProps) {
  const selectedChapterId = useSelectionStore((s) => s.selectedChapterId)
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId)
  const manuscript = useContentStore((s) => s.getManuscript(projectId))
  const updateBlock = useContentStore((s) => s.updateBlock)
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
          onChange={(e) => updateBlock(projectId, chapter.id, block.id, { caption: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="image-size">Size</Label>
        <Select
          value={String(block.widthPercent ?? 100)}
          onValueChange={(value) => updateBlock(projectId, chapter.id, block.id, { widthPercent: Number(value) })}
        >
          <SelectTrigger id="image-size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="40">Small — 40%</SelectItem>
            <SelectItem value="65">Medium — 65%</SelectItem>
            <SelectItem value="85">Large — 85%</SelectItem>
            <SelectItem value="100">Full — 100%</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Rotation</Label>
        <Button
          variant="secondary"
          size="sm"
          className="w-fit gap-1.5"
          onClick={() =>
            updateBlock(projectId, chapter.id, block.id, {
              rotation: ((block.rotation + 90) % 360) as 0 | 90 | 180 | 270,
            })
          }
        >
          <RotateCw className="size-3.5" />
          Rotate 90° (currently {block.rotation}°)
        </Button>
      </div>
    </div>
  )
}

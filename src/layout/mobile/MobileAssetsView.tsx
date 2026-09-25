import { useRef, useState } from 'react'
import { ChevronLeft, ImageIcon, ImagePlus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { UploadError } from '@/components/common/UploadError'
import { removeAssetWithHistory } from '@/store/editorActions'
import { EMPTY_ASSETS, useAssetStore } from '@/store/assetStore'

interface MobileAssetsViewProps {
  projectId: string
  onBack: () => void
}

/**
 * The image library on a phone.
 *
 * Mobile could already *add* a photo to a chapter (Write → Add photo), but
 * every image it imported was then invisible and permanent: no list, no
 * delete. On a device where photos are large and storage is tight, a library
 * you can only ever add to is a bug, not a missing nicety.
 *
 * Deliberately not a copy of the desktop grid: that one is built around
 * dragging an asset onto a page, which has no touch equivalent here. Placing
 * an image stays in Write, where the text is; this screen is for seeing and
 * removing what the project holds.
 */
export function MobileAssetsView({ projectId, onBack }: MobileAssetsViewProps) {
  const assets = useAssetStore((s) => s.byProject[projectId] ?? EMPTY_ASSETS)
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  const importFiles = useAssetStore((s) => s.importFiles)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col bg-background">
      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-1.5 border-b border-border bg-panel px-3 py-3 text-left active:bg-hover"
      >
        <ChevronLeft className="size-4 shrink-0 text-text-muted" />
        <span className="text-[15px] font-medium text-text-secondary">More</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (!files.length) return
          setUploadError(null)
          void importFiles(projectId, files).then(({ failed }) => {
            if (failed.length === 0) return
            setUploadError(
              failed.length === 1 ? `${failed[0].name}: ${failed[0].reason}` : `${failed.length} files couldn't be added.`,
            )
          })
        }}
      />

      <div className="flex shrink-0 flex-col gap-1 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-text-secondary">
            {assets.length === 0 ? 'No images yet' : `${assets.length} image${assets.length === 1 ? '' : 's'}`}
          </p>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="size-3.5" />
            Add images
          </Button>
        </div>
        <UploadError message={uploadError} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {assets.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="No images yet"
            description="Add illustrations here, or straight into a chapter with Add photo while writing."
            className="py-10"
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-6">
            {assets.map((asset) => {
              const url = getObjectUrl(asset.id)
              const confirming = confirmingId === asset.id
              return (
                <div key={asset.id} className="flex flex-col gap-1.5">
                  <div className="relative aspect-square overflow-hidden rounded-[var(--radius-image)] border border-border bg-background-secondary">
                    {url && <img src={url} alt={asset.name} className="size-full object-cover" />}
                    {/* Two taps to delete, because a single mistap on a phone
                        would otherwise destroy an illustration outright and
                        the grid gives no room for an undo affordance. */}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirming) {
                          void removeAssetWithHistory(projectId, asset.id)
                          setConfirmingId(null)
                        } else {
                          setConfirmingId(asset.id)
                        }
                      }}
                      onBlur={() => confirming && setConfirmingId(null)}
                      aria-label={confirming ? `Confirm delete ${asset.name}` : `Delete ${asset.name}`}
                      className={
                        confirming
                          ? 'absolute inset-x-2 bottom-2 rounded-[var(--radius-button)] bg-danger px-2 py-1.5 text-[12px] font-medium text-danger-foreground'
                          : 'absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded-full bg-panel/90 text-text-secondary backdrop-blur active:text-danger'
                      }
                    >
                      {confirming ? 'Delete?' : <Trash2 className="size-3.5" />}
                    </button>
                  </div>
                  <p className="truncate text-[11px] text-text-muted" title={asset.name}>
                    {asset.name}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

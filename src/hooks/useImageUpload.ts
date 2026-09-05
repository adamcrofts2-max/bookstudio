import { useRef, useState, type ChangeEvent, type MouseEvent } from 'react'

import { useAssetStore } from '@/store/assetStore'

/**
 * Shared "click to browse, pick an image file, import it as a real asset"
 * flow (Phase 51) — the same shape three separate call sites need
 * (`CoverImageUploadButton`, the block inserter's "Image" option, and
 * converting an image-kind placeholder into a real photo): a hidden file
 * input, a function to open the native picker, and an `onChange` that
 * imports the picked file via `assetStore.importFiles` and hands the
 * caller back a real asset id. Resetting the input's value after every
 * pick lets choosing the exact same file twice in a row still fire
 * `onChange` a second time.
 *
 * Returns `inputProps` to spread directly onto a real `<input type="file">`
 * — kept as a real hidden input (not a synthetic click on a detached one)
 * so the browser's own file-picker security model stays happy.
 *
 * Also returns `error`: a picked file that can't be decoded (a corrupt or
 * mislabelled image) used to reject out of `importFiles` and surface as an
 * unhandled rejection — the user tapped "Add cover image", chose a photo,
 * and nothing whatsoever happened. Callers should render this somewhere
 * near their control; it clears as soon as the next pick starts.
 */
export function useImageUpload(projectId: string, onUploaded: (assetId: string) => void) {
  const importFiles = useAssetStore((s) => s.importFiles)
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const openPicker = () => inputRef.current?.click()

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    const { imported, failed } = await importFiles(projectId, [file])
    const created = imported[0]
    if (created) onUploaded(created.id)
    else setError(failed[0]?.reason ?? 'That file could not be imported.')
  }

  const stopPropagation = (e: MouseEvent) => e.stopPropagation()

  return {
    openPicker,
    error,
    inputProps: {
      ref: inputRef,
      type: 'file' as const,
      accept: 'image/*',
      className: 'hidden',
      onClick: stopPropagation,
      onChange: handleChange,
    },
  }
}

/**
 * The same flow for several photos at once, for the one block type that
 * needs more than one asset before a valid block exists: `gallery`.
 *
 * A separate hook rather than a `multiple` flag on `useImageUpload`, because
 * the callback shape genuinely differs — a gallery is created from the whole
 * selection in one insert, and handing its caller one id at a time would
 * either insert one gallery per photo or make every existing single-image
 * caller deal with an array it will never have more than one entry in.
 *
 * Partial success is a success: `importFiles` isolates each file, so four
 * good photos and one corrupt one make a four-photo gallery plus a message,
 * not a silent no-op.
 */
export function useImagesUpload(projectId: string, onUploaded: (assetIds: string[]) => void) {
  const importFiles = useAssetStore((s) => s.importFiles)
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const openPicker = () => inputRef.current?.click()

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setError(null)
    const { imported, failed } = await importFiles(projectId, files)
    if (imported.length > 0) onUploaded(imported.map((asset) => asset.id))
    if (failed.length > 0) {
      setError(
        imported.length > 0
          ? `${failed.length} of ${files.length} couldn't be imported.`
          : (failed[0]?.reason ?? 'Those files could not be imported.'),
      )
    }
  }

  const stopPropagation = (e: MouseEvent) => e.stopPropagation()

  return {
    openPicker,
    error,
    inputProps: {
      ref: inputRef,
      type: 'file' as const,
      accept: 'image/*',
      multiple: true,
      className: 'hidden',
      onClick: stopPropagation,
      onChange: handleChange,
    },
  }
}

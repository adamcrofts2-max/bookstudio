/** Rasterises any image blob (PNG/JPEG/WebP/whatever the browser can
 * decode) to PNG bytes via canvas, so the exporter only ever needs
 * pdf-lib's `embedPng` regardless of the source format.
 *
 * `grayscale` bakes a black-and-white conversion into the rasterised pixels
 * — a CSS `filter` (used for the on-screen preview in `BlockContent.tsx`)
 * has zero effect on an embedded PDF image, so desaturation for print export
 * has to happen here, at the pixel level, before the PNG bytes are read
 * back. Uses the canvas 2D context's `filter` property (supported broadly in
 * Chromium, which this app targets) rather than a manual per-pixel
 * getImageData/putImageData luminance conversion — see docs/STATUS.md for
 * why, and the honest caveat that this couldn't be exercised in the
 * jsdom-based smoke tests (no real canvas/image decode there). */
export async function blobToPng(blob: Blob, grayscale = false): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    if (grayscale) ctx.filter = 'grayscale(100%)'
    ctx.drawImage(img, 0, 0)
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!pngBlob) throw new Error('Failed to rasterise image for export')
    const bytes = new Uint8Array(await pngBlob.arrayBuffer())
    return { bytes, width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

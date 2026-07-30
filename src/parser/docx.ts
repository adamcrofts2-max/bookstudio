import mammoth from 'mammoth'

import type { Chapter } from '@/types/content'
import type { ImageAsset } from '@/types/asset'
import { generateId } from '@/utils'
import { putAsset } from '@/store/assetDb'
import { parseHtmlDocument } from '@/parser/html'

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/** Parses a .docx manuscript, extracting embedded images straight into the
 * project's asset library (IndexedDB) rather than leaving them as inline
 * base64 — keeps the Content layer free of binary payloads. */
export async function parseDocx(file: File, fallbackTitle: string, projectId: string): Promise<Chapter[]> {
  const arrayBuffer = await file.arrayBuffer()
  const assetIdByImageIndex = new Map<number, string>()
  let imageIndex = 0

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const index = imageIndex++
        const base64 = await image.read('base64')
        const blob = base64ToBlob(base64, image.contentType)
        const assetId = generateId('asset')
        const dims = await new Promise<{ width: number; height: number }>((resolve) => {
          const url = URL.createObjectURL(blob)
          const el = new Image()
          el.onload = () => {
            resolve({ width: el.naturalWidth, height: el.naturalHeight })
            URL.revokeObjectURL(url)
          }
          el.onerror = () => resolve({ width: 0, height: 0 })
          el.src = url
        })
        const asset: ImageAsset = {
          id: assetId,
          projectId,
          name: `image-${index + 1}`,
          mimeType: image.contentType,
          size: blob.size,
          width: dims.width,
          height: dims.height,
          createdAt: new Date().toISOString(),
        }
        await putAsset(asset, blob)
        assetIdByImageIndex.set(index, assetId)
        return { src: '', 'data-asset-index': String(index) }
      }),
    },
  )

  return parseHtmlDocument(result.value, fallbackTitle, {
    resolveImage: (img) => {
      const idx = img.getAttribute('data-asset-index')
      return idx !== null ? assetIdByImageIndex.get(Number(idx)) : undefined
    },
  })
}

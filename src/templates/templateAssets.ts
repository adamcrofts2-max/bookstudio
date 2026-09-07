import type { BookTemplate, TemplateAsset } from '@/types/bookTemplate'
import type { CoverElement, StructuralPage } from '@/types/structuralPage'
import type { ImageAsset } from '@/types/asset'
import { getAssetBlob, listAssetsForProject, putAsset } from '@/store/assetDb'
import { getTemplateAssetBlob, putTemplateAsset } from '@/store/templateAssetDb'
import { generateId } from '@/utils/id'

/**
 * Moving a template's images across the project boundary, in both
 * directions (Phase 169).
 *
 * The pure part — finding which asset ids a page set references, and
 * rewriting them — lives in `collectAssetIds` and `buildTemplate`'s
 * `assetIdMap`, so it is unit-testable without a browser. The copying is
 * here, because it needs IndexedDB.
 */

/**
 * Every asset id a structural page set references, deduplicated. Two
 * places hold one: a page's `content.imageAssetId` (cover art, a
 * dedication's ornament, a part-title image) and a cover's positioned
 * `elements` of kind `image`.
 */
export function collectAssetIds(pages: StructuralPage[]): string[] {
  const ids = new Set<string>()
  for (const page of pages) {
    const contentId = (page.content as { imageAssetId?: string } | undefined)?.imageAssetId
    if (contentId) ids.add(contentId)
    const elements = (page as { elements?: CoverElement[] }).elements
    if (Array.isArray(elements)) {
      for (const element of elements) {
        if (element.kind === 'image' && element.imageAssetId) ids.add(element.imageAssetId)
      }
    }
  }
  return [...ids]
}

/**
 * Copies the images a project's pages reference into template-scoped
 * storage, returning the metadata to store on the template and the id map
 * `buildTemplate` needs to rewrite the references.
 *
 * An asset whose blob has gone missing is simply left out of the map, and
 * `buildTemplate` then strips that reference exactly as it always did — a
 * template with one fewer image is a far better outcome than a save that
 * throws.
 */
export async function captureTemplateAssets(
  pages: StructuralPage[],
  projectId: string,
): Promise<{ assets: TemplateAsset[]; assetIdMap: Record<string, string> }> {
  const referenced = collectAssetIds(pages)
  if (referenced.length === 0) return { assets: [], assetIdMap: {} }

  const projectAssets = await listAssetsForProject(projectId)
  const byId = new Map(projectAssets.map((asset) => [asset.id, asset]))

  const assets: TemplateAsset[] = []
  const assetIdMap: Record<string, string> = {}
  for (const sourceId of referenced) {
    const blob = await getAssetBlob(sourceId)
    if (!blob) continue
    const source = byId.get(sourceId)
    const asset: TemplateAsset = {
      id: generateId('tplasset'),
      name: source?.name ?? 'Template image',
      mimeType: source?.mimeType ?? blob.type ?? 'image/png',
      size: source?.size ?? blob.size,
      width: source?.width ?? 0,
      height: source?.height ?? 0,
      createdAt: new Date().toISOString(),
    }
    await putTemplateAsset(asset, blob)
    assets.push(asset)
    assetIdMap[sourceId] = asset.id
  }
  return { assets, assetIdMap }
}

/**
 * The other direction: copies a template's images into a project's own
 * asset library under fresh ids, so they show up in the Assets tab and are
 * deleted with the project like any other image.
 *
 * Fresh ids rather than the template's, for the same reason
 * `pagesForNewProject` regenerates page ids — two projects created from one
 * template must not share an asset id, or deleting the first project's copy
 * would take the second's reference with it.
 */
export async function materialiseTemplateAssets(
  template: BookTemplate,
  projectId: string,
): Promise<Record<string, string>> {
  const assetIdMap: Record<string, string> = {}
  for (const asset of template.assets ?? []) {
    const blob = await getTemplateAssetBlob(asset.id)
    if (!blob) continue
    const copy: ImageAsset = {
      id: generateId('asset'),
      projectId,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      createdAt: new Date().toISOString(),
    }
    await putAsset(copy, blob)
    assetIdMap[asset.id] = copy.id
  }
  return assetIdMap
}

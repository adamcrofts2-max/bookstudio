import type { BookTemplate } from '@/types/bookTemplate'
import type { CoverElement, StructuralPage } from '@/types/structuralPage'
import { generateId } from '@/utils/id'

/**
 * Prepares a template's structural pages for a project that is about to
 * receive them.
 *
 * Ids are regenerated rather than reused. Structural pages are keyed by
 * project in `structuralPageStore`, so reuse would not collide there — but
 * `selectionStore` and the Inspector address pages by bare id, and two open
 * projects sharing a page id is exactly the sort of coincidence that
 * produces a bug nobody can reproduce. Fresh ids cost nothing.
 */
export function pagesForNewProject(
  template: BookTemplate,
  /**
   * Template asset id -> the new project's own copy, from
   * `templateAssets.ts`'s `materialiseTemplateAssets` (Phase 169). Omitted
   * means the template carries no images, or that copying them failed — in
   * which case the reference is dropped rather than left pointing at a blob
   * the project cannot read.
   */
  assetIdMap: Record<string, string> = {},
): StructuralPage[] {
  return template.structuralPages.map((page) => {
    const content = { ...(page.content as Record<string, unknown>) }
    const contentId = content['imageAssetId']
    if (typeof contentId === 'string') {
      if (assetIdMap[contentId]) content['imageAssetId'] = assetIdMap[contentId]
      else delete content['imageAssetId']
    }
    const next = { ...page, id: generateId('page'), content } as StructuralPage & { elements?: CoverElement[] }
    if (Array.isArray(next.elements)) {
      next.elements = next.elements.map((element) =>
        element.kind === 'image'
          ? { ...element, imageAssetId: element.imageAssetId ? assetIdMap[element.imageAssetId] : undefined }
          : element,
      )
    }
    return next as StructuralPage
  })
}

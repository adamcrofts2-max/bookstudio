import type { BookTemplate } from '@/types/bookTemplate'
import { TEXT_CONTENT_KEYS } from '@/types/bookTemplate'
import type { TemplateAsset } from '@/types/bookTemplate'
import type { StructuralPage } from '@/types/structuralPage'
import type { CoverElement } from '@/types/structuralPage'

/**
 * Turns a live project into a reusable template.
 *
 * Pure: takes everything it needs as arguments and returns a plain value,
 * touching no store. That keeps it directly testable and keeps the "which
 * layer may mutate what" rule intact — the caller writes to
 * `templateStore`, this function only shapes the data.
 */

/**
 * Rewrites a page's image references to the template's own copies, and
 * strips any it has no copy of.
 *
 * Before Phase 169 this only ever stripped, because a project asset id
 * resolves to nothing in the project a template is later applied to. It now
 * takes a map from `templateAssets.ts`'s `captureTemplateAssets`, which has
 * already copied the bytes into template-scoped storage. An id missing from
 * the map is stripped exactly as before — a template with one fewer image
 * beats a template that renders a broken one.
 *
 * The old version also cleared the wrong field on cover elements: it set
 * `assetId`, which `CoverImageElement` does not have (the field is
 * `imageAssetId`), so the excess property was written and the real
 * reference travelled untouched. Every template saved from a project with a
 * positioned cover image therefore carried a dangling id into the next
 * book. Caught while writing `collectAssetIds` against the real type.
 */
function remapImages<T extends StructuralPage>(page: T, assetIdMap: Record<string, string>): T {
  const content = { ...(page.content as Record<string, unknown>) }
  const contentId = content['imageAssetId']
  if (typeof contentId === 'string' && assetIdMap[contentId]) content['imageAssetId'] = assetIdMap[contentId]
  else delete content['imageAssetId']

  const next = { ...page, content } as T & { elements?: CoverElement[] }
  if (Array.isArray(next.elements)) {
    next.elements = next.elements.map((element) => {
      if (element.kind !== 'image') return element
      const mapped = element.imageAssetId ? assetIdMap[element.imageAssetId] : undefined
      return { ...element, imageAssetId: mapped }
    })
  }
  return next
}

/** Clears authored words while keeping every layout, colour and typography
 * decision — the "structure only" half of the save-time toggle. */
function clearText<T extends StructuralPage>(page: T): T {
  const content = { ...(page.content as Record<string, unknown>) }
  for (const key of TEXT_CONTENT_KEYS) delete content[key]

  const next = { ...page, content } as T & { elements?: CoverElement[] }
  if (Array.isArray(next.elements)) {
    next.elements = next.elements.map((element) =>
      element.kind === 'text' ? { ...element, text: '' } : element.kind === 'badge' ? { ...element, text: '' } : element,
    )
  }
  return next
}

export interface BuildTemplateInput {
  name: string
  description: string
  settings: BookTemplate['settings']
  category: BookTemplate['category']
  bookForm?: BookTemplate['bookForm']
  customTheme: BookTemplate['customTheme']
  structuralPages: StructuralPage[]
  /** `true` keeps imprint boilerplate, copyright wording and back-cover copy
   * — what a series genuinely wants to repeat. `false` keeps the page set
   * and its design but no words. */
  includeContent: boolean
  /**
   * Project asset id -> template asset id, from `captureTemplateAssets`.
   * Omitted (or empty) means every image reference is stripped, which is
   * what this function did unconditionally before Phase 169.
   */
  assetIdMap?: Record<string, string>
  /** Metadata for the images the map points at, stored on the template. */
  assets?: TemplateAsset[]
}

export function buildTemplate(input: BuildTemplateInput): Omit<BookTemplate, 'id' | 'createdAt' | 'schemaVersion'> {
  const pages = input.structuralPages
    .map((page) => remapImages(page, input.assetIdMap ?? {}))
    .map((page) => (input.includeContent ? page : clearText(page)))

  return {
    name: input.name.trim(),
    description: input.description.trim(),
    settings: input.settings,
    category: input.category,
    ...(input.bookForm ? { bookForm: input.bookForm } : {}),
    customTheme: input.customTheme,
    structuralPages: pages,
    ...(input.assets && input.assets.length > 0 ? { assets: input.assets } : {}),
    includesContent: input.includeContent,
  }
}

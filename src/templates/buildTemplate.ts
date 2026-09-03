import type { BookTemplate } from '@/types/bookTemplate'
import { TEXT_CONTENT_KEYS } from '@/types/bookTemplate'
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

/** Strips a page's image reference. Assets are per-project IndexedDB blobs,
 * so an id captured here resolves to nothing in the project the template is
 * later applied to — see `BookTemplate.structuralPages`. */
function stripImages<T extends StructuralPage>(page: T): T {
  const content = { ...(page.content as Record<string, unknown>) }
  delete content['imageAssetId']

  const next = { ...page, content } as T & { elements?: CoverElement[] }
  if (Array.isArray(next.elements)) {
    next.elements = next.elements.map((element) =>
      element.kind === 'image' ? { ...element, assetId: '' } : element,
    )
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
}

export function buildTemplate(input: BuildTemplateInput): Omit<BookTemplate, 'id' | 'createdAt' | 'schemaVersion'> {
  const pages = input.structuralPages
    .map((page) => stripImages(page))
    .map((page) => (input.includeContent ? page : clearText(page)))

  return {
    name: input.name.trim(),
    description: input.description.trim(),
    settings: input.settings,
    category: input.category,
    ...(input.bookForm ? { bookForm: input.bookForm } : {}),
    customTheme: input.customTheme,
    structuralPages: pages,
    includesContent: input.includeContent,
  }
}

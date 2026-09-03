import type { BookTemplate } from '@/types/bookTemplate'
import type { StructuralPage } from '@/types/structuralPage'
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
export function pagesForNewProject(template: BookTemplate): StructuralPage[] {
  return template.structuralPages.map((page) => ({ ...page, id: generateId('page') }) as StructuralPage)
}

import type { ProjectCategory, ProjectSettings, BookForm } from '@/types/project'
import type { StructuralPage } from '@/types/structuralPage'
import type { CustomTheme } from '@/store/customThemeStore'

/**
 * Layer 3 (Theme) + Layer 1 (Project) — a reusable "this is how a book in
 * this series looks" bundle: page setup, theme, and the full set of
 * structural pages with their design and (optionally) their text.
 *
 * Deliberately global rather than per-project, exactly like
 * `customThemeStore`'s themes: the entire point is to reuse it across
 * projects — a publisher producing a series wants volume two to open with
 * volume one's page structure, imprint boilerplate and cover treatment
 * already in place.
 *
 * Deliberately NOT a manuscript. A template carries presentation and
 * structure only; chapters never travel in one. That keeps the existing
 * content/presentation separation intact (`docs/SYSTEM_ARCHITECTURE.md`) and
 * is the distinction between this and a `.bookstudio` project file, which
 * bundles a whole project including its manuscript.
 */
export const BOOK_TEMPLATE_VERSION = 1

/**
 * One image carried by a template — a publisher's mark, a series device, a
 * cover treatment. The bytes live in `store/templateAssetDb.ts`; this is
 * only what the template itself needs to know about them, small enough to
 * sit in `localStorage` alongside the rest of the template.
 *
 * Shaped like `ImageAsset` minus `projectId`, deliberately: a template
 * belongs to no project, and the copy made when the template is applied
 * becomes an ordinary project asset with a fresh id.
 */
export interface TemplateAsset {
  id: string
  name: string
  mimeType: string
  size: number
  width: number
  height: number
  createdAt: string
}

export interface BookTemplate {
  id: string
  schemaVersion: number
  name: string
  description: string
  createdAt: string
  /** Page setup: trim size, margins, bleed, unit, colour profile, language.
   * `themeId` travels here too, resolved against `customTheme` below. */
  settings: ProjectSettings
  /** Seeds the new project's category/book-form so Develop starts in the
   * right shape, same as picking them by hand would. */
  category: ProjectCategory
  bookForm?: BookForm
  /**
   * Bundled by value, not by reference, when the template's theme is a
   * custom one. A template that merely pointed at a theme id would silently
   * lose its typography the day that theme was deleted — and a template's
   * whole job is to still work months later.
   */
  customTheme: CustomTheme | null
  /**
   * The full structural-page set, with ids regenerated at apply time.
   *
   * Image references (`imageAssetId`, and a cover element's `assetId`) point
   * at `assets` below, **not** at the project the template was saved from.
   * Until Phase 169 they were stripped instead: assets are per-project blobs
   * in IndexedDB (`store/assetDb.ts`), so an id captured from one project
   * resolves to nothing in another, and a template that kept them would
   * apply cleanly and then render missing images. Copying the bytes into
   * template-scoped storage is what makes keeping them honest.
   */
  structuralPages: StructuralPage[]
  /**
   * Images this template carries, by value in bytes (in
   * `store/templateAssetDb.ts`) and by metadata here. Absent on every
   * template saved before Phase 169 — those simply carry no images, which
   * is exactly what they carried before, so there is nothing to migrate.
   */
  assets?: TemplateAsset[]
  /** Whether page text (imprint boilerplate, copyright wording, back-cover
   * copy) was kept at save time. Surfaced in the template list so it is
   * obvious what applying it will bring. */
  includesContent: boolean
}

/**
 * Content keys that hold authored words, as opposed to layout/positioning.
 *
 * Enumerated explicitly rather than inferred by value type, because several
 * genuinely-layout fields are also strings (`layout`, `fontChoice`,
 * `overlayStyle`) and clearing those would destroy the very design the
 * template exists to carry.
 */
export const TEXT_CONTENT_KEYS: readonly string[] = [
  'title',
  'subtitle',
  'author',
  'text',
  'blurb',
  'authorBio',
  'entries',
  'isbn',
  'edition',
  'printerInfo',
]

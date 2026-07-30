/**
 * Layer 2 (additive) — Structural Pages
 *
 * `docs/MODULAR_PAGE_SYSTEM_PLAN.md`, Milestone 2. A new, separate concept
 * from `Chapter`/`ContentBlock` (see `src/types/content.ts`): front-matter
 * and back-matter pages that don't reflow — Cover, Title Page, Copyright,
 * Blank Page today; ~30 more types queued for later milestones per the
 * plan's §7.4 batching.
 *
 * Discriminated union, exactly like `ContentBlock` — not a generic untyped
 * `content: Record<string, unknown>` bag, per this codebase's established
 * convention (see `docs/MODULAR_PAGE_SYSTEM_PLAN.md` §6 and Milestone 1's
 * block-type registry).
 *
 * Purely additive: `Manuscript.chapters`/`ContentBlock` are untouched by
 * this file. `structuralPageStore.ts` defaults every project's structural
 * pages to `[]` — existing projects need zero migration.
 */

export type StructuralPageCategory = 'front-matter' | 'back-matter'

interface BaseStructuralPage {
  id: string
  category: StructuralPageCategory
  order: number
  /** Reserved for a future theme-extension milestone — always undefined
   * today, never read. */
  themeOverrides?: Record<string, unknown>
  metadata?: Record<string, unknown>
  /**
   * Asset ids this page references (e.g. a cover background image) — lets
   * future asset-cleanup logic know a structural page holds a reference,
   * mirroring how `ImageBlock.assetId` works today. Kept in sync with
   * `CoverPage.content.imageAssetId` by `structuralPageStore.updatePageContent`.
   */
  assets?: string[]
  printSettings?: Record<string, unknown>
  exportSettings?: Record<string, unknown>
}

export interface CoverPage extends BaseStructuralPage {
  type: 'cover'
  content: { title?: string; subtitle?: string; author?: string; imageAssetId?: string }
}

export interface TitlePage extends BaseStructuralPage {
  type: 'title-page'
  content: { title?: string; subtitle?: string; author?: string }
}

export interface CopyrightPage extends BaseStructuralPage {
  type: 'copyright'
  content: { text?: string }
}

export interface BlankStructuralPage extends BaseStructuralPage {
  type: 'blank'
  content: Record<string, never>
}

/**
 * Phase 20 (Milestone 4, first batch of 5): five more front-matter types,
 * following the exact same discriminated-union shape as the 4 above — see
 * `src/structuralPages/types/{halfTitle,dedication,foreword,preface,
 * acknowledgements}.tsx` and `docs/STATUS.md`'s Phase 20 entry.
 */
export interface HalfTitlePage extends BaseStructuralPage {
  type: 'half-title'
  content: { title?: string }
}

export interface DedicationPage extends BaseStructuralPage {
  type: 'dedication'
  content: { text?: string }
}

export interface ForewordPage extends BaseStructuralPage {
  type: 'foreword'
  content: { text?: string; authorName?: string }
}

export interface PrefacePage extends BaseStructuralPage {
  type: 'preface'
  content: { text?: string }
}

export interface AcknowledgementsPage extends BaseStructuralPage {
  type: 'acknowledgements'
  content: { text?: string }
}

export type StructuralPage =
  | CoverPage
  | TitlePage
  | CopyrightPage
  | BlankStructuralPage
  | HalfTitlePage
  | DedicationPage
  | ForewordPage
  | PrefacePage
  | AcknowledgementsPage
export type StructuralPageType = StructuralPage['type']

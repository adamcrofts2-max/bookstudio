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

export type StructuralPage = CoverPage | TitlePage | CopyrightPage | BlankStructuralPage
export type StructuralPageType = StructuralPage['type']

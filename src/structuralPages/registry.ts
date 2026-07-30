import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

import type { StructuralPage, StructuralPageCategory, StructuralPageType } from '@/types/structuralPage'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'

import { coverPageType } from '@/structuralPages/types/cover'
import { halfTitlePageType } from '@/structuralPages/types/halfTitle'
import { titlePageType } from '@/structuralPages/types/titlePage'
import { copyrightPageType } from '@/structuralPages/types/copyright'
import { dedicationPageType } from '@/structuralPages/types/dedication'
import { forewordPageType } from '@/structuralPages/types/foreword'
import { prefacePageType } from '@/structuralPages/types/preface'
import { acknowledgementsPageType } from '@/structuralPages/types/acknowledgements'
import { conclusionPageType } from '@/structuralPages/types/conclusion'
import { appendixPageType } from '@/structuralPages/types/appendix'
import { aboutTheAuthorPageType } from '@/structuralPages/types/aboutTheAuthor'
import { bibliographyPageType } from '@/structuralPages/types/bibliography'
import { glossaryPageType } from '@/structuralPages/types/glossary'
import { indexPageType } from '@/structuralPages/types/indexPage'
import { isbnPagePageType } from '@/structuralPages/types/isbnPage'
import { barcodePageType } from '@/structuralPages/types/barcode'
import { blankPageType } from '@/structuralPages/types/blank'

/**
 * Props every structural-page type's `Render` component receives. Mirrors
 * `src/blocks/registry.ts`'s `BlockRenderProps` pattern, with `projectId`
 * added so a type (e.g. Copyright, whose default boilerplate text wants the
 * Title Page's author) can read sibling structural pages from
 * `structuralPageStore` via its own hooks, the same way `image.tsx`'s
 * `ImageRender` reads `assetStore` directly rather than having every asset
 * threaded through props.
 */
export interface StructuralPageRenderProps {
  page: StructuralPage
  theme: ResolvedBookTheme
  pageBox: PageBox
  projectId: string
  /**
   * Every structural page in the project (both categories) — lets a type
   * look up a sibling (e.g. Copyright's default boilerplate wants the
   * Title Page's author) without importing `structuralPageStore` directly
   * from `src/structuralPages/types/*`, which would create an import cycle
   * (`structuralPageStore` itself imports this registry to resolve
   * `defaultContent()` for `insertPage`). `Page.tsx` supplies this from the
   * one store read it already needs to do to resolve which page to render.
   */
  siblingPages: StructuralPage[]
  selected: boolean
  onSelect: () => void
  onCommit: (updates: Partial<StructuralPage['content']>) => void
}

/**
 * Everything one `StructuralPageType` needs to participate in on-screen
 * rendering and PDF export — see docs/MODULAR_PAGE_SYSTEM_PLAN.md,
 * Milestone 2. Both `Render` and `drawPdf` are REQUIRED for every entry: a
 * type isn't considered shipped until on-screen and PDF output both exist
 * and visually match (the plan's own WYSIWYG-drift risk mitigation,
 * inherited from Milestone 1's block-type registry).
 */
export interface StructuralPageTypeDefinition {
  id: StructuralPageType
  /** The DEFAULT category offered when inserting this type — Cover/Title
   * Page/Copyright are front-matter-only for this milestone; Blank can be
   * inserted into either (the actual category used at insert time is
   * whatever the Sidebar's "Add Page" affordance was invoked from, not this
   * field — see `structuralPageStore.insertPage`). */
  category: StructuralPageCategory
  label: string
  icon: LucideIcon
  Render: ComponentType<StructuralPageRenderProps>
  drawPdf: (ctx: DrawCtx, page: StructuralPage, theme: ResolvedBookTheme, pageBox: PageBox) => Promise<void> | void
  defaultContent: () => StructuralPage['content']
}

const STRUCTURAL_PAGE_REGISTRY: Record<StructuralPageType, StructuralPageTypeDefinition> = {
  cover: coverPageType,
  'half-title': halfTitlePageType,
  'title-page': titlePageType,
  copyright: copyrightPageType,
  dedication: dedicationPageType,
  foreword: forewordPageType,
  preface: prefacePageType,
  acknowledgements: acknowledgementsPageType,
  conclusion: conclusionPageType,
  appendix: appendixPageType,
  'about-the-author': aboutTheAuthorPageType,
  bibliography: bibliographyPageType,
  glossary: glossaryPageType,
  index: indexPageType,
  'isbn-page': isbnPagePageType,
  barcode: barcodePageType,
  blank: blankPageType,
}

export function getStructuralPageTypeDefinition(type: StructuralPageType): StructuralPageTypeDefinition | undefined {
  return STRUCTURAL_PAGE_REGISTRY[type]
}

/** All registered structural page types, in a stable display order — used
 * by the Sidebar's "Add Page" picker. */
export function listStructuralPageTypes(): StructuralPageTypeDefinition[] {
  return [
    coverPageType,
    halfTitlePageType,
    titlePageType,
    copyrightPageType,
    dedicationPageType,
    forewordPageType,
    prefacePageType,
    acknowledgementsPageType,
    conclusionPageType,
    appendixPageType,
    aboutTheAuthorPageType,
    bibliographyPageType,
    glossaryPageType,
    indexPageType,
    isbnPagePageType,
    barcodePageType,
    blankPageType,
  ]
}

import type { ComponentType } from 'react'

import type { ContentBlock, ContentBlockType } from '@/types/content'
import type { DrawCtx } from '@/pdf/exportPdf'
import type { BlockContentProps } from '@/renderer/BlockContent'

import { headingBlockType } from '@/blocks/types/heading'
import { paragraphBlockType } from '@/blocks/types/paragraph'
import { quoteBlockType } from '@/blocks/types/quote'
import { listBlockType } from '@/blocks/types/list'
import { tableBlockType } from '@/blocks/types/table'
import { imageBlockType } from '@/blocks/types/image'

/**
 * Props every block type's `Render` component receives. This is the exact
 * same shape as `BlockContent.tsx`'s public `BlockContentProps` — aliased
 * (not duplicated) so the two can never drift, and so `Page.tsx`/
 * `HeightMeasurer.tsx` see no contract change from this refactor.
 */
export type BlockRenderProps = BlockContentProps

/**
 * Everything one `ContentBlockType` needs to participate in on-screen
 * rendering, PDF export, and pagination-spacing — the single place a new
 * block type must be registered (see docs/MODULAR_PAGE_SYSTEM_PLAN.md,
 * Milestone 1). Replaces the three parallel switches that used to live in
 * `BlockContent.tsx`, `exportPdf.ts` and `paginate.ts`.
 */
export interface BlockTypeDefinition {
  id: ContentBlockType
  /** React component — calls only the hooks its own block type actually
   * needs (not the "call everything unconditionally" pattern the old
   * monolithic switch used). */
  Render: ComponentType<BlockRenderProps>
  /** Mirrors `exportPdf.ts`'s old `drawBlock` case for this type exactly. */
  drawPdf: (ctx: DrawCtx, block: ContentBlock, dropCap: boolean) => Promise<void> | void
  /** Mirrors `paginate.ts`'s old `blockSpacing` case for this type. Omitted
   * (defaults to 0 via `getBlockTypeDefinition`'s consumer) for types that
   * had no entry in the old switch's non-default cases. */
  blockSpacing?: (block: ContentBlock) => number
}

const BLOCK_REGISTRY: Record<ContentBlockType, BlockTypeDefinition> = {
  heading: headingBlockType,
  paragraph: paragraphBlockType,
  quote: quoteBlockType,
  list: listBlockType,
  table: tableBlockType,
  image: imageBlockType,
}

export function getBlockTypeDefinition(type: ContentBlockType): BlockTypeDefinition | undefined {
  return BLOCK_REGISTRY[type]
}

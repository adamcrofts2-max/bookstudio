/**
 * Layer 1 — Project
 *
 * Metadata, preferences and settings that describe a book project as a
 * whole. This layer never stores manuscript content (see `content.ts`)
 * or presentation rules (see `theme.ts`) — see
 * docs/SYSTEM_ARCHITECTURE.md for why these stay separate.
 */

import type { StyleGuide } from '@/virtualEditor/types'

export type TrimSize =
  | '5x8'
  | '5.5x8.5'
  | '6x9'
  | '7x10'
  | '8.5x11'
  | 'custom'

export interface PageMargins {
  top: number
  bottom: number
  inner: number
  outer: number
}

export interface ProjectSettings {
  trimSize: TrimSize
  customTrimSize?: { width: number; height: number }
  margins: PageMargins
  /** Unit used when displaying measurements in the UI. Stored values are always in millimetres. */
  unit: 'mm' | 'in'
  bleed: number
  themeId: string
  language: string
  /** Project-level editorial preferences consulted by the Virtual Editor
   * (see `docs/VIRTUAL_EDITOR.md` § Style Guide). Optional and never
   * migrated — a project persisted before this field existed simply has
   * no `styleGuide` key; every read site falls back to
   * `DEFAULT_STYLE_GUIDE` (from `@/virtualEditor/types`) via `?? `, exactly
   * like `ImageBlock`'s optional fields in `src/types/content.ts`. */
  styleGuide?: StyleGuide
}

export type ProjectCategory =
  | 'novel'
  | 'nonfiction'
  | 'childrens'
  | 'educational'
  | 'coffee-table'
  | 'nature'
  | 'scientific'
  | 'other'

/**
 * The one binary that changes what Develop shows (Phase 83): whether the
 * eight Layer 0 categories, Outline Templates, and Timeline mean anything
 * as written for this project. Deliberately separate from `category` —
 * `category` is about genre/subject (drives trim size + example seeding),
 * `bookForm` is about whether this is a narrative or not (drives which
 * Develop nav rows show, their labels, and which Outline Template set
 * applies). `undefined` is a real third state ("not sure yet"), not a
 * missing value — Develop falls back to today's generic fiction-leaning
 * labels/templates when it's unset, exactly the pre-Phase-83 behaviour, so
 * older/undecided projects don't regress. See `docs/IDEA_SYSTEM_PLAN.md`'s
 * Milestone 1.1 revision.
 */
export type BookForm = 'fiction' | 'nonfiction'

export interface Project {
  id: string
  name: string
  category: ProjectCategory
  /** See `BookForm`'s own doc comment. Set at creation (`NewProjectDialog`),
   * changeable any time after from Project Settings — never load-bearing
   * for data, only for which Develop UI a project sees. */
  bookForm?: BookForm
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
  /** Reserved for Phase 3+ — number of generated pages, once the layout engine exists. */
  pageCount?: number
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  trimSize: '6x9',
  margins: { top: 20, bottom: 20, inner: 22, outer: 16 },
  unit: 'mm',
  bleed: 3,
  themeId: 'classic-novel',
  language: 'en',
}

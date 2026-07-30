/**
 * Layer 1 — Project
 *
 * Metadata, preferences and settings that describe a book project as a
 * whole. This layer never stores manuscript content (see `content.ts`)
 * or presentation rules (see `theme.ts`) — see
 * docs/SYSTEM_ARCHITECTURE.md for why these stay separate.
 */

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

export interface Project {
  id: string
  name: string
  category: ProjectCategory
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

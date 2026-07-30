/**
 * Layer 3 — Theme
 *
 * Controls fonts, colours, spacing, margins, component styling and page
 * decorations. Changing a theme must regenerate the book's presentation
 * without ever touching Project or Content data.
 *
 * Full theme presets arrive in Phase 4. This placeholder establishes
 * the shape so the Project Settings UI can reference a `themeId` today.
 */

export interface BookTheme {
  id: string
  name: string
  description: string
}

export const BUILT_IN_THEMES: BookTheme[] = [
  { id: 'classic-novel', name: 'Classic Novel', description: 'Minimal, traditional typography.' },
  { id: 'premium-nature', name: 'Premium Nature', description: 'Elegant serif, earth tones, large photography.' },
  { id: 'coffee-table', name: 'Coffee Table', description: 'Huge imagery, minimal text, large margins.' },
  { id: 'educational', name: 'Educational', description: 'Clear hierarchy, coloured information boxes.' },
  { id: 'childrens', name: "Children's", description: 'Rounded typography, playful spacing, bright colours.' },
]

import { BUILT_IN_THEMES } from '@/types/theme'
import { useCustomThemeStore } from '@/store/customThemeStore'

export interface ResolvedBookTheme {
  id: string
  name: string
  page: {
    background: string
    ink: string
    mutedInk: string
    accent: string
    ruleColor: string
  }
  fonts: {
    heading: string
    body: string
  }
  typography: {
    bodySize: number /* px, at 96dpi page scale */
    lineHeight: number
    justify: boolean
    dropCap: boolean
    headingWeight: number
  }
  chapterOpener: {
    numberLabel: 'word' | 'numeral' | 'none'
    topSpacer: number /* px */
  }
}

const PRESETS: Record<string, ResolvedBookTheme> = {
  'classic-novel': {
    id: 'classic-novel',
    name: 'Classic Novel',
    page: { background: '#fffdf9', ink: '#1c1c1c', mutedInk: '#5c5c58', accent: '#8a1f1f', ruleColor: '#d8d3c8' },
    fonts: { heading: '"Source Serif 4", serif', body: '"Source Serif 4", serif' },
    typography: { bodySize: 16, lineHeight: 1.65, justify: true, dropCap: true, headingWeight: 600 },
    chapterOpener: { numberLabel: 'word', topSpacer: 110 },
  },
  'premium-nature': {
    id: 'premium-nature',
    name: 'Premium Nature',
    page: { background: '#faf6ee', ink: '#2b2b22', mutedInk: '#6b6a55', accent: '#5c7a52', ruleColor: '#ded4bd' },
    fonts: { heading: '"Source Serif 4", serif', body: '"Source Serif 4", serif' },
    typography: { bodySize: 16.5, lineHeight: 1.75, justify: false, dropCap: true, headingWeight: 500 },
    chapterOpener: { numberLabel: 'none', topSpacer: 140 },
  },
  'coffee-table': {
    id: 'coffee-table',
    name: 'Coffee Table',
    page: { background: '#ffffff', ink: '#161616', mutedInk: '#7a7a7a', accent: '#161616', ruleColor: '#e6e6e6' },
    fonts: { heading: '"Source Serif 4", serif', body: '"Inter", sans-serif' },
    typography: { bodySize: 15, lineHeight: 1.6, justify: false, dropCap: false, headingWeight: 600 },
    chapterOpener: { numberLabel: 'none', topSpacer: 160 },
  },
  educational: {
    id: 'educational',
    name: 'Educational',
    page: { background: '#ffffff', ink: '#1d1d1f', mutedInk: '#666666', accent: '#2e6f8e', ruleColor: '#e3e3e3' },
    fonts: { heading: '"Inter", sans-serif', body: '"Inter", sans-serif' },
    typography: { bodySize: 15.5, lineHeight: 1.6, justify: false, dropCap: false, headingWeight: 700 },
    chapterOpener: { numberLabel: 'numeral', topSpacer: 90 },
  },
  childrens: {
    id: 'childrens',
    name: "Children's",
    page: { background: '#fff8e8', ink: '#3b2c1d', mutedInk: '#8a7259', accent: '#e0653f', ruleColor: '#f0ddb8' },
    fonts: { heading: '"Inter", sans-serif', body: '"Inter", sans-serif' },
    typography: { bodySize: 18, lineHeight: 1.8, justify: false, dropCap: false, headingWeight: 700 },
    chapterOpener: { numberLabel: 'word', topSpacer: 90 },
  },
  'modern-minimalist': {
    id: 'modern-minimalist',
    name: 'Modern Minimalist',
    page: { background: '#ffffff', ink: '#141414', mutedInk: '#737373', accent: '#141414', ruleColor: '#ececec' },
    fonts: { heading: '"Inter", sans-serif', body: '"Inter", sans-serif' },
    typography: { bodySize: 15.5, lineHeight: 1.7, justify: false, dropCap: false, headingWeight: 500 },
    chapterOpener: { numberLabel: 'numeral', topSpacer: 170 },
  },
  'academic-journal': {
    id: 'academic-journal',
    name: 'Academic Journal',
    page: { background: '#fbfbf9', ink: '#1a1a1a', mutedInk: '#5a5a5a', accent: '#1f3a5f', ruleColor: '#d9d9d3' },
    fonts: { heading: '"Source Serif 4", serif', body: '"Source Serif 4", serif' },
    typography: { bodySize: 14.5, lineHeight: 1.55, justify: true, dropCap: false, headingWeight: 600 },
    chapterOpener: { numberLabel: 'numeral', topSpacer: 80 },
  },
}

/**
 * Consults user-created themes (`customThemeStore.ts`) before falling back to
 * the hardcoded `PRESETS` map, so every call site — PDF export, on-screen
 * rendering, the Virtual Editor's checkers — resolves a custom theme exactly
 * like a built-in one, with no changes needed anywhere else. Reading
 * `useCustomThemeStore.getState()` outside React is safe (Zustand stores are
 * plain subscribable objects); this stays within the Theme layer since custom
 * themes are still theme data, just persisted separately from the hardcoded
 * presets.
 */
export function resolveTheme(themeId: string): ResolvedBookTheme {
  const custom = useCustomThemeStore.getState().customThemes.find((t) => t.id === themeId)
  if (custom) return custom
  return PRESETS[themeId] ?? PRESETS[BUILT_IN_THEMES[0].id]
}

export function listThemes(): ResolvedBookTheme[] {
  return [...Object.values(PRESETS), ...useCustomThemeStore.getState().customThemes]
}

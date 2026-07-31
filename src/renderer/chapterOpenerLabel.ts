import type { ResolvedBookTheme } from '@/theme/presets'

/** Spelled-out chapter numbers for `numberLabel: 'word'` themes (Classic
 * Novel, Children's) — "Chapter One", "Chapter Two", etc. Falls back to the
 * plain numeral once a book runs past twenty chapters. Shared between
 * `Page.tsx` (real render) and `HeightMeasurer.tsx` (off-screen measurement)
 * so the two can never disagree about what text actually gets rendered —
 * see docs/STATUS.md Phase 31 for why that measurement/render parity matters
 * here specifically. */
export const CHAPTER_NUMBER_WORDS = [
  'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty',
]

/** The exact text rendered above a chapter's title on its opener page, or
 * `null` when the theme's `chapterOpener.numberLabel` is `'none'` (Premium
 * Nature, Coffee Table). `chapterIndex` is the chapter's zero-based position
 * among all chapters (not a page number). */
export function getChapterNumberLabel(theme: ResolvedBookTheme, chapterIndex: number): string | null {
  if (theme.chapterOpener.numberLabel === 'none') return null
  if (theme.chapterOpener.numberLabel === 'word') return `Chapter ${CHAPTER_NUMBER_WORDS[chapterIndex] ?? chapterIndex + 1}`
  return `${chapterIndex + 1}`
}

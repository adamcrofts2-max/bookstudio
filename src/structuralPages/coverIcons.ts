import { Star, Award, Crown, Leaf, Feather, BookOpen, Shield, Sparkles, Quote, Heart, Medal, Trophy, BadgeCheck, Gem, type LucideIcon } from 'lucide-react'

import type { CoverIconId } from '@/types/structuralPage'

/**
 * Screen-side icon components for `CoverIconId` (see
 * `docs/COVER_CANVAS_PLAN.md` and `types/structuralPage.ts`'s `CoverIconId`
 * doc comment). Rendered directly via `lucide-react` in
 * `coverElementLayer.tsx`'s `ElementBody`.
 */
export const COVER_ICON_COMPONENTS: Record<CoverIconId, LucideIcon> = {
  star: Star,
  award: Award,
  crown: Crown,
  leaf: Leaf,
  feather: Feather,
  'book-open': BookOpen,
  shield: Shield,
  sparkles: Sparkles,
  quote: Quote,
  heart: Heart,
  medal: Medal,
  trophy: Trophy,
  'badge-check': BadgeCheck,
  gem: Gem,
}

export const COVER_ICON_LABELS: Record<CoverIconId, string> = {
  star: 'Star',
  award: 'Award',
  crown: 'Crown',
  leaf: 'Leaf',
  feather: 'Feather',
  'book-open': 'Open Book',
  shield: 'Shield',
  sparkles: 'Sparkles',
  quote: 'Quote Mark',
  heart: 'Heart',
  medal: 'Medal',
  trophy: 'Trophy',
  'badge-check': 'Verified Badge',
  gem: 'Gem',
}

/** One drawable sub-shape of an icon's 24×24 viewBox geometry. lucide icons
 * are composed of 1+ `<path>`/`<circle>` elements (e.g. `award` is a path
 * plus a circle) — `drawCoverElementsPdf` draws every node in sequence with
 * the same stroke colour/width, matching how the browser composites the SVG. */
export type CoverIconPdfNode = { type: 'path'; d: string } | { type: 'circle'; cx: number; cy: number; r: number }

/**
 * PDF-side geometry for `CoverIconId`, hand-transcribed verbatim from this
 * project's installed `lucide-react` package (`node_modules/lucide-react/
 * dist/esm/icons/*.mjs`, v1.27.0) rather than reconstructed from memory —
 * copied directly out of the exact `__iconNode` arrays those files export,
 * so the printed PDF icon is pixel-identical geometry to the on-screen
 * `lucide-react` component above, not an approximation. If `lucide-react` is
 * ever upgraded and an icon's path data changes upstream, this registry will
 * silently drift from the screen version — re-transcribe from the new
 * installed source if that ever happens (there is no automated check for
 * this today).
 *
 * All are stroke-only (no fill), `strokeLinecap`/`strokeLinejoin: round`,
 * viewBox `0 0 24 24` — lucide's standard defaults, applied uniformly by
 * `drawCoverElementsPdf` rather than stored per-icon here.
 */
export const COVER_ICON_PDF_NODES: Record<CoverIconId, CoverIconPdfNode[]> = {
  star: [
    {
      type: 'path',
      d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
    },
  ],
  award: [
    {
      type: 'path',
      d: 'm15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526',
    },
    { type: 'circle', cx: 12, cy: 8, r: 6 },
  ],
  crown: [
    {
      type: 'path',
      d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
    },
    { type: 'path', d: 'M5 21h14' },
  ],
  leaf: [
    { type: 'path', d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z' },
    { type: 'path', d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' },
  ],
  feather: [
    { type: 'path', d: 'M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z' },
    { type: 'path', d: 'M16 8 2 22' },
    { type: 'path', d: 'M17.488 15H9' },
  ],
  'book-open': [
    { type: 'path', d: 'M12 5v16' },
    {
      type: 'path',
      d: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z',
    },
  ],
  shield: [
    {
      type: 'path',
      d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    },
  ],
  sparkles: [
    {
      type: 'path',
      d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
    },
    { type: 'path', d: 'M20 2v4' },
    { type: 'path', d: 'M22 4h-4' },
    { type: 'circle', cx: 4, cy: 20, r: 2 },
  ],
  quote: [
    {
      type: 'path',
      d: 'M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z',
    },
    {
      type: 'path',
      d: 'M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z',
    },
  ],
  heart: [
    {
      type: 'path',
      d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5',
    },
  ],
  medal: [
    {
      type: 'path',
      d: 'M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15',
    },
    { type: 'path', d: 'M11 12 5.12 2.2' },
    { type: 'path', d: 'm13 12 5.88-9.8' },
    { type: 'path', d: 'M8 7h8' },
    { type: 'circle', cx: 12, cy: 17, r: 5 },
    { type: 'path', d: 'M12 18v-2h-.5' },
  ],
  trophy: [
    { type: 'path', d: 'M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2' },
    { type: 'path', d: 'M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2' },
    { type: 'path', d: 'M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3' },
    { type: 'path', d: 'M4 22h16' },
    { type: 'path', d: 'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z' },
    { type: 'path', d: 'M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3' },
  ],
  'badge-check': [
    {
      type: 'path',
      d: 'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z',
    },
    { type: 'path', d: 'm9 12 2 2 4-4' },
  ],
  gem: [
    { type: 'path', d: 'M10.5 3 8 9l4 13 4-13-2.5-6' },
    {
      type: 'path',
      d: 'M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z',
    },
    { type: 'path', d: 'M2 9h20' },
  ],
}

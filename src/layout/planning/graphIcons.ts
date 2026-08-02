import { Book, BookMarked, BookOpen, Clock, FlaskConical, Image, Lightbulb, MapPin, Ruler, SpellCheck2, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Layer0EntityKind } from '@/types/layer0'

/**
 * Every kind of node that can appear anywhere Develop mode shows more than
 * one entity kind at once (an entity-kind nav row, an entity list row, the
 * Book Graph) — the eight `Layer0EntityKind`s plus the three kinds Layer 0
 * itself doesn't own: `idea` (Idea System, `types/idea.ts`), `chapter`
 * (Layer 2 Content, read-only here), and `book` (Phase 99's synthetic hub
 * node — the book itself, not a Layer 0 entity or a Layer 2 chapter, see
 * `BookGraphView.tsx`'s doc comment). One icon per kind is the actual
 * differentiator once a view mixes kinds together (user, 2026-08-02: "man
 * icon by character for example") — colour stays reserved for status/
 * semantic meaning per `CLAUDE.md`'s design-token discipline, so kind is
 * legible from shape alone, not a bigger invented palette.
 */
export type GraphNodeKind = Layer0EntityKind | 'idea' | 'chapter' | 'book'

/** `User` reads unambiguously as "a person" regardless of the character's
 * actual in-story appearance — same reasoning `IdeaMindMapView.tsx` already
 * gives for reusing existing semantic colours instead of inventing new
 * meaning: pick the icon whose common reading matches the kind, don't
 * over-design bespoke glyphs per kind. `Book` (closed) for the hub node is
 * deliberately a different glyph from `BookOpen` (chapters) — they sit right
 * next to each other in the graph, so the one place this codebase's usual
 * "reuse the same icon" instinct would actually hurt legibility. */
export const GRAPH_NODE_ICONS: Record<GraphNodeKind, LucideIcon> = {
  character: User,
  location: MapPin,
  timelineEvent: Clock,
  glossaryTerm: SpellCheck2,
  reference: BookMarked,
  illustrationBrief: Image,
  styleRule: Ruler,
  researchNote: FlaskConical,
  idea: Lightbulb,
  chapter: BookOpen,
  book: Book,
}

export function getGraphNodeIcon(kind: GraphNodeKind): LucideIcon {
  return GRAPH_NODE_ICONS[kind]
}

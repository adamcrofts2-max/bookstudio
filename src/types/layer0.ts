/**
 * Layer 0 — Planning. The AI Publishing Workspace's structured "story
 * bible": a small set of typed entities (not a folder-of-files/markdown
 * tree — see `docs/AI_WORKSPACE_VISION.md`'s "Reject the folder-of-files
 * model" section for why) that a user building a book from an idea, rather
 * than an already-finished manuscript, fills in as they plan.
 *
 * This is upstream of, and structurally separate from, Layer 2 (Content):
 * nothing here is manuscript text, nothing here is read by PDF/EPUB/HTML
 * export, and no Layer 2 code may import this file — the exact same
 * one-way boundary `notesStore.ts`'s doc comment already establishes for
 * Notes ("never mutates Content or Structural Page data"). Its eventual
 * *consumers* are: the scoped AI prompt generator (assembles a minimum-
 * relevant context bundle from these entities), a future Continuity
 * checker (extends the Virtual Editor's existing checker architecture), and
 * potentially the Layout Engine directly (e.g. a "Species Profile"
 * structural page rendered straight from a `Character`/field-guide
 * template) — none of which exist yet; this file is the foundation those
 * build on, per `docs/ROADMAP.md` Phase F.
 *
 * Deliberately a lean, single v1 shape rather than a per-genre variant —
 * `docs/AI_WORKSPACE_VISION.md`'s own "Open questions for a future
 * session" explicitly leaves "exact entity schema per genre template" open
 * pending its own design pass. A genre template narrowing/relabelling this
 * same shape (a children's book's Character gaining Reading Level, a field
 * guide's Character becoming "Species") is future work, not this one.
 */

import type { BookForm } from '@/types/project'

/** Every entity kind, in the exact order `docs/AI_WORKSPACE_VISION.md`
 * lists them — also the canonical order category pickers/prompt-bundle
 * assembly should present them in. */
export type Layer0EntityKind =
  | 'character'
  | 'location'
  | 'timelineEvent'
  | 'glossaryTerm'
  | 'reference'
  | 'illustrationBrief'
  | 'styleRule'
  | 'researchNote'

/** Fields every entity kind shares. `id` follows this codebase's
 * `generateId(prefix)` convention; `createdAt`/`updatedAt` match
 * `notesStore.ts`'s `Note` shape exactly, for the same reason (a simple,
 * sortable-by-recency audit trail with no extra machinery). */
export interface BaseLayer0Entity {
  id: string
  createdAt: string
  updatedAt: string
}

/** A person (or person-equivalent — a sentient animal, an AI, etc.) in the
 * story. `role` is deliberately free text, not a closed enum
 * ("protagonist"/"antagonist"/...) — real casts don't sort cleanly into a
 * fixed list, and a free label is still enough for prompt-bundle grouping
 * and display. */
export interface Character extends BaseLayer0Entity {
  name: string
  role?: string
  description?: string
  notes?: string
}

/** A place the story visits — a room, a building, a city, a whole world. */
export interface Location extends BaseLayer0Entity {
  name: string
  description?: string
  notes?: string
}

/** One point on the story's internal timeline. `when` is intentionally
 * free text ("Day 3", "Spring, Year 1", "10 years before Ch. 1") rather
 * than a calendar date — most fiction timelines aren't real calendar dates
 * at all, and imposing one would make this unusable for exactly the
 * fantasy/sci-fi/historical-fiction cases where a timeline matters most.
 * Because `when` isn't sortable, `order` is an explicit manual position the
 * user controls directly (drag-reorder in the UI), the actual source of
 * truth for sequence. */
export interface TimelineEvent extends BaseLayer0Entity {
  title: string
  when?: string
  description?: string
  order: number
  /** Which chapter this beat lands in, if the author has assigned one yet
   * (Phase 83) — mirrors `Idea.linkedChapterId`/`Note.chapterId`'s exact
   * "reference by id, don't duplicate the title" pattern. What makes an
   * Outline Template beat ("Hook", "Midpoint"…) into an actual skeleton of
   * the manuscript rather than a list that lives only in Develop, floating
   * next to the real chapters instead of pointing at any of them. Optional
   * and never required — a beat with no chapter assigned just shows
   * "Not linked to a chapter yet". */
  linkedChapterId?: string
}

/** An in-world term, invented word, or piece of jargon worth defining once
 * and reusing consistently — feeds both the AI prompt bundle (so a
 * generated chapter uses the right terminology) and a future "Glossary"
 * back-matter structural page (`GlossaryPage` in `types/structuralPage.ts`
 * already exists as a destination, currently filled in by hand). */
export interface GlossaryTerm extends BaseLayer0Entity {
  term: string
  definition: string
}

/** A source the author is drawing on — research material, inspiration, or
 * a citation a non-fiction project needs to track back to. `url` and
 * `citation` are both optional and independent (a citation doesn't always
 * have a stable URL; a URL alone isn't a formatted citation). */
export interface ReferenceEntry extends BaseLayer0Entity {
  title: string
  url?: string
  citation?: string
  notes?: string
}

/** A brief for artwork that needs to be commissioned or generated —
 * distinct from an actual `ImageAsset` (Layer 2's asset store): this is
 * the *ask*, written before the image exists. `referenceAssetId` lets the
 * brief point at an already-uploaded image as a visual reference/mood
 * board entry without duplicating the asset store's own storage. */
export interface IllustrationBrief extends BaseLayer0Entity {
  title: string
  description?: string
  referenceAssetId?: string
}

/** One standing rule the manuscript should follow consistently — spelling
 * variant, a character's speech quirk, a formatting convention — the kind
 * of thing `virtualEditor/types.ts`'s `StyleGuide` already captures at a
 * book-wide level for a fixed handful of fields; this is the open-ended,
 * free-text equivalent for anything that doesn't fit that fixed shape. Not
 * merged with `StyleGuide` in this pass — that's a reasonable future
 * consolidation, not assumed here. */
export interface StyleRule extends BaseLayer0Entity {
  rule: string
}

/** A freeform research note — background reading, worldbuilding, or plot
 * scratch notes that don't belong in the manuscript itself but need to be
 * kept somewhere durable and searchable rather than in a separate app. */
export interface ResearchNote extends BaseLayer0Entity {
  title: string
  body?: string
  sourceUrl?: string
}

/** One project's whole Layer 0 story bible — every entity collection,
 * keyed by kind. `layer0Store.ts` owns one of these per project; this is
 * also the exact shape a future project-file export/import round-trips
 * (see that store's own doc comment for what's deliberately deferred). */
export interface Layer0Bible {
  characters: Character[]
  locations: Location[]
  timelineEvents: TimelineEvent[]
  glossaryTerms: GlossaryTerm[]
  references: ReferenceEntry[]
  illustrationBriefs: IllustrationBrief[]
  styleRules: StyleRule[]
  researchNotes: ResearchNote[]
}

/** Maps each `Layer0EntityKind` to its collection key on `Layer0Bible` —
 * the one place that mapping is spelled out, so the store/UI/prompt-bundle
 * code can all go kind → collection generically instead of each writing
 * its own switch statement. */
export const LAYER0_KIND_TO_COLLECTION: Record<Layer0EntityKind, keyof Layer0Bible> = {
  character: 'characters',
  location: 'locations',
  timelineEvent: 'timelineEvents',
  glossaryTerm: 'glossaryTerms',
  reference: 'references',
  illustrationBrief: 'illustrationBriefs',
  styleRule: 'styleRules',
  researchNote: 'researchNotes',
}

/** Display metadata for each entity kind — singular/plural labels and a
 * short description, the one place a category picker or empty-state needs
 * to read from rather than hand-writing labels at each call site. Order
 * matches `Layer0EntityKind`'s own declared order. */
export const LAYER0_KIND_LABELS: Record<Layer0EntityKind, { singular: string; plural: string; description: string }> = {
  character: { singular: 'Character', plural: 'Characters', description: 'People (or person-equivalents) in the story' },
  location: { singular: 'Location', plural: 'Locations', description: 'Places the story visits' },
  timelineEvent: { singular: 'Timeline Event', plural: 'Timeline', description: "Points on the story's internal timeline" },
  glossaryTerm: { singular: 'Glossary Term', plural: 'Glossary', description: 'Invented words and in-world jargon' },
  reference: { singular: 'Reference', plural: 'References', description: 'Sources, research material, and citations' },
  illustrationBrief: { singular: 'Illustration Brief', plural: 'Illustration Briefs', description: 'Artwork that needs to be made' },
  styleRule: { singular: 'Style Rule', plural: 'Style Rules', description: 'Standing rules the manuscript should follow' },
  researchNote: { singular: 'Research Note', plural: 'Research Notes', description: "Background notes that aren't manuscript text" },
}

/** Overrides for the three kinds whose fiction-coded wording ("Character",
 * "Timeline") reads oddly on a non-fiction project (Phase 83) — a business
 * book has no "characters". Only the kinds that actually need different
 * words appear here; everything else (Glossary/References/Illustration
 * Briefs/Style Rules/Research Notes) already reads as genre-neutral and is
 * left out on purpose rather than repeated unchanged. Same underlying
 * `Layer0Bible` collections and data either way — this is display text
 * only, read through `getLayer0KindLabel` below, never `LAYER0_KIND_LABELS`
 * directly once a project's `BookForm` is known. */
const LAYER0_KIND_LABELS_NONFICTION: Partial<Record<Layer0EntityKind, { singular: string; plural: string; description: string }>> = {
  character: { singular: 'Person', plural: 'People', description: 'People discussed or featured' },
  location: { singular: 'Place', plural: 'Places', description: 'Places discussed or featured' },
  timelineEvent: { singular: 'Chronology Event', plural: 'Chronology', description: 'Points on a chronological record, if this book has one' },
}

/** The one read site every nav row / list header / empty-state should use
 * instead of indexing `LAYER0_KIND_LABELS` directly, so the fiction/
 * non-fiction override above only has to be applied once. Falls back to
 * the original fiction-leaning labels whenever `bookForm` is `'fiction'` or
 * unset ("Not sure yet") — unchanged pre-Phase-83 behaviour for anyone who
 * hasn't made the choice. */
export function getLayer0KindLabel(kind: Layer0EntityKind, bookForm?: BookForm): { singular: string; plural: string; description: string } {
  if (bookForm === 'nonfiction') return LAYER0_KIND_LABELS_NONFICTION[kind] ?? LAYER0_KIND_LABELS[kind]
  return LAYER0_KIND_LABELS[kind]
}

/** Every entity kind, in canonical display order — the one place that
 * order is spelled out as real data (not just the type declaration order,
 * which TypeScript doesn't expose at runtime). */
export const LAYER0_ENTITY_KINDS: Layer0EntityKind[] = [
  'character',
  'location',
  'timelineEvent',
  'glossaryTerm',
  'reference',
  'illustrationBrief',
  'styleRule',
  'researchNote',
]

import type { Layer0EntityKind } from '@/types/layer0'
import type { ProjectCategory, TrimSize } from '@/types/project'
import { addLayer0EntityWithHistory } from '@/store/editorActions'
import { generateId } from '@/utils'

/**
 * The project-creation wizard's genre/audience template — deliberately the
 * lightest version of `docs/AI_WORKSPACE_VISION.md`'s idea that satisfies
 * `docs/ROADMAP.md`'s actual ticket ("decides which Layer 0 entity subset a
 * new project starts with"), not the full per-genre relabeling system the
 * vision doc explicitly defers to its own future design pass ("a children's
 * book gets Reading Level and Rhyme Scheme; a field guide gets Species
 * instead of Character" — none of that is built here). No new fields, no
 * per-project visibility toggling of Layer 0 categories (every project
 * still has all eight kinds available in `PlanningShell`) — just two things
 * a `ProjectCategory` the user already picks can reasonably imply:
 *
 * 1. A sensible starting trim size (a children's picture book and a novel
 *    have very different real-world defaults).
 * 2. One clearly-marked example entity per genre-relevant Layer 0 kind, so
 *    a user starting from an idea (not a manuscript) sees what "planning"
 *    looks like immediately instead of facing eight empty categories —
 *    "the interface should be visual rather than settings-based" (`CLAUDE
 *    .md`). Every seeded entity's own text says it's an example; Layer 0 is
 *    never read by PDF/EPUB/HTML export (see `types/layer0.ts`), so an
 *    unedited example can never leak into a shipped book even if the user
 *    never touches it.
 */

export interface CategoryTemplate {
  trimSize: TrimSize
  /** Which kinds get one starter example entity — genre-relevant only, not
   * every kind for every category (a novel doesn't need an Illustration
   * Brief example; a coffee-table book doesn't need a Style Rule one). */
  seedKinds: Layer0EntityKind[]
}

export const CATEGORY_TEMPLATES: Record<ProjectCategory, CategoryTemplate> = {
  novel: { trimSize: '6x9', seedKinds: ['character', 'location', 'styleRule'] },
  nonfiction: { trimSize: '6x9', seedKinds: ['reference', 'researchNote', 'glossaryTerm'] },
  childrens: { trimSize: '8.5x11', seedKinds: ['character', 'illustrationBrief'] },
  educational: { trimSize: '8.5x11', seedKinds: ['glossaryTerm', 'reference'] },
  'coffee-table': { trimSize: '8.5x11', seedKinds: ['illustrationBrief', 'reference'] },
  nature: { trimSize: '7x10', seedKinds: ['location', 'glossaryTerm', 'reference'] },
  scientific: { trimSize: '7x10', seedKinds: ['reference', 'glossaryTerm', 'researchNote'] },
  // A deliberately minimal, safe default for a category the user hasn't
  // narrowed down yet — one example is enough to point at Planning mode
  // without presuming a genre that isn't there.
  other: { trimSize: '6x9', seedKinds: ['character'] },
}

/**
 * Marks the tail of every seeded example entity's free-text field. Exported
 * (not a local inside `seedExampleEntity`) so `EntityListPanel.tsx` can
 * detect "this field still holds its unedited starter text" and select it
 * on focus — found needed during a live first-time-author UX audit
 * (docs/STATUS.md, Phase 78, 2026-08-02): clicking into a pre-filled
 * example field and typing merged into the placeholder instead of
 * replacing it, because nothing here signals "this whole value is meant to
 * be replaced" the way an empty field does.
 */
export const EXAMPLE_SUFFIX = 'This is a starter example — edit or delete it.'

/** Adds one clearly-marked example entity of `kind` to `projectId`'s
 * bible, through the same history-wrapped action every other Layer 0 write
 * goes through (undo/redo works on these exactly like a user's own edit —
 * a fitting side benefit, not a special case). A plain `switch`, not a
 * generic-over-`kind` function: each branch needs its own concrete field
 * set (a `Character` needs `name`, a `GlossaryTerm` needs `term`, etc.), so
 * genericizing this one would just reintroduce the cast dance
 * `layer0Store.ts`'s `asEntities()` already documents as the accepted
 * escape hatch elsewhere — not worth it for eight short, one-off literals. */
function seedExampleEntity(projectId: string, kind: Layer0EntityKind): void {
  const now = new Date().toISOString()
  const base = { id: generateId(kind), createdAt: now, updatedAt: now }

  switch (kind) {
    case 'character':
      addLayer0EntityWithHistory(
        projectId,
        'characters',
        { ...base, name: 'Example Character', role: 'Protagonist', description: `Describe your protagonist here. ${EXAMPLE_SUFFIX}` },
        'Add character',
      )
      return
    case 'location':
      addLayer0EntityWithHistory(
        projectId,
        'locations',
        { ...base, name: 'Example Location', description: `A place your story visits. ${EXAMPLE_SUFFIX}` },
        'Add location',
      )
      return
    case 'timelineEvent':
      addLayer0EntityWithHistory(
        projectId,
        'timelineEvents',
        { ...base, title: 'Example Event', description: `A point on your story's timeline. ${EXAMPLE_SUFFIX}`, order: 0 },
        'Add timeline event',
      )
      return
    case 'glossaryTerm':
      addLayer0EntityWithHistory(
        projectId,
        'glossaryTerms',
        { ...base, term: 'Example Term', definition: `Define an invented word or piece of jargon here. ${EXAMPLE_SUFFIX}` },
        'Add glossary term',
      )
      return
    case 'reference':
      addLayer0EntityWithHistory(
        projectId,
        'references',
        { ...base, title: 'Example Reference', notes: `A source you're drawing on. ${EXAMPLE_SUFFIX}` },
        'Add reference',
      )
      return
    case 'illustrationBrief':
      addLayer0EntityWithHistory(
        projectId,
        'illustrationBriefs',
        { ...base, title: 'Example Illustration Brief', description: `A brief for artwork that needs to be made. ${EXAMPLE_SUFFIX}` },
        'Add illustration brief',
      )
      return
    case 'styleRule':
      addLayer0EntityWithHistory(
        projectId,
        'styleRules',
        { ...base, rule: `Example: always spell out numbers under one hundred. ${EXAMPLE_SUFFIX}` },
        'Add style rule',
      )
      return
    case 'researchNote':
      addLayer0EntityWithHistory(
        projectId,
        'researchNotes',
        { ...base, title: 'Example Research Note', body: `Background notes that aren't manuscript text. ${EXAMPLE_SUFFIX}` },
        'Add research note',
      )
      return
  }
}

/** Applies a category's template to a freshly-created project: seeds every
 * one of its `seedKinds` with one example entity. Trim size is applied by
 * the caller (`NewProjectDialog.tsx`, via `updateProjectSettings`) since
 * that's a `projectStore` write, not a Layer 0 one — kept as two small,
 * single-purpose calls rather than one function reaching across both
 * stores. */
export function seedProjectTemplate(projectId: string, category: ProjectCategory): void {
  const template = CATEGORY_TEMPLATES[category]
  for (const kind of template.seedKinds) seedExampleEntity(projectId, kind)
}

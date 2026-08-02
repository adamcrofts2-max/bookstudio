import { addLayer0EntityWithHistory } from '@/store/editorActions'
import { generateId } from '@/utils'
import type { BookForm } from '@/types/project'

/**
 * "Outlining / story-structure templates" (`docs/ROADMAP.md` Phase F) — a
 * handful of well-known structural frameworks a user can apply to seed
 * their project's Timeline (Layer 0's `TimelineEvent` collection, which
 * already has the ordered-beat shape this needs, and gained manual
 * reordering in Phase 69) with the beats of that structure, in order, ready
 * to fill in. Same non-destructive, clearly-marked-as-a-starting-point
 * spirit as `projectTemplates.ts`'s category seeding (Phase 70) — this
 * only ever appends new events after whatever's already on the timeline,
 * never replaces or reorders existing ones.
 *
 * Beat *names* below are standard, widely-taught terminology in fiction/
 * screenwriting/nonfiction craft education (three-act structure and the
 * Hero's Journey/monomyth are generic narrative-theory vocabulary; "Save the
 * Cat" is referenced by name the same way other writing software already
 * does, as a recognizable structure a user can look up further, not as
 * reproduced book text) — every beat's one-line description below is
 * original, not quoted or paraphrased from any specific source.
 */

export interface OutlineBeat {
  title: string
  description: string
}

export interface OutlineTemplate {
  id: string
  label: string
  description: string
  beats: OutlineBeat[]
  /** Which `BookForm` this template actually fits (Phase 83) — `'either'`
   * for the couple of shapes generic enough to suit both (currently just
   * the Picture Book Arc, since children's books span fiction and
   * non-fiction). `getOutlineTemplatesForForm` below is the one place this
   * gets filtered; nothing here changes what a template *does* once
   * applied — still the same `applyOutlineTemplate` seeding Timeline/
   * Chronology either way. */
  form: BookForm | 'either'
}

export const OUTLINE_TEMPLATES: OutlineTemplate[] = [
  {
    id: 'three-act',
    form: 'fiction',
    label: 'Three-Act Structure',
    description: 'The classic setup/confrontation/resolution shape — a solid default for most novels.',
    beats: [
      { title: 'Opening Image', description: 'Establish the world and the protagonist before anything changes.' },
      { title: 'Inciting Incident', description: 'The event that starts the story and disrupts the status quo.' },
      { title: 'Plot Point One', description: 'The protagonist commits to the central conflict — Act One ends here.' },
      { title: 'Rising Action', description: 'Escalating obstacles and complications test the protagonist.' },
      { title: 'Midpoint', description: "A major turn — new information, a reversal, or a raised stakes moment." },
      { title: 'Plot Point Two', description: 'The low point or biggest setback — Act Two ends here.' },
      { title: 'Climax', description: 'The final confrontation where the central conflict is decided.' },
      { title: 'Resolution', description: 'The new status quo — loose ends settle into what comes after.' },
    ],
  },
  {
    id: 'heros-journey',
    form: 'fiction',
    label: "The Hero's Journey",
    description: "Joseph Campbell's monomyth — a departure/initiation/return arc, common in adventure and fantasy.",
    beats: [
      { title: 'Ordinary World', description: "The hero's life before the story's central journey begins." },
      { title: 'Call to Adventure', description: 'A problem or invitation disrupts the ordinary world.' },
      { title: 'Refusal of the Call', description: 'Hesitation, fear, or duty makes the hero resist at first.' },
      { title: 'Meeting the Mentor', description: 'A guide offers wisdom, training, or a tool for the road ahead.' },
      { title: 'Crossing the Threshold', description: 'The hero commits and leaves the ordinary world behind.' },
      { title: 'Tests, Allies, Enemies', description: 'The hero learns the rules of the new world through trials.' },
      { title: 'Approach', description: 'Preparation intensifies as the hero nears the central ordeal.' },
      { title: 'Ordeal', description: "The hero's greatest crisis — a life-or-death confrontation, literal or figurative." },
      { title: 'Reward', description: 'Having survived the ordeal, the hero gains something of real value.' },
      { title: 'The Road Back', description: 'The hero commits to finishing the journey and returning home.' },
      { title: 'Resurrection', description: 'A final, harder test — the last and most dangerous moment of change.' },
      { title: 'Return with the Elixir', description: 'The hero returns transformed, bringing something back for others.' },
    ],
  },
  {
    id: 'save-the-cat',
    form: 'fiction',
    label: 'Save the Cat Beat Sheet',
    description: "Blake Snyder's 15-beat screenwriting structure — popular for tightly-plotted, commercial fiction.",
    beats: [
      { title: 'Opening Image', description: 'A snapshot of the story\'s tone and the protagonist\'s starting state.' },
      { title: 'Theme Stated', description: "A line or moment hints at the story's real, underlying question." },
      { title: 'Set-Up', description: "Introduce the protagonist's world, flaws, and what needs to change." },
      { title: 'Catalyst', description: 'The inciting event that sets the story in motion.' },
      { title: 'Debate', description: 'The protagonist hesitates — should they really go through with this?' },
      { title: 'Break into Two', description: 'The protagonist chooses to act, leaving the old world behind.' },
      { title: 'B Story', description: 'A secondary relationship or subplot begins, often carrying the theme.' },
      { title: 'Fun and Games', description: "The story's core premise plays out — often the trailer-friendly section." },
      { title: 'Midpoint', description: 'Stakes rise sharply — a false victory or false defeat.' },
      { title: 'Bad Guys Close In', description: 'Pressure mounts, internally and externally, on the protagonist.' },
      { title: 'All Is Lost', description: 'The lowest point — it seems the protagonist has failed for good.' },
      { title: 'Dark Night of the Soul', description: 'The protagonist processes the loss before finding a way forward.' },
      { title: 'Break into Three', description: 'A new insight — often tied to the B Story — sparks the final push.' },
      { title: 'Finale', description: 'The protagonist confronts the central conflict and resolves it.' },
      { title: 'Final Image', description: "A closing snapshot that mirrors the opening and shows what's changed." },
    ],
  },
  {
    id: 'problem-solution',
    form: 'nonfiction',
    label: 'Problem → Solution',
    description: 'A persuasive-argument shape for non-fiction, self-help, or educational chapters.',
    beats: [
      { title: 'Hook', description: 'An opening that earns the reader\'s attention and signals what\'s at stake.' },
      { title: 'Problem Statement', description: 'Name the problem clearly and concretely.' },
      { title: 'Why It Matters', description: 'Establish the cost of leaving the problem unsolved.' },
      { title: 'Background / Context', description: 'Give the reader enough grounding to follow the argument.' },
      { title: 'Core Argument / Solution', description: 'Present the central idea, method, or answer.' },
      { title: 'Supporting Evidence', description: 'Data, examples, or case studies that back the core argument.' },
      { title: 'Addressing Counterarguments', description: 'Acknowledge and respond to the strongest objections.' },
      { title: 'Practical Application', description: 'Show the reader how to actually use this in their own life or work.' },
      { title: 'Conclusion / Call to Action', description: 'Summarize the argument and tell the reader what to do next.' },
    ],
  },
  {
    id: 'step-by-step',
    form: 'nonfiction',
    label: 'Step-by-Step Guide',
    description: 'An instructional shape for how-to, technical, or reference chapters.',
    beats: [
      { title: 'Why This Matters', description: 'Ground the reader in what they will be able to do, and why it is worth doing.' },
      { title: 'Before You Start', description: 'Prerequisites, materials, or context the reader needs first.' },
      { title: 'Step 1', description: 'The first concrete action.' },
      { title: 'Step 2', description: 'The next concrete action, building on Step 1.' },
      { title: 'Step 3', description: 'Continue as far as the process actually requires — rename or add steps freely.' },
      { title: 'Common Mistakes', description: "Where readers typically go wrong, and how to avoid or recover from it." },
      { title: 'Result / Recap', description: 'What the reader should have by the end, and a quick summary of how they got there.' },
    ],
  },
  {
    id: 'chronological-account',
    form: 'nonfiction',
    label: 'Chronological Account',
    description: 'An events-in-order shape for memoir, biography, or history chapters.',
    beats: [
      { title: 'Starting Point', description: 'Where the account begins, and the state of things beforehand.' },
      { title: 'First Turning Point', description: 'The first event that changes the trajectory of the account.' },
      { title: 'Developments', description: 'What follows from that turn — consequences, decisions, complications.' },
      { title: 'Second Turning Point', description: "A further shift — often the account's central event." },
      { title: 'Outcome', description: 'Where things stood once the central events had played out.' },
      { title: 'Reflection', description: 'What it means in hindsight, or why it matters now.' },
    ],
  },
  {
    id: 'picture-book-arc',
    form: 'either',
    label: 'Picture Book Arc',
    description: 'A short six-beat shape suited to children\'s picture books.',
    beats: [
      { title: 'Setup', description: "Introduce the character and their world in just a page or two." },
      { title: 'Problem', description: 'Something goes wrong, or the character wants something.' },
      { title: 'Escalation', description: 'Repeated attempts and small failures build rhythm and stakes.' },
      { title: 'Climax', description: "The character's biggest attempt — the turning point of the story." },
      { title: 'Resolution', description: 'The problem resolves, often through what the character has learned.' },
      { title: 'Ending Beat', description: 'A warm, satisfying final page — often a small callback or twist.' },
    ],
  },
]

/** Narrows the full template list to whichever `BookForm` a project has —
 * `'either'`-tagged templates always included, and the full unfiltered list
 * comes back when `bookForm` is unset ("Not sure yet"), same fallback
 * `getLayer0KindLabel` uses. */
export function getOutlineTemplatesForForm(bookForm?: BookForm): OutlineTemplate[] {
  if (!bookForm) return OUTLINE_TEMPLATES
  return OUTLINE_TEMPLATES.filter((t) => t.form === bookForm || t.form === 'either')
}

/**
 * Appends every beat of `template` to `projectId`'s Timeline as a new
 * `TimelineEvent`, in order, after whatever events already exist —
 * `startOrder` should be the current timeline length so beats always land
 * after existing events rather than colliding with their `order` values.
 * Every event goes through `addLayer0EntityWithHistory`, so applying a
 * template (and undoing it, beat by beat or as a whole via repeated undo)
 * works exactly like any other Layer 0 edit.
 */
export function applyOutlineTemplate(projectId: string, template: OutlineTemplate, startOrder: number): void {
  const now = new Date().toISOString()
  template.beats.forEach((beat, i) => {
    addLayer0EntityWithHistory(
      projectId,
      'timelineEvents',
      {
        id: generateId('timelineEvent'),
        createdAt: now,
        updatedAt: now,
        title: beat.title,
        description: beat.description,
        order: startOrder + i,
        sourceTemplateId: template.id,
      },
      'Add timeline event',
    )
  })
}

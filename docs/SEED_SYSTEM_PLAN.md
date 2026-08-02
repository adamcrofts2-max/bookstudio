# The Seed System — Milestone 1

Status: **Spec only, not started.** Follows `docs/PLANNING_EXPERIENCE_REDESIGN.md`'s
first-principles review and the follow-up design conversation logged in
`docs/STATUS.md`. This is the minimal, buildable first slice of that direction —
deliberately small enough to get in front of a real first-time author before any of
the bigger, more speculative pieces (Board/Canvas views, drag-to-associate) get built.

## Why this scope, specifically

The design review concluded the current Planning shell asks an author to decide their
book's structure (Characters, Locations, References, ...) before they've written
anything worth structuring. The fix agreed on is capture-first: one zero-friction way
to jot a thought down, with real structure emerging from what's captured rather than
demanded up front. The follow-up conversation also concluded the full vision — a
universal card ("Seed"), four views over it (List/Board/Canvas/Outline), and
drag-to-associate semantics — is the right direction but too much to build and trust
untested in one pass. The agreed sequencing: ship the core capture mechanic and one
simple view first, validate it with real people who've never written a book, and let
that reaction decide whether Board/Canvas/Outline are worth building at all.

This document specs exactly that first slice, nothing more.

## What ships in Milestone 1

1. A new `Seed` entity and store — one always-available way to capture a thought with
   zero required fields beyond the thought itself.
2. A capture rail that lives beside the writing surface (Virtual Editor), not a
   separate destination — no mode switch to jot something down while writing.
3. A List view of every Seed, reached by expanding that same rail.
4. A Seed detail view: edit the text, set a status, add tags, and manually promote a
   Seed into a real, existing Layer 0 entity (Character, Location, etc.) when the
   author decides it's ready — no automatic detection yet, see Deferred below.
5. A change to the New Project dialog so "what's the idea" comes before "what
   category is this," rather than gating project creation on a genre decision.

Everything else discussed in the design conversation — Board/Canvas/Outline views,
recurrence-based promotion suggestions, drag-to-associate, reorganising the Planning
nav into a "creative tools, then a publishing room" sequence — is explicitly out of
scope for this milestone (see Deferred, below). Nothing about the existing Layer 0
entity types, `layer0Store.ts`, `EntityListPanel.tsx`, the checkers, or the export
pipeline changes. This is additive: an author can still go straight to Planning mode
and fill in a Character form directly, exactly as today, if that's genuinely what they
want. Milestone 1 gives everyone a second, easier way in — it doesn't remove the
first one.

## Data model

```ts
export type SeedStatus = 'new' | 'in-progress' | 'used' | 'archived'

/**
 * One captured thought — the only object Milestone 1 introduces. Deliberately has
 * exactly one required field. Everything else is something an author can add later,
 * never something capture is gated on. `text` is genuinely freeform: a stray idea, a
 * name, a link, a half sentence — same object regardless of what it turns out to be.
 */
export interface Seed {
  id: string
  text: string
  createdAt: string
  updatedAt: string
  status: SeedStatus
  tags?: string[]
  /** Where in the manuscript this was captured, if anywhere — set automatically by
   * the capture rail when it's open beside a chapter, absent for a Seed captured
   * with no chapter in view (e.g. from the project's own top-level Seed inbox). Not
   * required, and not used for anything beyond "jump back to where I was" in
   * Milestone 1 — no positional/paragraph-level anchoring, which
   * `notesStore.ts`'s existing on-block Note attachment already solves for a
   * different, more precise use case if that's ever needed here too. */
  linkedChapterId?: string
  /** Set once, the moment a Seed is promoted — never cleared, never overwritten.
   * A promoted Seed stays visible in the List view (filtered out by default, same
   * "Archived" bucket treatment the user's own sketch proposed) as a record of
   * where that structured entity came from, not deleted or hidden outright. */
  promotedTo?: { kind: Layer0EntityKind; entityId: string }
}
```

`Layer0EntityKind` is the existing type from `types/layer0.ts` — a promoted Seed
becomes a real `Character`/`Location`/etc., through the exact same
`addLayer0EntityWithHistory` path `EntityListPanel.tsx` already uses. A Seed is a
front door to that data, not a replacement for it — the typed fields the continuity
checker, prompt generator, and every export path already depend on are untouched.

## Store

`useSeedStore` — the same `byProject: Record<projectId, Seed[]>` shape every other
per-project store in this codebase already uses (`notesStore.ts`, `layer0Store.ts`).
Four methods, mirroring `layer0Store.ts`'s own generic CRUD shape exactly:
`addSeed`, `updateSeed`, `deleteSeed`, `getSeeds`. No new persistence mechanism, no
new patterns — this is a ninth store that looks exactly like the other eight.

## History-wrapped actions (`editorActions.ts`)

- `addSeedWithHistory(projectId, seed, label)` — same shape as
  `addLayer0EntityWithHistory`.
- `updateSeedWithHistory(projectId, id, updates, label)` — covers text edits, status
  changes, and tag changes; one function, like `updateLayer0EntityWithHistory`.
- `deleteSeedWithHistory(projectId, id, label)`.
- `promoteSeedWithHistory(projectId, seedId, kind, entityFields, label)` — the one
  new compound action. Internally: build the new entity (same per-kind field
  construction `EntityListPanel.tsx`'s `save()` already does), call
  `addLayer0EntityWithHistory` to create it, then `updateSeedWithHistory` to set
  `promotedTo`. Both writes happen inside one history entry (one undo step undoes
  the whole promotion, not two separate steps a user has to undo individually) —
  matching how `deleteChapterWithHistory` already bundles a multi-part change into a
  single history record.

## UI surface

**The capture rail.** A slim, always-present affordance docked to the edge of the
Virtual Editor's writing surface — present whenever a manuscript page is open, not a
toolbar button that opens a different screen. Collapsed by default: a single input
plus an icon, "capture a thought" as the only visible verb. Typing and hitting enter
calls `addSeedWithHistory` with `linkedChapterId` set to whatever chapter is currently
open, and the rail returns to its collapsed, ready-for-the-next-thought state — no
confirmation dialog, no required fields, no interruption to writing.

**List view.** Clicking the rail's icon (rather than its input) expands it into a
running list of every Seed for the project, newest first, each showing its text,
status, and a coloured status indicator. This is the one view Milestone 1 ships —
Board/Canvas/Outline are explicitly deferred. A simple status filter (New /
In Progress / Used / Archived, matching the `SeedStatus` union) keeps this usable once
a project has accumulated dozens of Seeds, without needing a search feature of its
own — reusing `manuscriptSearch.ts`'s query-a-string approach later, once Seeds are
numerous enough to need it, is a reasonable Milestone 2 addition, not required here.

**Seed detail.** Clicking a Seed in the list opens its detail: the text (editable
inline), a status selector, a tags input, and — if `linkedChapterId` is set — a "jump
to where this was captured" link, reusing `requestScrollToChapter` exactly as
`SearchPanel.tsx`'s chapter-title matches already do. At the bottom, a "Turn into..."
control listing the eight existing Layer 0 kinds (Character, Location, Glossary Term,
...). Choosing one opens the exact same add form `EntityListPanel.tsx` already
renders, pre-filled with the Seed's text in whichever field makes sense for that kind
(a Character's `description`, a Research Note's `body`, etc.) — reusing
`LAYER0_FORM_CONFIG` rather than building a second form system. Saving calls
`promoteSeedWithHistory`.

This manual "Turn into..." action, not an automatic suggestion, is deliberately all
Milestone 1 ships — see Deferred below for why.

## The New Project dialog change

Today's dialog asks for a title and a `ProjectCategory` before creating anything.
Milestone 1 reorders this: the first and only required field becomes "what's the
idea" (free text, becomes both the project's working title and, optionally, the seed
of the first page's opening line — see the design conversation's note that an empty
page after this moment is its own kind of blank-page terror). The project is created
immediately on submit. Category becomes a second, clearly optional field on the same
screen, defaulting to `other` if skipped — `CATEGORY_TEMPLATES`'s trim-size and
starter-entity seeding still runs exactly as it does today if a category is chosen,
completely unchanged; skipping it just means those defaults get set later, from
Project Settings, whenever the author actually wants them. No change to
`projectTemplates.ts` itself — this is a `NewProjectDialog.tsx` UI/ordering change
only.

## Integration and compatibility

Every existing Layer 0 UI keeps working exactly as it does today — Planning mode,
`EntityListPanel.tsx`, `PromptGeneratorPanel.tsx`, `PasteBackPanel.tsx`, the
continuity checker, prompt generation, project-file export. A Seed's only interaction
with any of that is `promoteSeedWithHistory` writing through the exact same
`addLayer0EntityWithHistory` path a manually-filled Character form already uses — from
the rest of the app's point of view, a promoted Seed is indistinguishable from an
entity someone typed into the existing form directly. Nothing downstream needs to
know Seeds exist at all.

## Deferred to Milestone 2+ (explicitly not in this build)

- **Automatic promotion suggestions** — noticing a recurring name/term across Seeds
  or manuscript text and proactively offering "want to track this?", the way
  `detectMentionedEntityIds`/`pasteBackSuggestions.ts` already do recurrence
  detection elsewhere in this codebase. Same underlying technique, straightforward
  to add once Milestone 1's manual promotion path is validated — deferred so
  Milestone 1 tests the plainest possible version of "does capture-then-promote feel
  right" before adding automation on top of it.
- **Board and Canvas views** — sticky-note and freeform-spatial views over the same
  Seed data. The design conversation already flagged that Canvas in particular
  doesn't obviously serve every kind of book equally (strong fit for fiction and
  relational non-fiction, weaker fit for a linear how-to) — worth building once
  there's real reaction to whether List view alone is already enough for most
  people.
- **Outline view / chapters as promoted Seeds** — treating a chapter itself as a
  graduated Seed, with a corkboard-style reorder view. Real content-editing
  implications (a chapter is an entire manuscript section, not a sticky note) that
  need their own design pass, not a Milestone 1 concern.
- **Drag-to-associate** — dragging a Seed onto a Character/chapter/etc. to link or
  promote it. The design conversation's own conclusion was that this needs an
  equally obvious click-based fallback to work for someone who's never used a
  drag-and-drop tool before designing that fallback alongside the gesture, not after,
  is part of why this waits for Milestone 2 rather than shipping half of the
  interaction now.
- **Reorganising the Planning/top nav into a "creative tools, then a publishing
  room" sequence.** A real, worthwhile change discussed in the conversation, but
  independent of the Seed data model itself — it can happen before, after, or
  alongside Milestone 2 without blocking on it.

## How we'll know Milestone 1 worked

The whole reason this is scoped this small is to get real reaction before building
further. Once built and `tsc`/lint-clean: put it in front of two or three people who
have not written a book before and have not seen this conversation, with no
instructions beyond "here's an idea, try to get a few pages down." Watch for,
specifically: do they find the capture rail without being told it's there; do they
use it unprompted while writing, or forget it exists; when they open the List view,
does "turn this into a Character" make sense without explanation; does skipping
category on the New Project dialog read as an *option* or as something broken. Those
four observations should be enough to decide whether Milestone 2's automation and
extra views are worth building, and in what order.

## Migration safety

Purely additive. `Seed` is a new type, `useSeedStore` is a new, empty-by-default
store — an existing project simply has no Seeds until someone captures one. No
change to `Layer0Bible`, `Manuscript`, or any existing store's persisted shape.

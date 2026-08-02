# The Idea System — Develop Milestone 1

Status: **Spec only, not started.** Follows `docs/PLANNING_EXPERIENCE_REDESIGN.md`'s
first-principles review and the follow-up design conversation logged in
`docs/STATUS.md`. Supersedes this document's earlier draft (originally named "Seed",
originally split into four top-level workspaces) — both corrections are logged below
under Revisions, not silently dropped.

## Why this scope, specifically

The design review concluded the current Planning shell asks an author to decide their
book's structure (Characters, Locations, References, ...) before they've written
anything worth structuring. The fix agreed on is capture-first: one zero-friction way
to jot a thought down, with real structure emerging from what's captured rather than
demanded up front. A later round of the same conversation added a founder-level
correction on top of that: Book Studio and its deeper planning tools are two
different promises to two different kinds of author, and they shouldn't be flattened
into one continuous ambient system that pays every visitor the same complexity tax —
see Revisions below. This document specs the minimal, buildable first slice of the
corrected direction, small enough to get in front of a real first-time author before
anything bigger gets built.

## The shape: two areas, not one and not four

Today's app already has two modes (`editor`/`planning` in `App`'s own state) and
that's the right number to keep, not the four this document originally proposed.
Checked directly against `Toolbar.tsx`: Write, cover/layout design (via the Structure
tab's structural pages), and Export already live inside the single `editor` mode —
there is no separate "Design" screen or "Publish" screen today, and none needs
inventing. What changes is only the second half: `planning` is renamed **Develop**,
rebuilt around Ideas as its front door, and everything else about the existing
unified editor — writing, cover design, export — is untouched.

```
Book Studio            <- today's editor mode, unchanged (write, design, publish)
Develop (optional)     <- today's planning mode, renamed and rebuilt around Ideas
```

Someone who arrives with a finished manuscript never opens Develop at all: import,
lay out, export, exactly as today. Someone building a novel from a single idea might
spend most of their early sessions in Develop. Same software, same two doors, neither
one paying for the other's complexity.

## What ships in Milestone 1

1. A new `Idea` entity and store — one always-available way to capture a thought with
   zero required fields beyond the thought itself.
2. A small, persistent capture affordance reachable from Write — not a rail of
   visible cards, not a home-screen "wall," just a quiet way to drop a thought without
   leaving the page. The full Idea inbox lives in Develop, not beside the manuscript.
3. Develop's own landing view: an Ideas inbox (the List view), with Outline,
   Characters, Places, Timeline, Research, and Illustrations available as a quieter,
   secondary row — visible immediately, nothing hidden, but not what an author lands
   on first.
4. An Idea detail view: edit the text, set a status, add tags, link related Ideas to
   each other, and manually promote an Idea into a real, existing Layer 0 entity
   (Character, Location, etc.) when the author decides it's ready — no automatic
   detection yet, see Deferred below.
5. A change to the New Project dialog so "what's the idea" comes before "what
   category is this," rather than gating project creation on a genre decision.

Everything else discussed in the design conversation — Board/Canvas views,
recurrence-based promotion suggestions, drag-to-associate — is explicitly out of
scope (see Deferred, below). Nothing about the existing Layer 0 entity types,
`layer0Store.ts`, `EntityListPanel.tsx`, the checkers, or the export pipeline
changes. This is additive: an author can still open Develop and fill in a Character
form directly, exactly as today, if that's genuinely what they want. Milestone 1
gives everyone a second, easier way in — it doesn't remove the first one.

## Data model

```ts
export type IdeaStatus = 'new' | 'in-progress' | 'used' | 'archived'

/**
 * One captured thought — the only object Milestone 1 introduces. Deliberately has
 * exactly one required field. Everything else is something an author can add later,
 * never something capture is gated on. `text` is genuinely freeform: a stray idea, a
 * name, a link, a half sentence — same object regardless of what it turns out to be.
 */
export interface Idea {
  id: string
  text: string
  createdAt: string
  updatedAt: string
  status: IdeaStatus
  tags?: string[]
  /** Other Ideas this one connects to, picked by hand from Idea detail — not a
   * graph view, not automatic, just a "related to" list. Cheap to add and valuable
   * from the very first two Ideas someone captures ("Floating Gardens" pointing at
   * "Water Hyacinth" is worth more than either sitting alone) — unlike Board/Canvas,
   * this doesn't need its own view to be useful, so it isn't deferred. */
  relatedIdeaIds?: string[]
  /** Where in the manuscript this was captured, if anywhere — set automatically when
   * the capture affordance is used from an open chapter, absent for an Idea captured
   * from Develop directly. Not required, and not used for anything beyond "jump back
   * to where I was" in Milestone 1 — no positional/paragraph-level anchoring, which
   * `notesStore.ts`'s existing on-block Note attachment already solves for a
   * different, more precise use case if that's ever needed here too. */
  linkedChapterId?: string
  /** Set once, the moment an Idea is promoted — never cleared, never overwritten.
   * A promoted Idea stays visible in the inbox (filtered into the "Archived" bucket
   * by default) as a record of where that structured entity came from, not deleted
   * or hidden outright. */
  promotedTo?: { kind: Layer0EntityKind; entityId: string }
}
```

`Layer0EntityKind` is the existing type from `types/layer0.ts` — a promoted Idea
becomes a real `Character`/`Location`/etc., through the exact same
`addLayer0EntityWithHistory` path `EntityListPanel.tsx` already uses. An Idea is a
front door to that data, not a replacement for it — the typed fields the continuity
checker, prompt generator, and every export path already depend on are untouched.

## Store

`useIdeaStore` — the same `byProject: Record<projectId, Idea[]>` shape every other
per-project store in this codebase already uses (`notesStore.ts`, `layer0Store.ts`).
Four methods, mirroring `layer0Store.ts`'s own generic CRUD shape exactly:
`addIdea`, `updateIdea`, `deleteIdea`, `getIdeas`. No new persistence mechanism, no
new patterns — this is a ninth store that looks exactly like the other eight.

## History-wrapped actions (`editorActions.ts`)

- `addIdeaWithHistory(projectId, idea, label)` — same shape as
  `addLayer0EntityWithHistory`.
- `updateIdeaWithHistory(projectId, id, updates, label)` — covers text edits, status
  changes, tag changes, and related-Idea links; one function, like
  `updateLayer0EntityWithHistory`.
- `deleteIdeaWithHistory(projectId, id, label)`.
- `promoteIdeaWithHistory(projectId, ideaId, kind, entityFields, label)` — the one
  new compound action. Internally: build the new entity (same per-kind field
  construction `EntityListPanel.tsx`'s `save()` already does), call
  `addLayer0EntityWithHistory` to create it, then `updateIdeaWithHistory` to set
  `promotedTo`. Both writes happen inside one history entry (one undo step undoes
  the whole promotion, not two separate steps a user has to undo individually) —
  matching how `deleteChapterWithHistory` already bundles a multi-part change into a
  single history record.

## UI surface

**The capture affordance, in Write.** A small, persistent control docked to the edge
of the Virtual Editor's writing surface — present whenever a manuscript page is open,
never a rail of visible cards and never a "wall" of ideas sitting in view while
someone is trying to write. Collapsed by default to a single icon; clicking it opens
one input, "capture a thought" as the only visible verb. Typing and hitting enter
calls `addIdeaWithHistory` with `linkedChapterId` set to whatever chapter is
currently open, and the control returns to its collapsed state — no confirmation
dialog, no required fields, no interruption to writing. This is the entire footprint
Develop has inside Write — everything else about it lives on the other side of the
door.

**Develop's landing view — the Ideas inbox.** Switching to Develop lands on a running
list of every Idea for the project, newest first, each showing its text, status, and
a coloured status indicator. Above it, a quieter secondary row — Outline, Characters,
Places, Timeline, Research, Illustrations — each one clickable and fully populated by
today's existing `EntityListPanel.tsx` screens, present from day one, just not what
Develop opens on. Ideas is the front door; those six are rooms down the hall, not six
more doors competing for the first click. List is the one view Milestone 1 ships —
Board/Canvas are explicitly deferred, see below. A simple status filter (New /
In Progress / Used / Archived, matching the `IdeaStatus` union) keeps the inbox usable
once a project has accumulated dozens of Ideas, without needing a search feature of
its own yet.

**Idea detail.** Clicking an Idea in the inbox opens its detail: the text (editable
inline), a status selector, a tags input, a "related Ideas" picker (search existing
Ideas, add/remove links — both directions of `relatedIdeaIds` stay in sync), and — if
`linkedChapterId` is set — a "jump to where this was captured" link, reusing
`requestScrollToChapter` exactly as `SearchPanel.tsx`'s chapter-title matches already
do. At the bottom, a "Turn into..." control listing the eight existing Layer 0 kinds.
Choosing one opens the exact same add form `EntityListPanel.tsx` already renders,
pre-filled with the Idea's text in whichever field makes sense for that kind (a
Character's `description`, a Research Note's `body`, etc.) — reusing
`LAYER0_FORM_CONFIG` rather than building a second form system. Saving calls
`promoteIdeaWithHistory`.

This manual "Turn into..." action, not an automatic suggestion, is deliberately all
Milestone 1 ships — see Deferred below for why.

## The New Project dialog change

Today's dialog asks for a title and a `ProjectCategory` before creating anything.
Milestone 1 reorders this: the first and only required field becomes "what's the
idea" (free text, becomes both the project's working title and, optionally, the seed
of the first page's opening line — an empty page right after this moment is its own
kind of blank-page terror). The project is created immediately on submit. Category
becomes a second, clearly optional field on the same screen, defaulting to `other` if
skipped — `CATEGORY_TEMPLATES`'s trim-size and starter-entity seeding still runs
exactly as it does today if a category is chosen, completely unchanged; skipping it
just means those defaults get set later, from Project Settings, whenever the author
actually wants them. No change to `projectTemplates.ts` itself — this is a
`NewProjectDialog.tsx` UI/ordering change only.

## Integration and compatibility

Every existing Layer 0 UI keeps working exactly as it does today — `EntityListPanel
.tsx`, `PromptGeneratorPanel.tsx`, `PasteBackPanel.tsx`, the continuity checker,
prompt generation, project-file export. An Idea's only interaction with any of that
is `promoteIdeaWithHistory` writing through the exact same
`addLayer0EntityWithHistory` path a manually-filled Character form already uses —
from the rest of the app's point of view, a promoted Idea is indistinguishable from
an entity someone typed into the existing form directly. Nothing downstream needs to
know Ideas exist at all. Renaming the `planning` app-mode to `develop` (and its
toolbar label from "Planning" to "Develop") is a small, mechanical, purely cosmetic
part of this milestone — no route/store restructuring implied.

## Deferred to Milestone 2+ (explicitly not in this build)

- **Automatic promotion suggestions** — noticing a recurring name/term across Ideas
  or manuscript text and proactively offering "want to track this?", the way
  `detectMentionedEntityIds`/`pasteBackSuggestions.ts` already do recurrence
  detection elsewhere in this codebase. Same underlying technique, straightforward
  to add once Milestone 1's manual promotion path is validated — deferred so
  Milestone 1 tests the plainest possible version of "does capture-then-promote feel
  right" before adding automation on top of it.
- **Board and Canvas views** — sticky-note and freeform-spatial views over the same
  Idea data. The design conversation already flagged that Canvas in particular
  doesn't obviously serve every kind of book equally (strong fit for fiction and
  relational non-fiction, weaker fit for a linear how-to) — worth building once
  there's real reaction to whether List view alone is already enough for most people.
  Kept out of Develop's visible nav until built, on the same principle Design/
  Publish already follow: a nav item that goes nowhere yet is worse than one that
  doesn't exist yet.
- **Outline view / chapters as promoted Ideas** — treating a chapter itself as a
  graduated Idea, with a corkboard-style reorder view. Real content-editing
  implications (a chapter is an entire manuscript section, not a sticky note) that
  need their own design pass, not a Milestone 1 concern.
- **Drag-to-associate** — dragging an Idea onto a Character/chapter/etc. to link or
  promote it. The design conversation's own conclusion was that this needs an
  equally obvious click-based fallback to work for someone who's never used a
  drag-and-drop tool before — designing that fallback alongside the gesture, not
  after, is part of why this waits for Milestone 2 rather than shipping half of the
  interaction now.

## How we'll know Milestone 1 worked

The whole reason this is scoped this small is to get real reaction before building
further. Once built and `tsc`/lint-clean: put it in front of two or three people who
have not written a book before and have not seen this conversation, with no
instructions beyond "here's an idea, try to get a few pages down." Watch for,
specifically: do they find the capture affordance in Write without being told it's
there; do they use it unprompted while writing, or forget it exists; once in Develop,
does landing on Ideas (rather than a menu of eight equal choices) make sense; does
"turn this into a Character" make sense without explanation; does skipping category
on the New Project dialog read as an *option* or as something broken. Those five
observations should be enough to decide whether Milestone 2's automation and extra
views are worth building, and in what order.

## Migration safety

Purely additive. `Idea` is a new type, `useIdeaStore` is a new, empty-by-default
store — an existing project simply has no Ideas until someone captures one. No
change to `Layer0Bible`, `Manuscript`, or any existing store's persisted shape.

## Revisions

- **2026-08-02, this pass:** renamed `Seed` → `Idea` throughout (clearer, needs no
  explanation, the lightbulb does the work). Renamed the `planning` app mode →
  `Develop` and corrected the earlier draft's four-workspace nav (Write/Develop/
  Design/Publish) down to two areas — checked directly against `Toolbar.tsx` and
  confirmed Write, cover/layout design, and Export already share one screen today,
  so only Develop needed inventing. Narrowed the capture UI from "a rail beside the
  editor" to a small persistent affordance in Write plus a full inbox inside Develop,
  so Develop stays genuinely optional rather than visually present everywhere.
  Restructured Develop's own landing view around Ideas as the front door, with the
  other six kinds as a secondary row rather than eight-way peer choice. Added
  `relatedIdeaIds` to the data model.

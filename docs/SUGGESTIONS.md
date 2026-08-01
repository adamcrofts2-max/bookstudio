# Book Studio — Suggestions Log

A running list of ideas, gaps, and recommendations noticed while building — not a
roadmap (see `docs/ROADMAP.md` for committed, prioritised work) and not a bug tracker
(bugs get fixed and logged in `docs/STATUS.md` directly). This is lower-confidence,
lower-priority, or genuinely optional material: things worth the user's attention that
didn't rise to "do this now," organised newest-first, one entry per commit stage per
the 2026-08-01 instruction to append here after every commit.

---

## After Phase 74 (2026-08-01) — Continuity checker over Layer 0 data

- **Both checks are name-matching, so a renamed or nicknamed entity is a guaranteed
  false positive.** If a user's bible has "Alexandra" but the manuscript only ever
  calls her "Lex," the unmentioned-entity checker will flag her as never mentioned
  even though she's in every chapter. There's no fix for this within the "cheap,
  predictable, no dictionary/NLP" idiom this codebase deliberately stays inside —
  worth being upfront that this checker's real job is "give a shortlist worth a
  glance," not "reliably prove an entity is missing." The 0.4 confidence score is
  meant to signal exactly that, but it's worth watching whether users read the
  finding as more authoritative than that.
- **No check yet catches the reverse case: a name that recurs often in the
  manuscript but has no bible entry at all.** This was considered and deliberately
  cut from this phase — reliably distinguishing "a character who should be in the
  bible" from "a common capitalized word, a place name used once on purpose, a
  chapter title reused in prose" without real NLP has a much higher false-positive
  ceiling than the two checks that shipped, and this phase's whole point was
  staying honest about what deterministic matching can and can't do. Worth
  revisiting if a future phase adds even a lightweight allow-list or frequency
  threshold that could bring the false-positive rate down to something usable.
- **Timeline Events are excluded from both checks, which is correct today but
  worth revisiting once cross-linking exists.** `promptContext.ts`'s own
  `AUTO_DETECTABLE_KINDS` comment already flags this same gap: a timeline beat's
  title ("The bridge collapses") isn't text that recurs in prose the way a name
  does. Phase 71's SUGGESTIONS.md entry already flagged wanting a chapter↔beat
  link — if that ships, a genuinely different continuity check becomes possible
  ("this chapter is linked to a beat with no corresponding timeline event yet," or
  vice versa), distinct from name-matching entirely.
- **The Virtual Editor dashboard's category grouping was verified by reading
  `formatCategory`'s logic, not by seeing a `continuity` finding actually render in
  the running app** (no `npm run dev` in this sandbox). It's driven entirely by
  whatever categories are present in `report.findings` with no hardcoded category
  list to have missed updating, so it's expected to Just Work — but this is exactly
  the kind of "should work" claim worth a two-minute live check the next time
  someone has the app open, rather than trusting it indefinitely on reasoning
  alone.

---

## After Phase 73 (2026-08-01) — Distraction-free writing mode + reading mode

- **Reading mode has no page-turn/navigation affordance of its own.** It's a plain
  scrollable canvas — fine for a straight-through read, but there's no jump-to-chapter
  control once the Sidebar is hidden (a user has to scroll manually, or exit focus mode
  to navigate, then re-enter). A minimal floating chapter-jump menu (reusing the same
  TOC data `BookRenderer` already computes) would make this meaningfully more useful
  for spot-checking a specific chapter rather than only full read-throughs.
- **No keyboard shortcut to *enter* either mode, only to exit.** Both modes are
  reachable solely through the new Toolbar dropdown; a power user has no `W`/`R`-style
  key to jump straight in. Deliberately not added this phase to keep `docs
  /ROADMAP.md`'s existing `V` (spread toggle) precedent from getting crowded with new
  single-letter bindings without checking for collisions across every dialog/panel
  first — worth a small follow-up once there's a sense which shortcut letters are
  actually free.
- **One small, confirmed cosmetic leftover on structural pages in reading mode.**
  Traced through `Page.tsx`'s structural-page branch: `onSelect`/`onCommit` correctly
  become no-ops and `selected` is forced `false` when `decorative`, so nothing on any
  structural page is actually clickable or interactive in reading mode — but every one
  of the 18 structural page types (`structuralPages/types/*.tsx`) hardcodes a static
  `cursor-pointer` class on its root div regardless of `decorative`, so hovering any
  structural page in reading mode shows a clickable-looking cursor that does nothing.
  Purely cosmetic and pre-existing (not introduced this phase), but genuinely 18 files
  to touch for a one-line-each fix (`cursor-pointer` conditional on `!decorative`) —
  scoped out of this phase deliberately rather than bundled in, worth a dedicated small
  pass later.

---

## After Phase 72 (2026-08-01) — Word-count goals and writing-session tracking

- **The day-boundary logic is the one piece of this phase genuinely worth a live
  sanity check.** `recordWordCount`'s "first observation on a new calendar date resets
  the baseline" rule is straightforward on paper but untestable in this sandbox (no
  `npm run dev`) — worth deliberately leaving a project open across an actual local
  midnight once and confirming the log rolls over cleanly to a new date with 0, not a
  carried-over total.
- **No cross-project or lifetime view.** Word-count history lives entirely per-project
  in `writingSessionStore`'s `byProject` map — a user working across several book
  projects has no single "did I write today, across everything" view. Not clearly
  worth building (most users likely focus on one project at a time), but worth
  remembering if multi-project workflows turn out to be common.
- **Streaks aren't computed or celebrated anywhere.** The last-7-days list makes a gap
  visible, but there's no "5-day streak" number or any positive reinforcement for
  consistency — a cheap, well-understood motivational pattern (Duolingo, GitHub's
  contribution graph, etc.) this feature doesn't yet borrow. Worth adding once there's
  a sense users actually open this dialog regularly.

---

## After Phase 71 (2026-08-01) — Outlining / story-structure templates

- **Applying two templates back-to-back interleaves nothing, but does concatenate.**
  If a user applies "Three-Act Structure" and then, out of curiosity, also applies
  "The Hero's Journey," they get 20 timeline events in a row — the two structures
  don't merge or offer to replace, they just stack. That's the correct safe default
  (never destructive), but there's no guardrail warning "you already have a
  structure applied, are you sure you want to add a second one?" Low priority since
  it's easily undone or manually deleted, but worth a lightweight warning if this
  turns out to be a common accidental click.
- **No connection yet between a Timeline beat and an actual manuscript chapter.**
  Once a user outlines "Midpoint" and later writes the chapter that covers it,
  nothing links the two — `PromptGeneratorPanel.tsx`'s chapter picker and the
  Timeline are still totally independent. A "which beat does this chapter cover"
  link (even just an optional field) would let the prompt generator pull in the
  right beat's description automatically, and would make the eventual Continuity
  checker meaningfully stronger (it could check that a chapter's events don't
  contradict where the outline says the story should be). Worth considering once
  the Continuity checker (next roadmap item) is scoped.
- **Five templates is a reasonable starting set, not a ceiling.** Worth keeping an
  eye out for requests for genre-specific ones this doesn't cover well yet — a
  romance-specific beat sheet, a mystery/whodunit structure (clue-planting beats),
  or a memoir/essay shape distinct from the current generic Problem→Solution
  nonfiction template.

---

## After Phase 70 (2026-08-01) — Project-creation wizard: genre/audience template

- **`ProjectCategory` is doing double duty as both "genre" and "audience," and that
  will eventually strain.** `childrens` conflates a genre (fiction/nonfiction is
  unspecified) with an audience (age range unspecified) into one value. It works fine
  for today's trim-size + seed-kind mapping, but if a future feature wants to
  distinguish "children's picture book" from "children's early reader" or "YA novel"
  from "adult novel," this single enum won't have room. Worth watching rather than
  fixing now — no evidence yet that finer granularity is actually needed.
- **No UI shows what a category's template will actually seed before the user commits
  to it.** The one-line caption ("we'll set a matching trim size and add a few example
  Planning entries") is honest but abstract — a user can't see *which* trim size or
  *which* entities until after clicking Create. A live preview (e.g. "6×9 · adds
  Character, Location, Style Rule examples") next to the category picker would close
  that gap cheaply, without needing a bigger wizard redesign.
- **The seeded examples never expire or get flagged as unedited.** If a user creates a
  project, ignores Planning mode entirely, and works for months, the "Example
  Character" card sits untouched in their bible indefinitely with no nudge to either
  delete it or use it. Low priority (it's harmless — never exported, clearly labeled),
  but a "you have unedited starter examples" hint somewhere (maybe just in
  `PlanningShell`'s category counts, e.g. a small dot) would be a nice low-cost polish
  once Planning mode sees real usage data.

---

## After Phase 69 (2026-08-01) — Layer 0: TimelineEvent manual reorder UI

- **The Up/Down reorder pattern is now used in three places** (chapters, structural
  pages, timeline events) with three separate hand-written implementations
  (`moveChapterWithHistory`, `movePageWithHistory`, `moveTimelineEventWithHistory` —
  all structurally identical: swap-with-neighbour, record history with the direction
  flipped for undo). Worth a small consolidation pass at some point — a shared
  `swapAdjacentWithHistory` helper parameterised by a "get sorted list"/"swap
  primitive" pair — once a fourth reorderable list shows up and the duplication
  becomes harder to justify as three independent one-offs.
- **Timeline Events have no visual timeline view yet** — the reorder buttons make
  sequencing possible, but the list still renders as plain title/description rows
  identical to every other entity kind, with no sense of "when" spacing or a visual
  line connecting events. A dedicated timeline/ribbon view (even a simple vertical
  line with `when` labels alongside) would make this entity kind noticeably more
  useful for the "keep a complex plot straight" use case the vision doc describes —
  worth considering once more of Phase F ships and there's a sense of which entity
  kinds get heaviest use in practice.

---

## After Phase 68 (2026-08-01) — AI Workspace: paste-response-back with reviewable diff

- **The "insert AI-drafted prose into the manuscript" feature is still genuinely
  open.** Phase 68 closes the bible-sync half of the AI Workspace loop (per
  `AI_WORKSPACE_VISION.md`'s explicit scoping), but the other half — "I asked my AI
  to draft Chapter 7's opening scene, here's the reply, put it in the manuscript with
  something to review before it commits" — is a distinct, probably more commonly
  wanted feature that nothing currently covers. It needs its own scoping pass (most
  likely: hand the pasted text to `src/parser/`'s existing import pipeline to get
  candidate blocks, then a reviewable insert-preview before committing via
  `editorActions.ts`), not a variant of what shipped today. Worth prioritising above
  the Continuity checker if user feedback says "draft new content" matters more than
  "keep the bible in sync," since the former is likely the more visible day-to-day
  value.
- **`PasteBackPanel`'s detection is currently silent about the 6 entity kinds it
  skips.** A user who pastes a response full of new terminology or a new timeline
  event gets zero suggestions and no explanation of why glossary terms/timeline
  events/references aren't covered — the empty state only fires when *nothing at
  all* matches. A "showing suggestions for Characters and Locations only" caption
  (even when suggestions exist) would set expectations better than silence,
  especially before a user has read `docs/ROADMAP.md`'s reasoning.
- **No suggestion survives a Planning-mode re-render if the user navigates away and
  back.** `pastedText`/`statuses`/`drafts` are local component state, not persisted —
  reasonable for a "quick paste, quick review" workflow, but if the AI's reply is
  long and a user gets interrupted mid-review, everything is lost on navigating to
  another Planning category and back. Not worth over-engineering into full
  persistence, but a "you have N unreviewed suggestions" indicator (or just warning
  before navigating away) would be a small, cheap improvement if this turns out to
  bite in practice.

---

## After Phase 67 (2026-08-01) — toolbar overflow fix; Inspector auto-expand

- **Toolbar crowding is now a real constraint, not just a one-off overlap.** The
  right-hand button group (Undo/Redo, theme toggle, Virtual Editor, Planning, Version
  History, Save, Load, Project Settings, Export, Inspector toggle, Keyboard shortcuts)
  has grown to 11 controls with no overflow/wrap strategy — today's fix stops the
  word count from visually overlapping it, but at a sufficiently narrow window the
  same buttons will still crowd or wrap unpredictably (or force horizontal scroll).
  Worth a proper pass at some point: either group the export/save/load/settings
  actions behind a single overflow "…" menu, or move some (Keyboard shortcuts,
  Version History) into a menu bar. Not urgent at typical desktop widths, but will
  bite on smaller windows/laptop screens.
- **The Inspector-auto-expand fix raises a design question worth a decision, not just
  a default:** should collapsing the Inspector be "sticky" (stays collapsed until the
  user explicitly reopens it, even across selections) for a power user who wants
  maximum canvas space and already knows the keyboard/UI well enough not to need
  auto-prompting? Right now every selection reopens it unconditionally. If a user
  deliberately collapses the Inspector to work distraction-free and then clicks a
  block just to move it (not to edit it), it'll now pop back open every time. Low
  risk today since there's no distraction-free canvas-only mode yet — but this is
  worth revisiting once "Distraction-free writing mode" (open Phase F item) ships, so
  the two features don't fight each other.
- **The Sidebar's "Structure" tab and clicking a page in the canvas are now two
  redundant paths to the same editor** — both correct, but worth eventually
  consolidating the mental model in onboarding/empty-state copy (e.g. a first-run
  tooltip: "click any page to edit it") rather than leaving two undocumented paths
  for users to discover independently.

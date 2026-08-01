# Book Studio — Suggestions Log

A running list of ideas, gaps, and recommendations noticed while building — not a
roadmap (see `docs/ROADMAP.md` for committed, prioritised work) and not a bug tracker
(bugs get fixed and logged in `docs/STATUS.md` directly). This is lower-confidence,
lower-priority, or genuinely optional material: things worth the user's attention that
didn't rise to "do this now," organised newest-first, one entry per commit stage per
the 2026-08-01 instruction to append here after every commit.

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

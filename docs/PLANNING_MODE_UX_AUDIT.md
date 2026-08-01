# Planning Mode UX Audit — first-time author test (2026-08-02)

## What this is

The user asked for an honest audit of Planning mode: role-play someone who has never
written a book before, and see whether the tool actually helps them write a few pages
— tested against both a fiction project and a non-fiction project. This document is
that audit: what was tested, what broke, what got fixed on the spot, and what's still
open.

## Method and an honest caveat about coverage

Testing happened live in Chrome against the deployed build
(`bookstudio-rose.vercel.app` — the sandbox this session runs in has no dev server
reachable from the user's browser, and no git push credentials, so live testing had to
target the deployed site rather than the in-progress local commits). A fiction project
("The Lantern Keeper's Daughter," Novel category) was built out fully through
Planning mode: a character, the Three-Act Structure outline template (seeding 8
timeline events), Generate Prompt, and Paste Response, plus every other Planning
category (Locations, Timeline, Glossary, References, Illustration Briefs, Style
Rules, Research Notes).

Partway through, Chrome's action-safety classifier became unavailable for extended
periods and never fully recovered this session, which blocked the "type into a form
field" half of browser automation for the back half of testing. Rather than guess, the
non-fiction half of this audit (project-creation wizard, category seeding, the
Problem → Solution outline template) was verified by reading the actual source
(`projectTemplates.ts`, `outlineTemplates.ts`) instead of clicking through it live.
Everything reported below is grounded in one or the other — flagged inline which is
which. Nothing here is guessed.

## Overall verdict

Planning mode's individual pieces are well-designed in isolation — clear empty
states, sensible defaults, honest copy about what each feature does and doesn't do.
But the live test surfaced one severe bug that would have stopped a first-time author
cold on their very first action, and one structural gap that undercuts the tool's
core promise. Both are documented below; the severe bug is already fixed (pending a
push + live re-verification — see `docs/STATUS.md` Phase 77/78).

## Findings, prioritised

### 1. [Fixed, Phase 77 — pending live verification] A brand-new chapter had no way to add its first paragraph

Live-tested. Creating a chapter via the Chapters sidebar's "+" produces a chapter
with a title and zero content blocks. The content area under the title rendered
nothing — no button, no hover-reveal control, nothing clickable. Extensive live
probing (clicking, hovering at multiple coordinates, the accessibility tree, natural-
language element search) found no path to add a paragraph. Reading
`Page.tsx`'s `renderBlocksWithDropZones` confirmed the root cause: it only ever
renders an insert affordance adjacent to an *existing* block, so a zero-block chapter
gets nothing at all.

This is about as close to launch-blocking as a bug gets for this product specifically:
it breaks the single most basic action (write a paragraph) in the single most common
starting state (a fresh chapter). Fixed by adding an explicit empty-chapter branch
that renders a visible "Start writing" prompt (not just a technically-present but
still-invisible control). Full detail in `docs/STATUS.md`'s Phase 77 entry.

**Not yet live-verified** — the fix is committed locally but the deployed build is
behind it, and this sandbox can't push. Needs the user to push, then a 30-second
click-through to confirm the "Start writing" button actually appears and works.

### 2. [Open, highest remaining priority] There's no assisted way to get written prose into the manuscript at all

Live-tested and read in source. This is a pre-existing, already-documented gap
(`docs/SUGGESTIONS.md`'s "After Phase 68" entry flagged it in the abstract); this
audit confirms it in practice as the actual bottleneck a first-time author hits.

Generate Prompt's own on-screen copy is admirably honest about this: *"Assembles a
minimum-relevant context bundle from your planning bible — copy it into your own
Claude or ChatGPT, then paste the result back into your manuscript yourself. Book
Studio never calls an AI on your behalf."* That's a defensible design choice (no
API-key/cost story yet — see `docs/ROADMAP.md`'s deferred `ApiKeyProvider` item), but
"paste the result back into your manuscript yourself" currently means: open Virtual
Editor, find the right chapter, and manually type or paste the prose into a paragraph
block, one block at a time, with no assistance at all — not even a "paste your draft
here and we'll split it into blocks" helper. For someone who has never written a book
and doesn't know this app's block model, that's a real gap between "the tool helped me
plan" and "the tool helped me write."

Worth calling out explicitly: **Paste Response is a different feature and does not
fill this gap.** Its own copy says exactly what it does — *"Book Studio looks for
existing characters and locations it mentions and proposes adding the relevant
sentence to their notes — nothing is written to your story bible until you accept a
suggestion below."* It only ever proposes appending a sentence to a Character's or
Location's *notes* field. It cannot and does not insert anything into the manuscript.
A first-time author skimming two similarly-worded sidebar items — "Generate Prompt"
and "Paste Response" — could very reasonably assume "Paste Response" is where their
finished chapter goes. It isn't, and nothing in the UI corrects that assumption before
they try it and get a "No mentions found" empty state instead of their prose landing
in the chapter.

**Recommendation:** this is the highest-value thing to build next in this area — a
proper "paste your draft, review it as blocks, insert into the selected chapter"
flow, reusing the existing manuscript-import block-parsing pipeline
(`src/parser/`) the way `docs/SUGGESTIONS.md` already scoped it. Until that exists, a
much cheaper interim fix is just clearer copy: rename or subtitle "Paste Response" to
make the bible-only scope unmissable, and add a one-line pointer from Generate Prompt
to "when you're ready, switch to Virtual Editor and paste your draft into a
paragraph block" so the manual step is at least signposted instead of silently
assumed.

### 3. [Fixed, Phase 78 — reasoned through, not yet live-verified] Pre-filled example text didn't select on focus

Live-tested (fiction project) plus confirmed for every other entity kind by reading
`projectTemplates.ts`. Every category's first example entity — Character, Location,
Style Rule, Reference, Research Note, Glossary Term — seeds a real, fully-written
value (e.g. Character Description: *"Describe your protagonist here. This is a
starter example — edit or delete it."*), not an empty field. Clicking into the field
and typing merges into that text instead of replacing it, since focus-and-type is
ordinary browser behaviour, not select-all. Confirmed live: editing the Character
Description field this way produced garbled merged text. The same underlying pattern
also hit the Chapters sidebar's rename-on-add flow (a new chapter pre-fills "Untitled
Chapter" in an editable input) — typing there produced "Untitled ChapterThe Lighting"
instead of the intended title.

Fixed in two different ways because the two cases warrant different behaviour: the
chapter-rename input now unconditionally selects on focus (a pure rename field, so
that's always correct — the same convention every desktop file browser uses); the
Planning-entity form fields only select on focus when their value still exactly
matches the unedited seed text, so a user's second, third, or hundredth edit to their
own real content is never disrupted by an unwanted selection. Verified compiling
clean; not yet re-tested live (same Chrome-classifier constraint as above).

### 4. [Fixed, Phase 78 — verified via smoke test] Paste-back mention detection required a character's exact full name

Live-tested via direct A/B comparison. Pasting "Wren's hands trembled..." into Paste
Response produced "No mentions found." Pasting "Wren Ashgrove's hands trembled..."
correctly produced a suggestion. Since prose almost never keeps repeating a
character's full name after introducing them, this missed the large majority of real
mentions in practice — arguably making the whole feature feel broken to a first-time
user who pastes a normal paragraph and gets nothing back.

Fixed: mention detection now matches on the full name or any individual
significant word within it (so "Wren" alone now correctly matches "Wren Ashgrove"),
with a stopword list so this doesn't over-fire on common words that happen to appear
inside a name or location title (a location called "The Lighthouse" no longer
produces a spurious suggestion for every sentence containing the word "the" — caught
by the standalone smoke test before this ever reached the browser). Verified with a
dedicated `tsx` smoke script covering first-name-only, last-name-only, full-name, and
single-word-location cases.

### 5. [Open, lower priority — code-reviewed] Planning mode's category list has no onboarding order or guidance

Read in source (`PlanningShell.tsx`'s category list) and live-observed. A first-time
author lands directly on "Characters" (or whichever category is first) with eight
peer-level sidebar items — Characters, Locations, Timeline, Glossary, References,
Illustration Briefs, Style Rules, Research Notes — plus Outline Templates, Generate
Prompt, and Paste Response below a divider, and nothing indicates order, which are
optional, or why any of it matters before a single word of the book exists. The
individual empty states are genuinely good (clear icon, one-line explanation, a
single obvious button — e.g. Illustration Briefs' "No illustration briefs yet / Add
your first illustration brief to start building this book's planning bible"), but
there's no equivalent framing one level up, at the "which of these eight things
should I even look at first" level. A short first-run explainer or suggested-order
nudge (even just reordering "Outline Templates" above the flat entity list, since
picking a structure is the more natural first step than cataloguing characters) would
meaningfully help someone with zero prior context.

### 6. [Open, code-reviewed only — not live-verified this session] Non-fiction category still shows two irrelevant sidebar categories by default

Confirmed by reading `projectTemplates.ts`'s `CATEGORY_TEMPLATES`. Every project,
regardless of category, gets the full set of eight Planning categories in its sidebar
(`PlanningShell` always shows all eight — this is explicitly documented in the file's
own comment as a deliberate, minimal-scope choice, not an oversight). The `nonfiction`
category correctly seeds an example Reference, Research Note, and Glossary Term (no
Character or Location, since a self-help or how-to book doesn't need them) — a
sensible, well-thought-out default. But because every category still shows all eight
sidebar entries unconditionally, a non-fiction author still sees empty "Characters"
and "Locations" tabs sitting alongside the ones that matter to them, with nothing
distinguishing "not relevant to your book" from "relevant but you haven't added one
yet." Low-severity (the empty states are self-explanatory, and deleting or ignoring
an unused category costs nothing), but worth a look if/when Planning mode's category
list gets a genre-aware pass.

### 7. [Positive finding] The non-fiction outline template is well-built

Read in source (`outlineTemplates.ts`). "Problem → Solution (Non-fiction)" is a full
nine-beat persuasive-argument structure — Hook, Problem Statement, Why It Matters,
Background/Context, Core Argument/Solution, Supporting Evidence, Addressing
Counterarguments, Practical Application, Conclusion/Call to Action — genuinely useful
scaffolding for someone who's never structured a non-fiction chapter before, on par
with the fiction templates' quality (Three-Act Structure, Hero's Journey, Save the
Cat). No changes recommended here.

## What shipped this session (Phase 76–78)

- Manuscript search now covers chapter titles, not just block content (Phase 76).
- Empty-chapter "no way to add a first block" bug — fixed, needs a push + live
  re-verify (Phase 77).
- Pre-filled example text now selects on focus, precisely scoped to unedited seed
  values (Phase 78).
- Paste-back mention detection now matches on individual name words, not just the
  complete stored name (Phase 78).

## Recommended priority order for what's still open

1. Push the currently-unpushed commits, then live-verify all three fixes above in
   Chrome (cheap, closes the loop on today's work).
2. Scope and build the "insert AI-drafted prose into the manuscript" flow (finding
   #2) — this is the actual missing link between Planning mode and a finished page,
   and the single highest-leverage thing to build next in this area.
3. A lightweight first-run explainer or suggested order for Planning mode's category
   list (finding #5) — cheap relative to its likely impact on a genuinely new user.
4. Category-aware Planning sidebar (finding #6) — lowest priority of the open items;
   real but low-severity.

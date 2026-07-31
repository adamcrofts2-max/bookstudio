# Virtual Editor — Design & Status

An AI-powered editorial assistant for Book Studio: proofreading, copy editing,
developmental editing, publishing-standards review, readability, consistency,
field-guide completeness, layout, typography, accessibility, print readiness and
commercial quality — all reviewed before publication, the way an experienced
publishing team would.

**This document is the design for the whole feature. The "What's real today"
table below is the honest boundary of what's actually built — follow
`docs/STATUS.md`'s precedent and don't infer more than that table says.**

## Core principle

The Virtual Editor never overwrites the manuscript. Every recommendation is a
`Finding` the user can Fix / Reject / Edit / Ignore / Ignore Similar, plus batch-fix
a whole category or the whole report at once (see § The suggestion engine & action
verbs for how the original spec's per-finding "Apply to Chapter"/"Apply to Book"
verbs became these dashboard-level actions instead). Every finding explains what's
wrong and why it matters. Accepting a fixable finding creates a revision — the
original block is snapshotted before anything changes.

## Architecture — where this sits in the existing layer stack

```
Layer 1  Project     (projectStore)        — untouched
Layer 2  Content     (contentStore)        — read-only to Virtual Editor, except
                                              via its own updateBlock action
Layer 3  Theme       (theme/presets)       — read-only, future typography checks
Layer 4  Layout      (renderer/paginate)   — read-only, future publishing-standards checks
Layer 5  Rendering   (renderer/*)          — untouched; Virtual Editor is a new
                                              sibling workspace, not a rendering change
Layer 6  PDF Export  (pdf/*)               — read-only, future print-readiness checks
────────────────────────────────────────────────────────────────────────────
NEW      Virtual Editor  (src/virtualEditor/, src/store/virtualEditorStore.ts)
```

`src/virtualEditor/` is a new, independent layer, exactly like Theme or Layout
Engine are independent of Content. It:

- **reads** `Manuscript` (Layer 2) through `Checker.run({ manuscript, styleGuide })`
  — checkers never import `contentStore`, they only see the data they're handed.
- will eventually also read Theme/Layout/Rendering output (typography, pagination,
  print geometry) the same way — as plain data passed into a `CheckerContext`, never
  by reaching into those stores.
- **never mutates anything itself.** `Checker.run` and `AiReviewer.run` are pure —
  same input, same findings. The *only* place a `Finding` becomes a real edit is
  `virtualEditorStore.acceptFix`, and it does that by calling
  `contentStore.updateBlock(...)` — the exact same published action
  `TypographyPanel`/`ImagePanel` use. No layer reaches into another layer's data,
  per `CLAUDE.md`.

This mirrors the project's existing rule: Themes control presentation without
touching Content; the Virtual Editor critiques everything without touching anything,
until the user explicitly says "yes, apply this."

### Source layout

```
src/virtualEditor/
  types.ts             Finding, Checker, AiReviewer, IssueCategory, Severity,
                        StyleGuide, EditorialReport — the shared vocabulary
  textExtract.ts        Manuscript -> flat plain-text spans (chapterId, blockId,
                        field, text) — the only place that knows how to read text
                        out of each ContentBlock variant
  textPatch.ts          the inverse: (block, field, transform) -> Partial<ContentBlock>
                        patch, used to build SuggestedFix.apply
  checkers/
    proofreading.ts      6 real, deterministic checkers (see below)
    consistency.ts       2 real, deterministic checkers (term casing, unit style)
    readability.ts       2 real, deterministic checkers (Flesch formulas, long sentences)
    index.ts             ALL_CHECKERS registry
  aiReviewer.ts          AiReviewer interface stub + NullAiReviewer instances for
                        every category that doesn't have a real checker yet
  scoring.ts             severity → score-deduction weights, category/overall
                        aggregation, SCORE_TILES (the 11 dashboard tiles)
  pipeline.ts            runPipeline(projectId, manuscript) -> EditorialReport

src/store/virtualEditorStore.ts   Zustand store: reports, finding statuses,
                                   revision log, acceptFix/restoreRevision

src/layout/virtualEditor/
  VirtualEditorWorkspace.tsx      the Editorial Dashboard (new workspace)
  ScoreCard.tsx                   one score tile
  FindingRow.tsx                  one finding + its action buttons
```

## The hybrid AI workflow

Per the product brief, this is deliberately **not** "send the manuscript to an
LLM and hope." Two kinds of check, one pipeline:

1. **`Checker` (deterministic, synchronous).** Widows/orphans, punctuation,
   spacing, bracket/quote matching, image resolution, layout geometry,
   consistency of literal strings — anything with a correct, checkable answer.
   Fast, free, 100% reproducible, and the user can always see exactly why a
   finding fired (see `checkers/proofreading.ts` for six real ones).
2. **`AiReviewer` (model-backed, asynchronous — designed, not built).**
   Developmental editing judgement, readability/reading-age estimation, design
   critique, "does this chapter opener feel weak," contextual style learning.
   These need judgement a regex can't provide, so they're reserved for a model.
   `aiReviewer.ts` defines the interface and registers a `NullAiReviewer` stub
   per unimplemented category — always `isAvailable() === false`, always
   returns `[]`. This is what lets the dashboard say "Not yet analysed" instead
   of fabricating a number, and it means adding a real AI module later is a
   drop-in: implement `AiReviewer`, register it, done.

`runPipeline` today only runs `ALL_CHECKERS` (synchronous). Once a real
`AiReviewer` exists, `runPipeline` becomes `async`: run every `Checker` first
(instant), then `await` every *available* `AiReviewer` and merge their findings
in. That's an isolated change to one function — nothing else in the app needs to
know the pipeline became partly asynchronous.

## Review pipeline

```
"Review Entire Book" click
  → virtualEditorStore.runReview(projectId, manuscript)
      → pipeline.runPipeline(projectId, manuscript, styleGuide?)
          → ALL_CHECKERS.flatMap(checker => checker.run({ manuscript, styleGuide }))
          → scoring.computeCategoryScores(findings, analysedCategories)
          → scoring.computeOverallScore(categoryScores)
      → EditorialReport { findings, categoryScores, overallScore }
  → stored in virtualEditorStore.reportsByProject[projectId]
  → VirtualEditorWorkspace re-renders: score tiles + findings list
```

The report is a **snapshot**, not a live subscription — it doesn't update itself
as the user edits the manuscript. Re-running "Review Entire Book" recomputes it
from scratch. This keeps the mental model simple (what you see is what was found
at that point in time) and matches how a real editorial pass works: you get a
report, act on it, then ask for another pass.

## Confidence scoring

Every `Finding` carries a `confidence` (0–1) alongside its `severity`
(`critical` / `major` / `minor` / `suggestion`). Deterministic checkers set
`confidence` by hand based on how ambiguous the pattern is:

| Checker | Confidence | Why |
|---|---|---|
| Double space | 1.0 | Unambiguous — literally counting characters |
| Repeated word | 0.9 | Very likely a typo; a few phrases legitimately repeat a word |
| Unmatched brackets | 0.85 | Reliable stack-matching, but a lone bracket used as a stylistic aside is possible |
| Unmatched quotes | 0.6 | Straight-quote apostrophes inside contractions can throw off a naive count |
| Missing terminal punctuation | 0.55 | Some short lines (labels, captions) legitimately have none |
| Quote-style consistency | 0.5 | A heuristic pattern across the whole book, not a per-sentence fact |
| Flesch Reading Ease / Grade Level | 0.7 | The formulas are exact and standard; the input syllable count is a vowel-group heuristic approximation, not a dictionary lookup |
| Long average sentence length | 0.6 | Naive punctuation-based sentence splitting can misjudge boundaries around abbreviations |
| Metric vs imperial unit mixing | 0.55 | Regex-based unit detection is reliable in aggregate, but a deliberate "give both" convention (e.g. "5 metres (16 feet)") would still count as a mix |
| Term-casing consistency | 0.5 | A capitalisation heuristic with no dictionary of real proper nouns — same "book-wide pattern, not certainty" caveat as quote-style consistency |
| Metric abbreviation-style consistency | 0.5 | Same heuristic caveat as term-casing — a style pattern across the book, not a per-instance fact |

**Score formula** (`scoring.ts`): start at 100, subtract
`SEVERITY_WEIGHT[severity] * confidence` for every finding in a category, floor at 0.
`SEVERITY_WEIGHT = { critical: 12, major: 6, minor: 3, suggestion: 1 }`. This is
intentionally simple and hand-checkable — a professional publishing tool can't
produce a score nobody can explain. A category with a registered checker but zero
findings scores a real 100; a category with **no** checker/reviewer registered at
all scores `null` ("Not yet analysed") — the dashboard renders these differently
on purpose (see `ScoreCard.tsx`). The Overall score is the mean of whatever
categories have been analysed — not weighted by importance yet, which is a
deliberate, documented simplification rather than a hidden assumption.

## Issue-type taxonomy

Every `Finding.category` is one of 12 `IssueCategory` values. 10 of them (plus an
Overall tile) get a dashboard score card, per the product spec's named list of 11
scores; `developmental` and `fieldGuide` don't get their own tile (the spec's
dashboard list doesn't name them) but exist for findings/checkers to use — their
findings still show up in the Findings list under their own category label.

| Category (dashboard label) | Real today | Designed for later |
|---|---|---|
| **Proofreading** | Double spaces, repeated adjacent words, unmatched quotes, unmatched brackets, missing terminal punctuation, straight/curly quote consistency | Spelling, dash consistency, ellipsis consistency, missing/extra spaces around punctuation, broken hyperlinks, malformed URLs |
| **Grammar** (`copyEditing`) | — | Grammar, sentence flow, awkward wording, passive voice, word repetition, overly long sentences, inconsistent terminology/abbreviations, capitalisation, number/bullet/table formatting, italic species names |
| *(taxonomy only)* `developmental` | — | Weak intros/conclusions, out-of-place chapters, missing explanations/diagrams/examples, poor transitions, repetition, information overload, chapter length outliers, logical inconsistencies |
| **Publishing Quality** (`publishingStandards`) | — | Stranded chapter titles, widows, orphans, images separated from captions, captions without images, bad table splits, bad page turns, crowded/sparse pages, isolated bullets, single-line paragraphs/headings, blank pages, missing folios, running-header errors, inconsistent margins/spacing |
| **Readability** | Book-wide Flesch Reading Ease + Flesch-Kincaid Grade Level (real word/sentence/syllable-count formulas, informational, always reported), per-paragraph unusually-long-average-sentence-length flag | Reading age (beyond Flesch-Kincaid), passive-voice %, reading time, chapter difficulty, reading fatigue |
| **Consistency** | Term-casing consistency ("Forest Garden" vs "forest garden", two-word terms only), metric-vs-imperial unit mixing, abbreviated-vs-spelled-out metric unit style ("5m" vs "5 metres") | "Figure 2" vs "Fig. 2", British vs American spelling, italic scientific names, heading/caption spacing, three-plus-word term casing, imperial abbreviation style ("5ft" vs "5 feet") |
| *(taxonomy only)* `fieldGuide` | — | Species-profile completeness: scientific name, common name, family, origin, uses, wildlife value, edibility, medicinal use, propagation, care, height/spread, hardiness, light, moisture, warnings, seasonality, illustrations, references |
| **Layout** | — | Visual imbalance, poor image placement, weak chapter openers, inconsistent image sizes, poor whitespace/hierarchy, page density |
| **Typography** | — | Font hierarchy, leading, tracking, kerning, hyphenation quality, line length, paragraph rhythm, heading hierarchy |
| **Accessibility** | — | Contrast, minimum font size, colour-blindness safety, screen-reader compatibility, line spacing, print readability |
| **Print Readiness** | — | Bleed, crop marks, embedded fonts, CMYK readiness, image resolution, trim, spine, page count, blank pages |
| **Commercial Quality** | — | Professional appearance, educational quality, visual impact, reader engagement, market readiness, "does this feel like a £40–£60 book" |

**Proofreading**, **Consistency**, **Readability**, and an honest **Overall**
(the mean of those three analysed categories) show a real number today. Every
other tile still renders "Not yet analysed."

## The suggestion engine & action verbs

Every `Finding` optionally carries a `SuggestedFix { summary, apply }`.
`apply(block)` is a pure function returning a `Partial<ContentBlock>` patch — it
never touches the store. Only findings with a genuinely unambiguous mechanical fix
get one (double spaces, repeated words, missing terminal punctuation); ambiguous
ones (unmatched quotes/brackets, quote-style consistency) are flag-only, matching
the spec's "suggest improvements, never rewrite automatically" instruction for
anything above pure mechanics.

Actions available on every finding in `FindingRow.tsx` (updated — Phase 13
shipped Edit and a batch-apply mechanism; this table went stale after that
phase landed and is now corrected to match reality):

| Action | Status |
|---|---|
| Fix (formerly "Accept") | Real — only shown when a `suggestedFix` exists; calls `virtualEditorStore.acceptFix` |
| Reject | Real — marks the finding `rejected` (UI-only status, no learning yet) |
| Edit | Real — switches back to the manuscript workspace, selects the finding's block, scrolls to it via `requestScrollToBlock`, and enters inline edit mode automatically. Disabled (with a tooltip) only for book-wide findings that have no single `blockId` to jump to. |
| Ignore | Real — marks the finding `ignored` |
| Ignore Similar | Real — marks every current finding sharing the same `issueType` as `ignoredSimilar` |
| Apply to Chapter / Apply to Book | **Redesigned, not disabled.** The original per-row placeholders (batch-apply this finding's fix across just its chapter, or the whole book) were replaced by two dashboard-level actions that cover the same underlying need with less UI clutter: a single "Fix All" button (applies every currently-fixable `'new'` finding across the whole report) and a per-category-group "Fix all in [Category]" button (same, scoped to one `IssueCategory`, shown next to each category's findings). See `docs/STATUS.md`'s Phase 13 entry for the full reasoning — keeping three overlapping batch-apply affordances on screen at once was judged more confusing than useful. |

Disabled actions (today, only "Edit" on a blockId-less finding) carry a tooltip
explaining why, rather than being hidden — the user should always understand
the full available action set, and never be told something happened that
didn't.

## Non-destructive editing

`acceptFix` in `virtualEditorStore.ts`:

1. Reads the current block from `contentStore` (read-only).
2. Computes the patch via `finding.suggestedFix.apply(block)`.
3. Pushes a `Revision { before: block, after: patch, ... }` onto
   `revisionsByProject[projectId]` — the **original block**, byte for byte, before
   anything changes.
4. Calls `contentStore.updateBlock(projectId, chapterId, blockId, patch)` — the
   same action every other editing UI in the app uses.

`restoreRevision` reverses step 4 by re-applying `revision.before`'s values for
whichever fields `revision.after` touched, again via `updateBlock`. The manuscript
itself never carries edit-history baggage — `Manuscript`/`ContentBlock` in
`types/content.ts` are unchanged; all revision bookkeeping lives in
`virtualEditorStore`, a sibling layer, never inside Content.

**What's built now:** a flat revision log per project, each entry showing what
changed and a one-click "Restore original" (see the Revision History section of
`VirtualEditorWorkspace.tsx`).

**Deferred (documented, not hidden):**
- The spec's "Original / Revision A / Revision B / Revision C" side-by-side
  comparison UI. This milestone ships a linear list with restore, not a diff view.
- Persisting the revision log (and reports) across a page reload. Both currently
  live in a non-persisted Zustand store — cheap to recompute, and a
  `SuggestedFix.apply` function value can't round-trip through `localStorage`'s
  JSON serialization anyway. A future pass could persist the revision log (plain
  data, no functions) separately from the ephemeral report.
- Multi-step undo chains (restoring revision 1 after revision 2 has also touched
  the same block isn't reconciled — last write wins, same as any direct edit).

## AI Learning (designed, not built)

The spec asks for a personal editorial profile: stop suggesting Oxford commas if
the user keeps rejecting them, learn their English-variant preference, adapt to
preferred paragraph length. None of this is implemented. The intended shape:

- Every `setFindingStatus` call (`accepted`/`rejected`/`ignored`) is already a
  labelled training signal, sitting right there in `virtualEditorStore`.
- A future `editorialProfile` slice would tally decisions per `issueType` +
  `StyleGuide` field, and `runPipeline` would consult it to suppress or
  downweight findings the user has consistently rejected — without deleting the
  checker itself (so a decision can always be un-learned).
- This is explicitly a *closed loop with the Style Guide*, not a black box: the
  learned profile should be inspectable/editable by the user like any other
  setting, never a silent behavior change.

## Style Guide (designed, not built)

`StyleGuide` (in `types.ts`) already exists as a type — English variant, Oxford
comma, quote style, heading capitalisation, measurement units, date format — and
`Checker.run` already accepts it as optional context (`CheckerContext.styleGuide`),
so wiring it in later doesn't require changing the `Checker` interface. No UI to
edit a project's Style Guide exists yet, and no checker currently reads it (the six
proofreading checkers in this milestone don't have style-dependent behaviour). A
`DEFAULT_STYLE_GUIDE` constant is provided as the eventual default.

## Editorial Dashboard (what's built)

A new workspace, reached via a **"Virtual Editor" toggle in the Toolbar**
(`src/layout/Toolbar.tsx`) — chosen over a new route because the three-column
`AppShell` never moves per `docs/UI_DESIGN_SYSTEM.md`; only the centre column's
contents change (exactly like Sidebar's Chapters/Assets tabs, or the Inspector's
tab set). `uiStore.workspaceMode` (`'manuscript' | 'virtualEditor'`) decides what
`Workspace.tsx` renders; `AppShell`, `Sidebar` and `Inspector` are untouched.

`VirtualEditorWorkspace.tsx` shows:
- All 11 named scores (`SCORE_TILES` in `scoring.ts`) — real numbers for
  Proofreading, Consistency, Readability + Overall, "Not yet analysed" for the
  other 7.
- A "Review Entire Book" button that runs the pipeline against the project's
  current manuscript.
- The findings list: severity, category, confidence, a clickable location
  (switches back to the manuscript workspace and scrolls to the finding via
  `selectionStore.requestScrollToBlock`/`requestScrollToChapter` — the same
  force-mount-then-scroll mechanism `Sidebar.tsx`'s chapter nav and
  `ThumbnailRail.tsx`'s page clicks use), the required what's-wrong/why-it-
  matters text, and the action buttons described above.
- A revision history list with one-click restore.

**Block-level scroll-to-finding is real, not a simplification.** When a
finding's `location` carries a `blockId` (most findings do — book-wide ones
like quote-style/unit/term-casing consistency and the Flesch report
deliberately omit it, per `FindingLocation`'s own doc comment), clicking it
calls `selectionStore.requestScrollToBlock(chapterId, blockId)`, which
`BookRenderer.tsx`'s `scrollRequest` effect resolves via a `{ type: 'block' }`
target: it force-mounts the spread containing that exact block (matched by
`spreadMatchesScrollTarget`, tested in `scripts/smoke-test.ts`) and then
scrolls to the real `[data-block-id]` DOM node once mounted — not merely the
chapter's opening page. Only findings with no single block location (the
book-wide ones above) fall back to chapter-level scroll, which is the
correct behaviour for a pattern that isn't about one block. An earlier
version of this document described block-level scroll as a future
follow-up; it was already implemented (Phase 13) by the time that paragraph
was written and the paragraph was simply never corrected — fixed here.

## Future extensibility

`AiReviewer` is the seam every future AI module plugs into — implement the
interface, register it in place of the matching `NullAiReviewer` stub, and
`runPipeline` picks it up once it becomes async (see § Hybrid AI Workflow). This
is intentionally the same shape for every future module the product spec names as
"design for, don't build yet":

- Fact checking / citation verification
- Automatic indexing
- Glossary generation
- Bibliography generation
- Translation
- Audio narration
- AI writing assistant
- Research assistant
- Diagram generation
- Image generation

None of these are stubbed individually (unlike the 11 editorial categories, which
already have `NullAiReviewer` placeholders) because they aren't part of the
Virtual Editor's own taxonomy — they're separate future services that would
plug into the same layer boundary: read Project/Content/Theme/Layout output,
never mutate it directly, report through the same `Finding`-like structure (or
their own equivalent) so the UI patterns here (non-destructive apply, explain-why,
revision log) generalise to them too.

## What's real vs. designed — quick reference

| Piece | Status |
|---|---|
| Layer boundary (`src/virtualEditor/`, own store, never mutates Content directly) | **Real** |
| `Checker` interface + registry | **Real** |
| 6 deterministic proofreading checkers | **Real**, tested in `scripts/smoke-test.ts` |
| 2 deterministic consistency checkers (term casing, unit style) | **Real**, tested in `scripts/smoke-test.ts` — no spell-check dictionary, no NLP-based term/proper-noun extraction, no British/American spelling check |
| 2 deterministic readability checkers (Flesch Reading Ease/Grade Level, long sentences) | **Real**, tested in `scripts/smoke-test.ts` — heuristic vowel-group syllable counting (not a pronunciation dictionary), no reading-age estimate beyond Grade Level, no passive-voice/reading-time/fatigue metrics |
| `AiReviewer` interface | **Real** (interface only — `NullAiReviewer` is the only implementation) |
| Score aggregation (category + overall) | **Real** |
| Editorial Dashboard UI, 11 score tiles | **Real** (4 of 11 show real numbers: Proofreading, Consistency, Readability, Overall) |
| Review Entire Book pipeline | **Real** (synchronous, deterministic-only) |
| Fix / Reject / Ignore / Ignore Similar / Edit | **Real** (Edit disabled only for book-wide findings with no single block to jump to) |
| Batch-apply ("Fix All" + per-category "Fix all in [Category]", replacing the original "Apply to Chapter"/"Apply to Book" placeholders — see Phase 13 in `docs/STATUS.md`) | **Real** |
| Non-destructive revision log + restore | **Real** (linear list, in-memory only) |
| Original/RevA/RevB/RevC side-by-side compare | **Designed, not built** |
| Copy editing / developmental / publishing-standards / field-guide / layout / typography / accessibility / print / commercial checkers | **Designed, not built** |
| AI Learning / editorial profile | **Designed, not built** |
| Style Guide enforcement | **Type + plumbing exist, not enforced by any checker yet** |
| Future AI modules (fact-check, indexing, glossary, etc.) | **Named as extension points, not stubbed individually** |

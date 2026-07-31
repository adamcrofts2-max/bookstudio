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
Layer 4  Layout      (renderer/paginate)   — read-only; real publishing-standards/
                                              layout checks since Phase 25 (see below)
Layer 5  Rendering   (renderer/*)          — untouched; Virtual Editor is a new
                                              sibling workspace, not a rendering change
Layer 6  PDF Export  (pdf/*)               — read-only, future print-readiness checks
────────────────────────────────────────────────────────────────────────────
NEW      Virtual Editor  (src/virtualEditor/, src/store/virtualEditorStore.ts)
```

`src/virtualEditor/` is a new, independent layer, exactly like Theme or Layout
Engine are independent of Content. It:

- **reads** `Manuscript` (Layer 2) through `Checker.run({ manuscript, styleGuide, pages })`
  — checkers never import `contentStore`, they only see the data they're handed.
- **since Phase 25, also reads real Layout Engine output** (`pages:
  LaidOutPage[]`) the same way: as plain data passed into `CheckerContext`,
  never by reaching into `renderer/*` or `exportStore` directly. See §
  Publishing Standards & Layout checkers below for exactly how this is
  plumbed through without a second pagination pipeline. Theme/Rendering
  output (typography, print geometry) is still a future extension of the
  same pattern.
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
    proofreading.ts        6 real, deterministic checkers (see below)
    consistency.ts         2 real, deterministic checkers (term casing, unit style)
    readability.ts         2 real, deterministic checkers (Flesch formulas, long sentences)
    copyEditing.ts         1 real, Style-Guide-dependent checker (heading capitalisation)
    publishingStandards.ts 3 real checkers reading real pagination output (Phase 25)
    layout.ts              2 real checkers reading real pagination output (Phase 25)
    index.ts               ALL_CHECKERS registry
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
  → virtualEditorStore.runReview(projectId, manuscript, styleGuide?)
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
| Quote-style consistency (no Style Guide preference) | 0.5 | A heuristic pattern across the whole book, not a per-sentence fact |
| Quote-style preference violation (Style Guide `quoteStyle` set) | 0.7 | Applying an explicit, user-declared rule is more certain than inferring a book-wide pattern, but a straight quote/apostrophe used deliberately inside a quoted excerpt is still theoretically possible |
| Flesch Reading Ease / Grade Level | 0.7 | The formulas are exact and standard; the input syllable count is a vowel-group heuristic approximation, not a dictionary lookup |
| Long average sentence length | 0.6 | Naive punctuation-based sentence splitting can misjudge boundaries around abbreviations |
| Metric vs imperial unit mixing | 0.55 | Regex-based unit detection is reliable in aggregate, but a deliberate "give both" convention (e.g. "5 metres (16 feet)") would still count as a mix |
| Term-casing consistency | 0.5 | A capitalisation heuristic with no dictionary of real proper nouns — same "book-wide pattern, not certainty" caveat as quote-style consistency |
| Metric abbreviation-style consistency | 0.5 | Same heuristic caveat as term-casing — a style pattern across the book, not a per-instance fact |
| Heading capitalisation (Style Guide `headingCapitalisation` set) | 0.5 | No dictionary of proper nouns — a genuine proper noun later in a Sentence-case heading (e.g. "The history of London") will false-positive; directionally useful, not linguistically complete |
| Sparse chapter ending | 0.5 | A heuristic pattern (one short paragraph alone on a chapter's final page), not a per-instance fact — a short closing line can be a deliberate stylistic choice |
| Empty chapter | 0.9 | Nearly unambiguous — either a chapter has blocks in its pages or it doesn't; shaded slightly below 1.0 only because this codebase has no distinct "part divider" block type for a chapter deliberately meant to be title-only |
| Consecutive blank pages | 0.85 | The detection itself (counting adjacent blank pages) is exact; shaded down slightly from 1.0 only because asserting "this is always a bug" is about a situation `paginate.ts`'s own construction has never had to reason about happening at all |
| Inconsistent image sizing | 0.5 | A polish-nit heuristic (bucketed effective width, see `layout.ts`) — a deliberate small set of sizes vs a genuinely inconsistent spread is a judgement call, not a fact |
| Image density imbalance | 0.5 | A simple book-average-based outlier rule, not a design judgement about whether a chapter's illustration density is actually wrong |

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
| **Proofreading** | Double spaces, repeated adjacent words, unmatched quotes, unmatched brackets, missing terminal punctuation, straight/curly quote consistency (book-wide heuristic with no Style Guide preference set, **or** a per-span preference-violation flag once `styleGuide.quoteStyle` is `'curly'`/`'straight'`) | Spelling, dash consistency, ellipsis consistency, missing/extra spaces around punctuation, broken hyperlinks, malformed URLs |
| **Grammar** (`copyEditing`) | Heading capitalisation (Title Case / Sentence case), but **only when** `styleGuide.headingCapitalisation` is explicitly set to `'title-case'` or `'sentence-case'` — silent with no preference | Grammar, sentence flow, awkward wording, passive voice, word repetition, overly long sentences, inconsistent terminology/abbreviations, number/bullet/table formatting, italic species names |
| *(taxonomy only)* `developmental` | — | Weak intros/conclusions, out-of-place chapters, missing explanations/diagrams/examples, poor transitions, repetition, information overload, chapter length outliers, logical inconsistencies |
| **Publishing Quality** (`publishingStandards`) | *(Phase 25, needs `ctx.pages` — real pagination output, see § below)* Sparse chapter endings (a lone short paragraph alone on a chapter's final page), empty chapters (no content at all under the title), consecutive blank pages (a sanity check — should be structurally impossible today) | Images separated from captions, captions without images, bad table splits, bad page turns, crowded pages, isolated bullets, missing folios, running-header errors, inconsistent margins/spacing. **Widows/orphans are not a future item** — `paginate.ts`'s heading-orphan guard already prevents them structurally, by construction, not something to detect after the fact. **Page-numbering-uniqueness was considered and deliberately dropped** — once structural (front/back-matter) pages are correctly excluded, `paginate.ts` numbers every real page exactly once by construction; there was nothing left to check |
| **Readability** | Book-wide Flesch Reading Ease + Flesch-Kincaid Grade Level (real word/sentence/syllable-count formulas, informational, always reported), per-paragraph unusually-long-average-sentence-length flag | Reading age (beyond Flesch-Kincaid), passive-voice %, reading time, chapter difficulty, reading fatigue |
| **Consistency** | Term-casing consistency ("Forest Garden" vs "forest garden", two-word terms only), metric-vs-imperial unit mixing, abbreviated-vs-spelled-out metric unit style ("5m" vs "5 metres") | "Figure 2" vs "Fig. 2", British vs American spelling, italic scientific names, heading/caption spacing, three-plus-word term casing, imperial abbreviation style ("5ft" vs "5 feet") |
| *(taxonomy only)* `fieldGuide` | — | Species-profile completeness: scientific name, common name, family, origin, uses, wildlife value, edibility, medicinal use, propagation, care, height/spread, hardiness, light, moisture, warnings, seasonality, illustrations, references |
| **Layout** | *(Phase 25, needs `ctx.pages`)* Inconsistent image sizing within a chapter (3+ images spread across more than 3 distinct effective-width buckets), image density imbalance book-wide (a chapter with zero images when the book averages 2+, or more than double the book's average) | Visual imbalance beyond image count/size, poor image placement relative to text, weak chapter openers, poor whitespace/hierarchy. **True whitespace/fill-ratio measurement (e.g. "this page is only 20% full") is not built** — `LaidOutPage` doesn't store each block's real rendered height (that only exists transiently inside `HeightMeasurer`'s off-screen DOM pass), so a genuine page-density check needs that measurement threaded through too, which this milestone didn't do |
| **Typography** | — | Font hierarchy, leading, tracking, kerning, hyphenation quality, line length, paragraph rhythm, heading hierarchy |
| **Accessibility** | — | Contrast, minimum font size, colour-blindness safety, screen-reader compatibility, line spacing, print readability |
| **Print Readiness** | — | Bleed, crop marks, embedded fonts, CMYK readiness, image resolution, trim, spine, page count, blank pages |
| **Commercial Quality** | — | Professional appearance, educational quality, visual impact, reader engagement, market readiness, "does this feel like a £40–£60 book" |

**Proofreading**, **Consistency**, **Readability**, **Grammar** (`copyEditing`,
since Phase 24), and an honest **Overall** always show a real number today —
this paragraph was stale from before Phase 24 landed a registered `copyEditing`
checker and was never corrected until now. **Publishing Quality**
(`publishingStandards`) and **Layout** (since Phase 25) show a real number
whenever `ctx.pages` was available for that review run (see § Publishing
Standards & Layout checkers below) — otherwise, exactly like every other
tile that has no applicable checker for the current context, they render
"Not yet analysed." Every other tile (`typography`, `accessibility`, `print`,
`commercial`) still always renders "Not yet analysed" — no checker exists
for them at all yet.

## Publishing Standards & Layout checkers (Phase 25)

The architectural gap that made `publishingStandards`/`layout` impossible to
build before this phase: every `Checker` only ever received
`{ manuscript, styleGuide }` — there was no way to see real pagination output
(page breaks, which blocks landed on which page, blank/structural pages) at
all. Two changes closed this gap:

- **`CheckerContext.pages?: LaidOutPage[]`** (`types.ts`) — the real,
  fully-measured pagination output. Reused, not re-derived: `BookRenderer.tsx`
  already publishes the exact `LaidOutPage[]` it renders (via
  `composeBookPages(frontMatter, paginatedPages, backMatter)`) into
  `useExportStore.getState().setLayout(project.id, { pages, toc, pageBox,
  theme })` in a `useEffect` — the same data PDF export reads. There is no
  second pagination/measurement pipeline in the Virtual Editor;
  `VirtualEditorWorkspace.tsx` simply reads
  `useExportStore((s) => s.byProject[project.id])?.pages` and passes it
  through. This is optional and genuinely `undefined` whenever the manuscript
  workspace hasn't rendered at least once this session — a small, honest
  caption below the "Review Entire Book" button says so when it's missing,
  rather than silently running an incomplete review.
- **`Checker.isApplicable?: (ctx: CheckerContext) => boolean`** (`types.ts`) —
  defaults to "always applicable" when omitted, so every pre-existing checker
  (proofreading/consistency/readability/copyEditing) needed zero changes.
  Every checker in `publishingStandards.ts`/`layout.ts` declares
  `isApplicable: (ctx) => !!ctx.pages` and returns `[]` immediately if
  `ctx.pages` is absent. `pipeline.ts`'s `analysedCategories` now only counts
  a category as analysed when at least one of its checkers is actually
  applicable to the context being run — not merely "registered" — which is
  what lets the dashboard honestly report "Not yet analysed" for these two
  categories instead of a fabricated 100 when `pages` wasn't available for
  that review.

**The 5 checkers**, all deterministic, synchronous, and reading `ctx.pages`
exclusively (never `ctx.manuscript`) — see each file's doc comments for the
full reasoning, thresholds, and honestly-documented limitations:

- `publishingStandards.ts`:
  - `sparseChapterEndingChecker` (`minor`) — a chapter's last page has
    exactly one block, it's a paragraph, and it's under 25 words: "ends with
    a single short paragraph alone on its final page."
  - `emptyChapterOpenerChecker` (`major`) — a chapter has zero blocks across
    every one of its pages.
  - `consecutiveBlankPagesChecker` (`minor`) — two or more `kind === 'blank'`
    pages appear adjacently, which `paginate.ts` should never produce (it only
    ever inserts one blank page at a time, to force a recto chapter start) —
    a low-probability sanity check, not an expected common finding.
- `layout.ts`:
  - `inconsistentImageSizingChecker` (`suggestion`) — a chapter has 3+ images
    spread across more than 3 distinct effective-width buckets (rounded to
    the nearest 10, whether the unit is `widthMm` or `widthPercent` — reusing
    the exact same `widthMm`-over-`widthPercent` precedence rule already
    established in `src/blocks/types/image.tsx`/`exportPdf.ts`, not a new
    one).
  - `imageDensityImbalanceChecker` (`suggestion`) — book-wide, flags a
    chapter with zero images when the book averages 2+ per chapter, or more
    than double the book's own average.

**Every checker filters `page.kind !== 'structural'` first** (or groups
strictly by `page.chapterId`, which structural pages never carry) — see
`composePages.ts`'s `toLaidOutPage`, which deliberately gives every
front-/back-matter page `number: 0` and no chapter, per real print-book
convention. Getting this wrong would misread every Cover/Copyright/
Bibliography page as part of "the book's chapters." Page-numbering-uniqueness
was considered and deliberately **not** built as a checker for exactly this
reason — once structural pages are correctly excluded, `paginate.ts` numbers
every real content page exactly once, by construction; there was nothing left
to genuinely check. Likewise, **widow/orphan heading detection wasn't built
either** — not a gap, but because `paginate.ts`'s existing heading-orphan
guard already structurally prevents that bad state from ever being produced
in the first place, so there's nothing to detect after the fact.

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

## Style Guide (partially built — Phase 24)

`StyleGuide` (in `types.ts`) is a type — English variant, Oxford comma, quote
style, heading capitalisation, measurement units, date format — and `Checker.run`
accepts it as optional context (`CheckerContext.styleGuide`). As of Phase 24 the
full path is real, from settings UI down to two consulting checkers:

- **Settings UI**: `ProjectSettingsDialog.tsx` has a "Style Guide" section — six
  `Select` dropdowns, one per `StyleGuide` field. Each defaults to
  `DEFAULT_STYLE_GUIDE`'s value when `project.settings.styleGuide` is absent, and
  writes via `updateProjectSettings(project.id, { styleGuide: { ...current, [field]: value } })`
  — an object-level spread, since `updateProjectSettings` only shallow-merges
  `ProjectSettings` at the top level, not one level into `styleGuide`.
- **Persistence**: `ProjectSettings.styleGuide?: StyleGuide` (`src/types/project.ts`)
  is optional and never migrated — a project persisted before this field existed
  simply has no `styleGuide` key, and every read site falls back to
  `DEFAULT_STYLE_GUIDE` via `??`, exactly like `ImageBlock`'s optional fields in
  `src/types/content.ts`.
- **Wiring into the pipeline**: `VirtualEditorWorkspace.tsx`'s "Review Entire Book"
  button reads `project.settings.styleGuide ?? DEFAULT_STYLE_GUIDE` (it already has
  the `project` prop) and passes it into `virtualEditorStore.runReview(projectId,
  manuscript, styleGuide)`, a new optional third parameter that `runReview` simply
  forwards to `runPipeline` — `virtualEditorStore` never reaches into
  `projectStore`'s own state directly, keeping the layer boundary intact.
- **Checkers that actually consult it today** (exactly two — every other checker
  in the codebase still ignores `ctx.styleGuide` entirely, unchanged):
  1. `quoteStyleConsistencyChecker` (`checkers/proofreading.ts`) — when
     `styleGuide.quoteStyle` is `'curly'` or `'straight'`, it switches from "the
     book mixes styles" to flagging every span containing a quote/apostrophe that
     contradicts the explicit preference (`issueType:
     'quote-style-preference-violation'`, one finding per offending span, more
     actionable than the book-wide message). With `'no-preference'` or no
     `styleGuide` passed at all, it falls back to the original, unchanged
     book-wide-mixing behaviour.
  2. `headingCapitalisationChecker` (new, `checkers/copyEditing.ts`, category
     `copyEditing`) — only produces findings when `styleGuide.headingCapitalisation`
     is `'title-case'` or `'sentence-case'`; silent otherwise. Scans `heading`
     blocks with a documented, honest heuristic (see the file's doc comments for
     the exact rules and known false-positive cases — e.g. Sentence case has no
     proper-noun dictionary, so a genuine proper noun past the first word will
     false-positive). This is the first checker registered under `copyEditing`,
     so the dashboard's Grammar Score tile now shows a real number (100 with zero
     findings when no heading-capitalisation preference is set) instead of "Not
     yet analysed" — an honest consequence of the existing "a category with a
     registered checker but zero findings scores 100" scoring rule, not a
     fabricated score, but worth knowing since a 100 there no longer means
     "nothing in Grammar has ever been checked."
- **Still not enforced**: `englishVariant`, `oxfordComma`, `measurementUnits`
  (the existing `measurementUnitConsistencyChecker` in `consistency.ts` still
  ignores it — a project that's deliberately single-system still gets flagged for
  "mixing"), and `dateFormat`. AI Learning (§ above) also remains untouched by
  this phase.

## Editorial Dashboard (what's built)

A new workspace, reached via a **"Virtual Editor" toggle in the Toolbar**
(`src/layout/Toolbar.tsx`) — chosen over a new route because the three-column
`AppShell` never moves per `docs/UI_DESIGN_SYSTEM.md`; only the centre column's
contents change (exactly like Sidebar's Chapters/Assets tabs, or the Inspector's
tab set). `uiStore.workspaceMode` (`'manuscript' | 'virtualEditor'`) decides what
`Workspace.tsx` renders; `AppShell`, `Sidebar` and `Inspector` are untouched.

`VirtualEditorWorkspace.tsx` shows:
- All 11 named scores (`SCORE_TILES` in `scoring.ts`) — real numbers always
  for Proofreading, Consistency, Readability, Grammar (`copyEditing`) and
  Overall; real numbers for Publishing Quality and Layout whenever `pages`
  was available for that review run (see § Publishing Standards & Layout
  checkers); "Not yet analysed" for the remaining 4 (Typography,
  Accessibility, Print Readiness, Commercial Quality) and for Publishing
  Quality/Layout when `pages` wasn't available.
- A "Review Entire Book" button that runs the pipeline against the project's
  current manuscript and its current real pagination output (read from
  `useExportStore`, when present — see § Publishing Standards & Layout
  checkers). A small caption beneath the button, shown only when no layout
  has been published yet this session, explains that Publishing Quality and
  Layout checks need the manuscript view to have rendered at least once.
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
| 1 copy editing checker (heading capitalisation, Style-Guide-dependent) | **Real** (Phase 24), tested in `scripts/smoke-test.ts` — only fires when `styleGuide.headingCapitalisation` is set; silent otherwise |
| 3 publishing-standards checkers (sparse chapter endings, empty chapters, consecutive blank pages) | **Real** (Phase 25), tested in `scripts/smoke-test.ts` — need `CheckerContext.pages` (real pagination output); honestly `null` ("Not yet analysed") when the manuscript view hasn't rendered yet this session. No widow/orphan detection (already prevented by `paginate.ts`'s construction, not a gap), no page-numbering-uniqueness check (structural pages make it a non-finding once correctly excluded), no true whitespace/fill-ratio measurement (no per-block rendered height on `LaidOutPage`) |
| 2 layout checkers (inconsistent image sizing, image density imbalance) | **Real** (Phase 25), tested in `scripts/smoke-test.ts` — same `ctx.pages` dependency and honest-`null` behaviour as above. No visual-imbalance/image-placement/whitespace-hierarchy checks beyond image count and size |
| `CheckerContext.pages` + `Checker.isApplicable` | **Real** (Phase 25) — `pipeline.ts`'s `analysedCategories` only counts a category as analysed when a checker is actually applicable to the context run, not merely registered; defaults to "always applicable" so every pre-Phase-25 checker is unaffected |
| `AiReviewer` interface | **Real** (interface only — `NullAiReviewer` is the only implementation) |
| Score aggregation (category + overall) | **Real** |
| Editorial Dashboard UI, 11 score tiles | **Real** (6 of 11 always show a real number: Proofreading, Consistency, Readability, Grammar, Overall — plus Publishing Quality and Layout whenever `pages` was available for that review run; the remaining 4 — Typography, Accessibility, Print Readiness, Commercial Quality — always render "Not yet analysed," no checker exists for them yet) |
| Review Entire Book pipeline | **Real** (synchronous, deterministic-only) |
| Fix / Reject / Ignore / Ignore Similar / Edit | **Real** (Edit disabled only for book-wide findings with no single block to jump to) |
| Batch-apply ("Fix All" + per-category "Fix all in [Category]", replacing the original "Apply to Chapter"/"Apply to Book" placeholders — see Phase 13 in `docs/STATUS.md`) | **Real** |
| Non-destructive revision log + restore | **Real** (linear list, in-memory only) |
| Original/RevA/RevB/RevC side-by-side compare | **Designed, not built** |
| Developmental / field-guide / typography / accessibility / print / commercial checkers | **Designed, not built** |
| AI Learning / editorial profile | **Designed, not built** |
| Style Guide enforcement | **Partially real (Phase 24)** — settings UI + persistence + pipeline wiring are real; `quoteStyleConsistencyChecker` and `headingCapitalisationChecker` consult it; `englishVariant`/`oxfordComma`/`measurementUnits`/`dateFormat` and every other checker (including all 5 new Phase 25 checkers) still ignore it |
| Future AI modules (fact-check, indexing, glossary, etc.) | **Named as extension points, not stubbed individually** |

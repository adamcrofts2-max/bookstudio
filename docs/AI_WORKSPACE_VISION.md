# Book Studio — AI Publishing Workspace Vision

Captured from a product-design discussion on 2026-08-01. Not sequenced into
`ROADMAP.md` yet — this is the decision record for *what* to build and *why*, so a
future session can turn it into ticked-off phases without re-litigating the
architecture. Nothing in this document has been implemented.

## The idea

Book Studio does not need to become an AI writing application. Someone with a
finished manuscript should always be able to Import → Design → Export with nothing
slower or added in the way — that workflow is sacred and this feature must never
touch it.

But there is a second user: someone with an idea and no manuscript yet, who needs
help with planning, research, structure, characters, world-building, and keeping a
large project consistent. For that user, Book Studio should become an **AI
Publishing Workspace** — the structured project, memory, and prompt layer that sits
in front of whichever AI model the author already uses (Claude, ChatGPT, or
otherwise), rather than a third AI writer competing with both.

This is consistent with `VISION.md`: Book Studio should never compete on having the
best model. It competes on structure, workflow, and output quality — things far
harder to copy than a chatbot.

## Why not embed AI as the writer

- `VISION.md` is explicit that the product should never feel like "an AI
  application." A built-in drafting AI drags the product into a fight (model
  quality, inference cost, safety review, hallucination liability) that has nothing
  to do with the actual moat.
- Authors already pay for Claude or ChatGPT. Requiring a second AI subscription is
  friction with no upside, and forces a stance on whose model is "best," which is a
  fight Book Studio doesn't need to have.
- There is currently no backend, no accounts, and no billing (`ROADMAP.md` Phase G
  and Phase H are both entirely unchecked). A workspace that needs zero new
  infrastructure to validate is the correct shape for where the codebase is today.

## Why the copy/paste prompt mechanism is a V1, not the destination

Manually tabbing to another app, pasting a prompt, waiting, copying the response
back, and re-filing it into the right place violates principles already written
down elsewhere in this repo: "every action should feel immediate," "changes update
instantly," and `VISION.md`'s "the user should not need multiple applications." It
also undermines the feature's own goal — if a human is the sync mechanism between
the project bible and the AI's output, the bible drifts exactly the way a
human-maintained wiki drifts, which is the problem this feature exists to solve.

**Decision:** build the copy/paste flow first (it needs no backend, no billing, no
API cost), but implement it behind a `Provider` interface from day one —
`ClipboardProvider` now, `ApiKeyProvider` later (direct call, streamed diff, once
there's a story for cost/accounts). Same interface, swappable implementation. This
matches the "AI Provider" plugin slot already named in
`ARCHITECTURE_PRINCIPLES.md` and "no architectural decision in V1 should preclude
future expansion."

## Where this sits in the architecture

This is not Layer 2 (Content) and must not be bolted onto the layout editor — the
Import → Design → Export workflow must never get slower. It's a new, optional
upstream layer — **Layer 0, Planning** — living in its own mode/tab, invisible to a
pure-manuscript user. Its job is to *produce* Content, not replace it: when a user
pastes back a generated chapter, it should be handed to the existing
`src/parser/` import pipeline rather than a second ingestion path (evolve rather
than rebuild).

### Reject the folder-of-files model

A rigid folder tree (Characters/ Locations/ Timeline/ Glossary/...) is really an
unstructured filesystem standing in for a database — and `ARCHITECTURE_PRINCIPLES.md`
already rejects that framing for the rest of the product ("books are structured
collections of reusable content," not documents).

**Decision:** model Layer 0 as a small set of typed entities, the same way Content
already is:

- Character
- Location
- Timeline Event
- Glossary Term
- Reference / Citation
- Illustration Brief
- Style Rule
- Research Note

A genre template just turns subsets on/off and relabels them (a children's book
gets Reading Level and Rhyme Scheme; a field guide gets Species instead of
Character). Markdown/text prompt bundles are a generated *export view*, not the
source of truth. This also means the data can eventually feed the Layout Engine
directly — e.g. a "Species Profile" structural page rendered straight from the
database.

## The actual hard problem: context curation, not storage

500-page books and casts of hundreds mean a "master prompt" containing the whole
bible stops fitting in any context window well before the book is finished. The
differentiator isn't the folders — it's automatically assembling the
minimum-correct context bundle for a given task (for "write Chapter 7," pull only
the characters/locations that appear in it, the relevant timeline slice, the style
guide, and the previous chapter's tail). This requires auto-tagging which entities
appear in which chapter. Treat smart context assembly as the headline feature of
this initiative, not a detail underneath it.

## Bible sync must be a reviewable diff, never automatic

Free-text extraction of an AI response back into structured fields is unsolved and
error-prone. This project has already made the correct call on the identical
tradeoff once: `AiReviewer` (`src/virtualEditor/aiReviewer.ts`) is deliberately a
stubbed no-op pending a decision on hosted-backend-vs-bring-your-own-key
(`ROADMAP.md` Phase C). Bible auto-sync has the same dependency and should be
sequenced behind that same decision, not ahead of it.

**Decision:** V1 sync is user pastes the AI's response → Book Studio suggests field
updates as a reviewable diff → nothing commits without approval. This reuses the
Accept/Reject/Ignore + revision-log pattern already shipped for the Virtual Editor
rather than inventing a new interaction.

## What to cut from the original sketch

- The deep nested folder taxonomy as user-facing UI — it over-specifies structure
  before the entity model is validated, and different genres need different shapes
  than a fixed tree allows.
- Direct AI API integration as a V1 goal — genuinely useful, but Phase-later, after
  there's a story for cost and accounts.

## What to add

- **Continuity checking.** Once the bible exists, the real delight feature is
  ambient consistency checking against it — "Elena's eye colour here doesn't match
  her character sheet," "this scene happens before the timeline says the bridge was
  built" — surfaced without the user asking. This is a natural extension of the
  Virtual Editor's existing checker architecture (Style/Typography/Accessibility/
  Developmental checkers, `ROADMAP.md` Phase C): a "Continuity" checker applying
  the same pattern to Layer 0 data instead of Layer 2 typography rules.
- **Submission package generation.** Once the bible is populated, a one-command
  synopsis / comp titles / query letter / KDP metadata generator ties Layer 0
  straight into the already-roadmapped but empty Phase I (Marketing Toolkit).

## Summary

Ship the copy/paste prompt generator as Layer 0, backed by a structured entity
store instead of files, behind a Provider abstraction so it can grow into direct
API calls later, reusing the existing parser and Accept/Reject-diff patterns
instead of new ones. Prompt generation is the easy part. The product is deciding
what's relevant to include in each prompt as the bible grows, and quietly checking
the AI's output against that bible afterward.

## Open questions for a future session

- Exact entity schema per genre template (fiction vs. non-fiction vs. children's vs.
  technical) — needs its own design pass before implementation.
- ~~Where Layer 0 lives in the app shell~~ — **decided 2026-08-01 with the
  user: a new top-level mode/tab**, not a sidebar section or a separate
  project type. Still needs a UI Design System pass against
  `UI_DESIGN_SYSTEM.md` for the actual visual/navigation treatment, but the
  shape of the decision is settled.
- ~~Whether Layer 0 should be sequenced into `ROADMAP.md` Phase F now~~ —
  **decided 2026-08-01: yes, now.** The user's build order is Phase E (finish)
  → Phase F → Phase D → Phase B, with Phase C staying gated behind a real AI
  backend decision. Layer 0's schema/store, the wizard, outlining templates,
  word-count goals, and distraction-free mode are all being built without any
  API — only `ApiKeyProvider` waits for Phase G/H.

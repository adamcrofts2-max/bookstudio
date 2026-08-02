# Book Studio Vision

## Mission

Book Studio exists to become the easiest way in the world to create, design, publish
and market professional-quality books.

The goal is not to build another AI writing application. The goal is to become the
**Canva for book publishing.**

Users should feel like they are using beautiful publishing software rather than an AI
application. AI should work quietly in the background to remove complexity and
automate repetitive work. The experience should always feel professional, elegant and
effortless.

## Product Vision

Creating a beautiful book should feel as easy as creating a presentation in Canva.
Users should never feel overwhelmed by publishing terminology or complicated
workflows. Book Studio should guide users naturally from idea to finished
publication. The complete publishing journey should happen inside one application:

Idea → Planning → Writing → Design → Editing → Review → Publishing → Marketing

The user should not need multiple applications.

## The Competitive Advantage

Book Studio should never compete on having the best AI model. AI models will
continue improving and become available to everyone. Instead, Book Studio should
compete on: exceptional user experience, beautiful interface design, outstanding
workflows, professional publishing output, intelligent automation, structured
content, speed, reliability, and simplicity.

These are far harder to copy than AI itself.

## Philosophy

People should recommend Book Studio because "it makes creating beautiful books
unbelievably easy" — not because "it uses AI." AI is a tool. The experience is the
product.

## Success Criteria

When someone opens Book Studio they should immediately think: "This is beautiful."

Within minutes they should think: "I can't believe creating a book is this easy."

When they publish they should think: "This looks like a professionally published
book."

That emotional experience should guide every future decision.

---

## Long-Term Platform Vision (10–20 years)

*Added 2026-08-02, after the Planning/Develop redesign work below and a direct request
to define where the whole platform is going before any more features get built. This
section extends the Mission above — it doesn't replace it. Everything here should be
read through the same lens: does this still make Book Studio the easiest, most
beautiful way to make a book, or does it quietly turn Book Studio into something else.*

**First principle.** Book Studio is not trying to become another AI writer. AI models
(Claude, GPT, Gemini, and whatever comes after) will keep improving on their own
timeline, one Book Studio has no control over and shouldn't try to race. Competing on
model quality is not a sustainable strategy — see "The Competitive Advantage" above,
which already says this independently.

Instead, Book Studio should become **the place where a book lives** — not just its
manuscript, but its knowledge, structure, ideas, relationships, illustrations,
research, design and publishing information. The permanent memory of a book. AI is one
tool that works *from* that memory; it is not the memory itself.

**The future scenario.** An author building a book with AI assistance shouldn't write
an enormous one-off prompt. They build the book inside Book Studio — characters,
relationships, places, timeline, themes, writing style, illustration style, research,
references, story structure, world-building, book goals, target audience, publishing
requirements — and when they ask AI to draft Chapter 12, the AI works from the whole
project, not a blank page. The project becomes the context.

**The important separation.** Most AI writing tools generate text. Book Studio should
*understand books*. The software owns structure; the AI owns generation. If a better
model appears in five years, an author's project is untouched — only the creative
engine changes underneath it.

**Today's priority is unchanged by any of this.** The priority right now is not
building AI — it's building a great publishing application: simple, professional,
beautiful, easy to use, the easiest way to go from idea to a professionally published
book. That must never be compromised. Someone who arrives with a finished manuscript
must still be able to import it, design it, and publish it without ever touching a
Develop-workspace feature.

**Develop is optional, always.** A workspace where authors gradually build the
knowledge of their book — ideas, characters, places, research, illustrations,
relationships, story structure, glossary, notes. It exists to help authors who want
it. It must never make the core publishing workflow more complicated for authors who
don't.

**Three rules every feature must satisfy:**
1. It should help an author create a better book.
2. It should not increase the complexity of the core publishing workflow.
3. It should continue making sense even if AI becomes dramatically more capable.

**Final principle.** Book Studio should not become the software that writes books. It
should become the software that helps people create better books — whether they write
every word themselves, collaborate with AI, or use a mix of both. If AI becomes
capable of writing entire books, Book Studio should still be indispensable, because
it's where the book's identity, structure, knowledge, design and publishing workflow
live. That's a stronger long-term position than competing on generation quality alone,
because it stays valuable exactly as AI models evolve, rather than being made obsolete
by the next one.

### Open risks and assumptions — recorded, not resolved

*In the spirit of `IDEA_SYSTEM_PLAN.md`'s Revisions section: logging disagreement and
open questions honestly rather than presenting the vision as settled. Re-read this list
before any major Develop-workspace decision.*

- **Adoption mismatch.** The authors most willing to build out a rich project model
  (characters, relationships, timeline, research) tend to already know their book
  intimately and are often the *least* likely to want AI writing their prose. The
  authors most eager for "just write Chapter 12 for me" are the least likely to have
  populated Develop first. The vision needs to be honest about which job Develop is
  actually doing — feeding AI, or helping an author think — because those aren't the
  same product, even though they share a data model.
- **"The project becomes the prompt" overstates what a schema can hold.** Structured
  fields (a Character's role, a Location's description) capture facts, not voice,
  subtext, or the specific tension of a scene — the things that make generated prose
  good. The highest-signal input for "write like this" is the manuscript's own prose,
  which is unstructured by nature. Layer 0 today is genuinely strong as a *consistency*
  layer (continuity-checking, glossary enforcement, fact-tracking, per
  `checkers/continuity.ts`) — treating it as a generation-context replacement rather
  than an augmentation risks a claim the schema can't back up.
- **The "structure it for AI" framing is exposed to the exact trend it's hedging
  against.** As context windows keep growing, a hand-built schema summarizing a
  manuscript for a token-limited model becomes less necessary precisely as models
  improve — the opposite of durable. The more defensible framing: the structure's
  primary customer is the *author*, for navigating and understanding their own book.
  Feeding AI well becomes a free byproduct of data that already had to exist for the
  human's sake, not the reason the data exists.
- **Complexity is the real execution risk, and the three rules don't prevent it by
  existing.** Relationships, timeline, worldbuilding, and research are each small
  products in their own right (a graph editor, a citation manager, a mood board).
  Scrivener's binder/corkboard/keyword system is the most-cited reason it feels
  intimidating to new users, despite being powerful — the same failure mode is live
  here unless every Develop addition is cut as ruthlessly as it's added.
- **An explicit bet, not a given:** that authorship — a human's ownership of decisions
  about their own book — stays something people want for its own sake even once
  generation quality stops being the bottleneck. Reasonable (photographers still
  edit and curate long after phones got AI-perfect cameras), but it's a bet on human
  motivation, not a technical inevitability, and should be tracked as one.
- **Missing opportunity: provenance.** As AI-assisted books spread, tracking what's
  human-written vs. AI-assisted vs. AI-generated, per paragraph, is becoming a real
  publishing-compliance question (KDP already requires AI-content disclosure). This
  grows naturally out of the existing revision-history/undo architecture already in
  this codebase — worth designing in on purpose rather than bolting on once required.
- **Unaddressed scope: solo authorship is assumed throughout.** Nothing here plans for
  a co-author, ghostwriter, or publisher-side editor sharing one project (permissions,
  roles, review). Not a case for building it now — but worth deciding on purpose that
  it's deferred, since a schema built assuming one author is a real migration cost
  later if that assumption turns out wrong.

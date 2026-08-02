# Rethinking Planning — a first-principles review

*A design critique, not a spec. No code was written for this. Nothing here is
committed to the roadmap until you decide it should be.*

## Short version

You're right, and I'd go further than you did.

The mistake isn't just that Planning presents data structures instead of people.
It's that Planning asks the author to *decide the shape of their book's supporting
material before they've written anything worth supporting*. A Characters tab with an
"Add Character" button is a form asking "who is your protagonist, structurally
speaking" to someone whose honest answer is "I don't know yet, that's what I'm trying
to find out by writing." The database isn't wrong to exist eventually. It's wrong to
be the front door.

The fix isn't reorganizing the eight categories, renaming the tab, or writing better
empty-state copy — I already suggested those, and they're band-aids. The fix is
inverting who initiates structure: right now the *software* asks the author to
populate categories; it should be the *author's own writing* that produces the
categories, with the software noticing and offering to help organize what's already
there.

## Where I'd push back on you, specifically

You asked me not to just agree, so here's the disagreement:

**Don't delete structure. Defer it.** "People don't think in Characters, Locations,
Timelines" is true of the first ten minutes. It stops being true by chapter five. A
working novelist absolutely ends up with something that functions like a character
sheet and a location list — professionally, it's called a story bible, and it's not
an artificial database concept, it's a real thing serious authors build for
themselves once a story gets too big to hold in their head. The mistake isn't that
Book Studio has this concept. It's that Book Studio hands it to someone in minute one,
before they need it, in the least inviting possible form (a blank list with an Add
button). Kill the day-one form. Keep the eventual structure — it's one of this
product's real strengths and the reason a "story bible" export or continuity checker
can exist at all. A tool that only ever captured loose notes and never organized them
would be a worse product than what you have now, just worse in a different direction.

**"Planning happens continuously" is the important sentence in your whole brief, and
I don't think it goes far enough.** If planning is continuous, it shouldn't be a
*place* at all — not even a nicely-renamed one. Right now "Planning" and "Virtual
Editor" are two rooms with a door between them (a toolbar toggle). Every time an
author has a stray thought about a character while writing, they have to consciously
decide "this is a Planning thought," walk out of the room they're writing in, into a
different room, find the right database table, fill in a form, and walk back. That
round trip is the actual friction, more than any naming or ordering issue. The
strongest version of your idea isn't "rename Planning to Notebook." It's "delete the
second room." Notes should be reachable as a drawer that opens *beside* the page
you're writing, not a destination you navigate to.

**Fiction and non-fiction don't need separate templates if you get the primitive
right.** The current design picks, per genre, which of eight entity kinds to seed
(`novel` gets Characters/Locations/Style Rules, `nonfiction` gets
References/Research Notes/Glossary). That's solving the wrong problem. It's guessing
in advance what a specific book will need instead of just watching what the author
actually writes and creates categories from that. A biography has characters. A novel
sometimes has a glossary (invented terminology, secondary-world fiction). Genre-based
pre-seeding is a reasonable patch on top of a form-first model; it stops being
necessary at all once structure is derived from captured material instead of chosen
from a genre dropdown. This is also the strongest argument for why database-first
Planning was the wrong abstraction, not just the wrong presentation: it required the
software to guess your book's shape before you'd written a sentence of it.

## The reframe: capture first, structure follows

Everything in the redesign flows from one mechanic: a single, always-available,
zero-decision way to jot something down — an idea, a name, a fact, a link, a
half-formed sentence — with no required category, no form fields, nothing to get
right. Call it a scratch note. It has exactly one required field: the text itself.
Everything else (is this a character? a research fact? a plot beat?) is optional
metadata the author can add *later, if they want to*, never a gate on capturing the
thought in the first place.

Structure — the Character record, the Location record, the Glossary entry — is what
a scratch note becomes when an author (or the software, gently suggesting) decides
it's worth tracking properly. The software can help this happen without ever calling
itself "AI": simple recurrence detection (the same proper noun showing up six times
across a manuscript — the same mechanic the continuity checker already uses to spot
mentioned names, just pointed at "notice," not "verify") is enough to surface "you've
mentioned Wren a lot — want a place to keep track of her?" That single sentence,
offered at the right moment, does more onboarding work than any empty state or
tooltip, because it's responding to something the author actually did, not asking
them to imagine a need in the abstract.

This also directly answers your "no AI required" constraint. Nothing above needs a
language model. Recurrence counting, proper-noun detection, and a friendly prompt are
plain heuristics — the exact kind of "cheap, predictable, no NLP" approach this
codebase already uses for mention detection elsewhere. If an author later plugs in
Claude or ChatGPT, it can make the *suggestions* smarter (a real read of "this seems
like a location, not a person"), but the mechanic works today, for free, without any
model in the loop.

## Is "Planning" the right word? No — but the deeper fix is making the question moot

If Planning survives as a named destination at all, "Workspace" and "Studio" are too
generic (they could mean anything in any SaaS product) and "Ideas" undersells the
part of the product that's genuinely structured and valuable once a project matures.
Of the options you listed, none feel right to me for a different reason: they're all
still naming *a room*, and the room is the problem.

My honest recommendation: don't name a second room. Design toward not needing one.
The scratch-note drawer that's always half-open beside the page doesn't need a
proud top-level name any more than a notebook's margin needs a name — it's just
*there*. If you do want one word for it when it's referenced in menus or help text,
"Notebook" is the one I'd pick: everyone already knows what a notebook is for
(loose, informal, always at hand, not a form you fill out correctly), it doesn't
sound like software, and — usefully — a notebook is a thing people expect to
eventually get *tabs and dividers* once it fills up, which is exactly how structure
should arrive: added by the author, once there's enough material to organize, not
imposed as a schema on day one.

## The journey, in detail

**Discovery and the first minute.** No "New Project" dialog asking for a title and a
category before anything else exists — that's a form, and forms are exactly what
we're trying to avoid at the moment of lowest commitment. Instead: one big, calm text
field. Placeholder text: something like "What's the idea?" They type a sentence — not
a title, an idea. "A lighthouse keeper's daughter finds letters from a shipwreck." One
button: something that means *start*, not *create project*. The software quietly
creates the project behind the scenes, names it "Untitled" or takes a guess from
their first words, and — critically — drops them straight onto a blank page with a
cursor, not into a dashboard. The very next thing they do is write, because writing
is what they came to do, and every screen between "I have an idea" and "I'm writing"
is a screen where they might decide this isn't for them.

**The first ten minutes.** They're writing. A slim, unobtrusive rail sits at the edge
of the page — not a tab, not a mode, just always there, the way a notebook margin is
always there. A single low-effort control lets them drop a scratch note without
losing their place: a stray thought ("her mother should die in chapter 3"), a name
they just invented, a link they want to remember to read later. No dropdown asks them
to classify it. It's just captured, timestamped, and — if they were mid-sentence —
quietly associated with roughly where they were in the manuscript, the same way a
Post-it stuck in the margin of a physical notebook is associated with the page it's
stuck to.

**Collecting research.** Same mechanic, no separate "References" form to learn.
Pasting a link or typing "found a good source on lighthouse mechanics: [link]" is
just another scratch note. It doesn't need to become a structured Reference record
unless and until the author wants it to — for most people, most of the time, a
loose list of "things I found" is genuinely sufficient, and forcing early structure
on it (title field, notes field, a modal to fill in) is friction with no payoff yet.

**Writing two chapters, then reorganizing.** This is where a corkboard-style spatial
view earns its place — proven territory (this is, more or less, how Scrivener's
binder-plus-corkboard has worked for two decades, because it maps onto how writers
actually think about restructuring: physically moving cards around, not editing a
form field that says "order: 3"). Chapters and scenes become cards an author can drag
into a new sequence by hand, the same motion as rearranging index cards on a real
corkboard. The current up/down-arrow-button reordering (used for chapters and
timeline events alike) is a database operation wearing a UI. A spatial view is a
thinking tool. "They reorganise ideas" in your own journey description is a strong
hint that this should feel physical, not administrative.

**Remembering another character, mid-flow.** Same scratch-note rail as before — no
special "I am now doing Planning" mode-switch required. By this point, though, the
software has probably already noticed "Wren" recurring and quietly offered to track
her — so this scratch note might land directly as an addition to an existing
character's notes instead of a new floating scrap, because structure has already
started to emerge from what they've written, not from what they configured.

**Illustrations.** Same principle: an illustration brief starts life as a scratch
note ("need art of the lighthouse at dusk, chapter 2") the moment the thought occurs,
not as a trip to a separate Illustration Briefs database. It becomes a proper brief
— with whatever fields a professional illustration brief actually needs — only when
the author is ready to commission or create the art, which for most projects is much
later than when the idea first occurred to them.

**Eventually, publishing.** This is where the tone should change on purpose — and
where I think the current product is actually *underselling* its own strength by
surfacing this machinery too early. Print readiness, trim size, bleed, ISBN
validation, EPUB export: none of this belongs anywhere near someone who just wrote
their first paragraph. It's genuinely sophisticated, professional-grade tooling, and
it should feel like *arriving* somewhere — the moment the author has a real
manuscript and is ready to think like a publisher, not a moment they stumble into by
opening the wrong tab. Gating this behind actual manuscript maturity (real chapters,
real word count — not a settings toggle they have to know exists) turns "oh, there's
a whole publishing suite here too" into a delightful discovery instead of a wall of
unfamiliar vocabulary on day one.

## How advanced tools should appear without overwhelming anyone

Tie visibility to project maturity signals the software can already see — word
count, chapter count, number of scratch notes accumulated, explicit ask — not to a
menu the author has to know to explore. Roughly:

A brand-new project shows almost nothing beyond the page and the scratch-note rail.
Once there's real material (a genuinely fuzzy line, but something like: a few
chapters, or a dozen scratch notes, or the author explicitly clicks something like
"help me organize this"), the Notebook's structured side — the character list, the
location list, the glossary — becomes visible, populated from what's already been
captured rather than starting empty. Outline templates surface here too, offered as
"want a shape for the rest of this?" rather than a thing you're supposed to pick
before writing a word. Publishing tools stay invisible until there's something
publishable — a full first draft, or an explicit "I'm ready to prepare this for
print/EPUB" moment.

This is progressive disclosure driven by *what the author has done*, which is a much
better trigger than time, settings, or a tutorial they can skip past and never see
again.

## The psychology, answered directly

**What excites them:** the chance to finally get an idea out of their head and see it
become something real. That excitement is highest in the first sixty seconds and
decays fast if the software makes them do anything other than write.

**What scares them:** not knowing how to structure a book (so don't ask them to,
early); the fear that this is "software for professionals" and they don't belong yet
(so professional-grade tools should reveal themselves as a reward for progress, not
a wall on arrival); the blank page itself (so the very first screen should remove
every obstacle between "I have an idea" and "I am writing," not add a title field and
a category dropdown in front of it).

**What closes the software:** any screen, in the first few minutes, that asks for a
decision the author doesn't yet have the information to make. A category picker
before they've written a sentence. A database table with an Add button and no
indication of what "adding" gets them. Anything that looks like a spreadsheet when
they came to write a story. The instinctive reaction to "this looks complicated" is
to close the tab, not to push through — so the first five minutes matter more than
almost anything else in the product.

## What this would mean for what already exists

Not a rebuild, and not a rejection of the underlying data model — Layer 0's
Character/Location/Timeline/Glossary/Reference/IllustrationBrief/StyleRule/
ResearchNote types are still the right eventual shapes for this information, and the
publishing-grade machinery built on top of them (continuity checking, prompt
generation, story-bible export) is real, working value that shouldn't be thrown out.
What changes is the *front door*: those eight structured tables become a view you
grow into, populated by promoting scratch notes (by hand or by the software's own
gentle noticing), not a form you're handed on day one. The existing publishing
pipeline — themes, cover design, PDF/EPUB export, ISBN validation — doesn't change
at all; it just waits for its moment instead of sharing a toolbar with "write your
first paragraph."

## Where I'd want to go next

This is a genuinely different information architecture, not a copy change, so I'd
treat it as its own design pass rather than something to patch into the existing
Planning shell incrementally. If this direction feels right to you, the next useful
step (still no code) would be a rough map of the new screens themselves — what the
blank first-open screen actually looks like, what the scratch-note rail looks like
sitting next to the page, what the "structure has emerged, want to organize it"
moment looks like the first time it fires — so you can react to the shape of it
before anything gets built. Say the word and I'll put that together.

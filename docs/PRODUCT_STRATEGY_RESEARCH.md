# Product Strategy Research — Reverse-Engineering the Book Software Market

**Date:** 2026-08-02
**Purpose:** Requested directly by the user, independent of any single feature or phase — a market-research and product-strategy pass to inform where Book Studio goes next. Not a feature list. Sources cited inline; see the Sources section at the end.

---

## How to read this document

Every section below answers a question the user asked, in the order they asked it. The short version, if you only read one paragraph: authors today assemble a book by stitching together three to five tools that don't talk to each other — a planning tool (Notion, Obsidian, Milanote, or a dedicated "story bible" like Campfire/World Anvil), a drafting tool (Scrivener, Google Docs, Ulysses, Dabble), a formatting tool (Vellum, Atticus, InDesign, Affinity Publisher), and increasingly an AI tool bolted on top (Sudowrite, NovelCrafter). Nobody has unified all four into one data model. That gap — not any single feature — is Book Studio's actual opportunity, and it's already half-built: Layer 0 (the story bible), the Book Graph, and print/EPUB export already live in one project file in this codebase today. The rest of this document is the reasoning behind that claim, and an honest look at where it could be wrong.

---

## Part 1: What the research actually shows, product by product

Individual reviews are noisy; the same complaint or praise repeats across a dozen sources for a reason. Grouped by category, with the pattern each product line teaches rather than a spec sheet.

### Writing tools (Scrivener, Ulysses, Dabble, LivingWriter, Novlr, Reedsy Studio)

**Scrivener** is the incumbent everyone measures against, and the research is consistent: people love it for the same reason they're afraid of it. It lets a writer break a manuscript into scenes, chapters, character notes, and research inside one file, and "keep everything in one place" is the single most repeated praise across Capterra, G2, and author blogs. The cost is a genuinely steep learning curve — reviewers describe features that go unused for years because nobody found them, and the interface predates most modern UI conventions. Scrivener is also *not* a formatting tool: it exports serviceable but not beautiful books, which is why nearly every Scrivener household also owns Vellum or Atticus. That pairing — draft in Scrivener, format somewhere else — is itself the clearest evidence of the fragmented-stack problem. [Wikipedia](https://en.wikipedia.org/wiki/Scrivener_(software)) · [Capterra](https://www.capterra.com/p/180597/Scrivener/reviews/?page=3) · [G2](https://www.g2.com/products/Scrivener/reviews)

**Ulysses** is the cautionary tale on business model. It's an excellent, "frictionless" writing tool (PCMag Editors' Choice), but its 2017 switch from one-time purchase to subscription is still relitigated in reviews nine years later. The specific complaint pattern — "I paid $45 once, now it's $40/year forever," read-only mode if you stop paying, and reported sync/data-loss incidents that "erode trust" in a single afternoon — is the exact failure mode any subscription writing tool has to design around. Writers don't mind paying; they mind the feeling that their own manuscript is hostage to a recurring charge. [TechCrunch](https://techcrunch.com/2017/08/11/popular-writing-app-ulysses-switches-to-subscription-model/) · [QuillSpace](https://quillspace.app/blog/ulysses-app-review)

**Dabble, LivingWriter, and Novlr** are the current generation of cloud-native, subscription drafting tools, and the research shows all three converging on the same strengths and the same wound. Strengths: genuinely good plotting/outlining UI, "write anywhere" cloud sync, distraction-free composition. The wound, repeated almost word-for-word across all three: none of them format or export a real print-ready book. Dabble reviewers note "the lack of EPUB/PDF export means you need another tool for publishing." Novlr can export an ebook but "print-friendly formatting is not yet available." LivingWriter's Trustpilot page has multiple reports of lost paragraphs and an unresponsive support team — a serious trust problem for a tool that's supposed to be where your manuscript lives. [Kindlepreneur — Dabble](https://kindlepreneur.com/dabble-writer/) · [Reedsy — Novlr](https://reedsy.com/blog/guide/book-writing-software/novlr/) · [Trustpilot — LivingWriter](https://www.trustpilot.com/review/livingwriter.com)

**Reedsy Studio** is the free, well-liked exception — clean, cloud, has planning "boards" for characters/locations/research, and real-time collaboration. But its own users describe it as "very limited beyond manuscript writing" — it's the tool you graduate *out of* once your book gets ambitious, not the one power users stay on for book two. [G2 — Reedsy Studio](https://www.g2.com/products/reedsy-studio/reviews)

**The pattern:** every writing-only tool eventually forces a second purchase for formatting, and every subscription tool eventually triggers a "why am I still paying for this" moment. Nobody in this category has closed that loop.

### Formatting/layout tools (Vellum, Atticus, Pressbooks, InDesign, Affinity Publisher)

**Vellum** used to be the undisputed standard for making a self-published book look genuinely professional with zero design skill — the two-page image spread and overall output quality are still cited as best-in-class. But it's Mac-only and expensive ($199.99–$249.99), and the 2026 research shows real market movement away from it specifically *because* of that platform lock and price, not because the output quality dropped. [Kindlepreneur — Vellum](https://kindlepreneur.com/vellum-software-review/)

**Atticus** is the direct beneficiary — cross-platform (Windows/Mac/Linux/Chromebook), one-time fee, cheaper than Vellum, and as of a May 2026 Reddit poll roughly 70% of r/selfpublish respondents recommend it over Vellum for anyone starting fresh. Atticus's own positioning — "Scrivener's organization plus Vellum's output, in one app, one price" — is itself evidence that authors want the writing-to-formatting gap closed, and will switch tools the moment someone closes it even partway. Book Studio's actual opportunity is that Atticus still doesn't do planning/story-bible work at all — it starts from a manuscript, same blind spot as Vellum. [Creativindie](https://www.creativindie.com/atticus-book-formatting-tool-better-than-scrivener-vellum/) · [Kindlepreneur — Atticus vs Vellum](https://www.goodreads.com/author_blog_posts/23845346-formatting-software-atticus-vs-vellum-a-side-by-side-comparison-by)

**Pressbooks** is the clearest "why do people leave" case study in the whole research set. Complaints center on paywalled exports (pay to remove an ad Pressbooks inserts into *your own book*, then pay again per book to unlock print-ready PDF), broken export reliability even after paying, and users who "lost hours trying to recover their content." This is a business-model trust failure, not a features gap — worth remembering as a hard boundary for Book Studio: never gate a user's own finished export behind a second paywall after they've already paid to use the tool. [Medium — Pressbooks review](https://jerryholliday.medium.com/pressbooks-review-5050575f00c4) · [Trustpilot — Pressbooks](https://www.trustpilot.com/review/pressbooks.com)

**InDesign and Affinity Publisher** represent the professional-design tier — full typographic and layout control, the tools an actual book designer would use. The research is clear on why self-publishers increasingly choose Affinity Publisher over InDesign specifically: a one-time $49.99 purchase versus Adobe's subscription, combined with integrated raster/vector tools so a cover or illustration never has to leave the app. The trade-off both tools share, and the reason neither is a threat to Book Studio despite being more powerful: they assume you already know desktop publishing. Neither has any concept of "chapter," "manuscript," or "character" — you're building a book the same way you'd build a magazine ad. [TechRadar — Affinity Publisher](https://www.techradar.com/reviews/affinity-publisher)

**The pattern:** the closer a tool gets to genuinely professional output, the further it gets from being usable by someone who's never designed a book before. Nothing in this category understands what a "chapter" or a "character" *is* — it just typesets whatever text arrives.

### Creative-thinking and story-bible tools (Notion, Obsidian, Milanote, Apple Notes, Campfire, World Anvil)

This category is the most revealing, because it's where authors go to do the work Scrivener, Vellum, and Atticus all skip entirely: **keeping the story consistent.** The research surfaced two distinct sub-patterns.

General-purpose tools (Notion, Obsidian, Apple Notes) get repurposed by writers because nothing purpose-built existed that they trusted. Obsidian's appeal is specifically its *local*, plain-text, graph-linked structure — writers explicitly value that their character/location notes aren't trapped in a cloud database, and its graph view is called out as ideal for tracking how characters and lore connect. Notion's appeal is the opposite: structured databases, timelines, and beat sheets, plus real collaboration. The fact that some writers run *both at once* — Notion for structure, Obsidian for messy linking — is a direct symptom of no single tool doing both well. Milanote adds a third flavor: a freeform visual moodboard/canvas people specifically praise for *not* forcing pre-built templates on them. [Quill & Steel](https://www.quillandsteel.com/blogs/writing-tips/notion-vs-obsidian-worldbuilding) · [Milanote](https://milanote.com/guide/worldbuilding)

Purpose-built story-bible tools (Campfire, World Anvil) are the closest thing that exists today to what Book Studio's Layer 0 + Book Graph already is. Campfire is explicitly positioned for novelists (not RPG hobbyists) and its headline feature — "continuity notes to reduce inconsistencies," scene-level structure that stays linked to plot beats — is *the same problem* Book Studio's Continuity Checker already solves, built by a company that made it their whole product. World Anvil goes deeper into wiki-style relational linking between characters, places, and timelines — structurally very close to what the new relationship-graph feature in Book Graph does. Neither one, notably, does manuscript layout or print/EPUB export at a professional level — they're planning tools with a writing mode bolted on, the mirror image of Scrivener being a writing tool with no planning depth. [Kindlepreneur — Campfire](https://kindlepreneur.com/campfire-write-review/) · [Kindlepreneur — Campfire vs World Anvil](https://kindlepreneur.com/campfire-vs-world-anvil/)

**The pattern, and the actual finding of this whole research pass:** planning tools don't format books. Formatting tools don't plan books. Story-bible tools do neither. Every single product researched picks one of "plan," "write," or "format/publish" and stops. Nobody has built a single data model that is the story bible *and* the manuscript *and* the layout engine, where changing a character's name updates it everywhere and changing a theme never touches the words. That is, concretely, what `Layer 0` → `Content` → `Theme/Layout` → `PDF/EPUB Export` already is in this codebase's own architecture (`docs/SYSTEM_ARCHITECTURE.md`). The market research didn't just fail to find a competitor doing this — it found five different categories of tool, each explicitly built by people who ran into the wall of "we could go further, but that's a different product" and stopped.

### AI book-creation tools (Sudowrite, Squibler, NovelCrafter, Laterpress, and others)

2026 coverage shows this category actively differentiating on exactly the question the user asked — not "who writes the best prose" but "where does AI sit relative to the author." Sudowrite leads on raw prose quality (its Muse model is reportedly preferred over general-purpose models in blind fiction tests) and is positioned as a prose *collaborator*. NovelCrafter's differentiator is its "codex" — a system that keeps worldbuilding consistent across a long manuscript, which is a narrower, single-purpose version of what Layer 0 + the Continuity Checker already do together. Laterpress is the most philosophically aligned with Adam's own framing: "story structure lives inside the writing environment" rather than the AI owning the structure — the tool holds the project, AI works from it. The consistent, repeated framing across this whole category in 2026 coverage is "these tools don't replace authors, they cut repetitive work" — which is worth taking seriously as the market's own emerging consensus, not just Adam's personal preference. [Monday.com — Best AI for writing a book 2026](https://monday.com/blog/ai-agents/best-ai-for-writing-a-book/) · [ourculturemag — AI tools for book writing](https://ourculturemag.com/2026/07/08/game-changing-ai-tools-for-book-writing/)

---

## Part 2: How authors actually work (not just what software they own)

Pulled from the workflow-specific research plus the cross-product patterns above:

A self-published author's real path from idea to finished book today looks like this: capture ideas and worldbuild in Notion, Obsidian, or a notes app; draft the manuscript in Scrivener, Google Docs, or a cloud writing tool; run it through Grammarly or ProWritingAid for line-level editing; move to Vellum, Atticus, or InDesign to format print and ebook; design a cover separately in Canva or Affinity Photo; and, increasingly, bounce ideas off an AI tool like Sudowrite or ChatGPT in a separate browser tab that has no awareness of any of the above. One piece of research described this precisely as "chatbot purgatory" — constantly copy-pasting between disconnected AI chat windows, note apps, and document editors — and another described the cost directly: "each tool solves one problem but creates another," with authors "losing entire afternoons" reformatting content that moved between systems. [SidekickWriter](https://www.sidekickwriter.com/blog/best-publishing-workflow-automation-2026-new)

The waste isn't really the multiple subscriptions (though that adds up); it's the *copying*. Every handoff between tools is a place where a character's name gets typo'd on re-entry, a formatting choice doesn't survive the export, or a piece of research gets orphaned in a tool nobody opens anymore. Editors reviewing a manuscript, illustrators working from a brief, and the author's own future self six months later are all reading from whichever copy happens to be freshest — which is not a guarantee any of these tools can make, because none of them own the whole project.

This is the concrete, unglamorous version of "where authors are wasting time," and it's the strongest evidence for the thesis in the introduction: the opportunity isn't a better editor or a prettier layout tool. It's removing the copy-paste tax entirely, by making the planning data, the manuscript, and the output the same project instead of three files handed between three apps.

---

## Part 3: Challenging every feature — "why would someone actually use this"

The user's instruction was explicit: for every feature, answer why someone would use it, how often, whether they'd pay for it, whether they'd miss it, whether it reduces friction — and challenge features that add complexity without a real payoff. Applied honestly to what Book Studio already has or has been building this session:

**Layer 0 (story bible: characters, locations, timeline, glossary, etc.)** — passes every test. Daily/weekly use for anyone writing fiction longer than a short story; directly addresses a problem two entire categories of competitor (Campfire, World Anvil, and informally Notion/Obsidian) exist solely to solve; people already pay for Campfire specifically for this. Would be missed immediately — it's the thing every "fragmented stack" author is manually holding together with a second app today.

**The Continuity Checker** — passes, but conditionally: valuable specifically *because* it reads Layer 0 directly rather than being a separate pass over prose (which is what Grammarly/ProWritingAid do, and neither catches "this character's eye color changed in chapter 12"). Its value is entirely dependent on Layer 0 actually being kept up to date — a checker with no data behind it is a vanity feature. Worth continuing to invest in; not worth expanding into general grammar/style checking, which is a commodity Grammarly already wins.

**The Book Graph (Phase 97–99, including today's relationship edges and the central Book hub)** — this is the feature to be most honest about. It is visually impressive and it is the thing a demo shows off first. But "impressive in a demo" and "used every day" are different tests, and the research doesn't show a strong daily-use case for a *graph visualization* specifically — it shows a strong daily-use case for the *underlying data* (character names being consistent, relationships being remembered, entities being linked to chapters). The graph view is the right feature to have as the visible, delightful surface of that data — but if a user never opens it and just uses the entity list and the continuity checker, they still get the full value. That's a healthy shape for a feature: valuable data with an optional, beautiful window onto it, not a feature that *is* the value.

**Mobile editing (today's improvements)** — passes on friction-reduction grounds specifically because the research shows authors already write on the go via Google Docs on their phone out of necessity, not preference. A phone is also, unambiguously, most people's best camera — so photo insertion for illustration references or moodboard material is a genuine daily-use case, not a nice-to-have. Full mobile parity with desktop typographic controls would fail the test (nobody wants to kern text with their thumb) — the mobile scope decision already made in this codebase (write, capture ideas, now insert photos and manage chapters, but not precision layout) is the correct line, not an accidental limitation.

**Cover/back-cover element editor (rotation, snapping, layers, focal point, etc.)** — passes for the export-blocking core (an author cannot ship a book without a cover), but several of the more granular controls (per-element accessibility contrast checking, arbitrary rotation) are closer to "impressive but rarely used" — genuinely valuable for the small minority of users who care, but not something to keep expanding indefinitely at the expense of the planning/continuity side, which is where the actual unfair advantage lives. This is the clearest place in the current build where effort could be over-invested relative to daily-use value.

**AI drafting assistance, if/when it's expanded** — the research strongly suggests this should stay scoped to "assist inside the project" (draft a paragraph from Layer 0 context, suggest a continuity fix, summarize research) rather than "write the book," matching both the Laterpress/NovelCrafter positioning and Adam's own stated philosophy. A generic chat box bolted onto the side, disconnected from Layer 0, would be the one AI feature actively worth *not* building — it's exactly the "chatbot purgatory" pattern the research identifies as a pain point, recreated inside the app that's supposed to be the fix.

---

## Part 4: The AI question — "the place where a book lives"

Adam's framing: don't compete with AI models, become the project AI works *from* — the manuscript, ideas, characters, relationships, research, illustrations, publishing assets, and layout, all understood by the software, with AI as a tool that operates on that understanding rather than a replacement for it.

This is correct, and the research independently arrived at the same conclusion from a different direction: NovelCrafter's whole product is "keep the AI's understanding of your world consistent," and Laterpress's positioning is "the structure lives in the environment, not the AI." Neither company frames it as a philosophical choice the way Adam has — they frame it as the only version of an AI writing tool that survives contact with a real, long manuscript, because an AI with no persistent, structured memory of the story it's helping write will contradict itself by chapter ten regardless of how good the underlying model is. That's not a taste preference; it's a technical constraint that happens to line up with the more humane framing.

Where to push back, honestly: "the place where a book lives" is a strong position *only* if Book Studio actually stays the place where the book lives — meaning export has to be genuinely excellent (matching or beating Vellum/Atticus on output quality, not just "good enough"), and the project file has to be something a user trusts completely, including trusting they'll never lose it. Pressbooks and LivingWriter's research shows exactly what happens to that trust when export is unreliable or data goes missing — it doesn't erode gradually, it breaks in one incident and the user leaves permanently. Every feature added to Layer 0/Book Graph increases the cost of that promise, not just the value of it: the more central Book Studio makes itself to a book's existence, the more catastrophic any data-loss or export bug becomes. This isn't a reason not to pursue the vision — it's the actual bar the vision has to clear, higher than any competitor researched here has had to clear, because none of them tried to be the *only* place the book lives.

One genuine improvement to the framing: "the place where a book lives" should explicitly include being the place the book *stays retrievable from*, in formats no vendor controls — the existing project-file export/import and plain PDF/EPUB output already do this, and that should be treated as a permanent, non-negotiable commitment, not an implementation detail. It's the direct answer to the platform-lock-in research (Ulysses's read-only mode, Pressbooks's paywalled exports): the moment Book Studio ever makes a user's own book harder to get out than to put in, it has become exactly the kind of tool this whole research pass shows people eventually leave.

---

## Part 5: Product strategy

**Why buy Book Studio instead of Scrivener?** Scrivener organizes a manuscript; it has no concept of a character, a relationship, or a continuity error, and it doesn't format a finished book. Book Studio does both halves in one file — you never open a second app to make the book look professional, and switching themes never touches your words, an explicit non-negotiable in this codebase's own architecture.

**Why buy Book Studio instead of Atticus?** Atticus is a genuinely good answer to "Scrivener plus a formatter, cheaper and cross-platform" — it closes the writing-to-formatting gap. It still starts from a manuscript with nothing before it: no story bible, no continuity checking, no relationship tracking. Book Studio starts before the first sentence is written.

**Why buy Book Studio instead of Reedsy Studio?** Reedsy Studio is free and genuinely pleasant for a first, simple book, and its own users say it becomes limiting the moment a project gets ambitious. Book Studio is built for the book someone actually outgrows Reedsy trying to write — deeper planning, real continuity checking, and print-grade export, not just an ebook.

**Why buy Book Studio instead of Pressbooks?** Pressbooks' own users describe paywalled exports and broken reliability after paying. The one-sentence version: Book Studio's export is never held hostage — the export you can produce for free during trial or evaluation is the same pipeline you get after paying, not a crippled version designed to extract a second payment.

**Why would someone keep paying every year?** Not for a new feature dropped every quarter — for the same reason people keep paying for Dropbox rather than an external hard drive: the project keeps growing (more characters, more research, more chapters, more relationships), and it living in one continuously-improving place is worth more with every month invested in it. The renewal has to be justified by trust and continuity, not novelty — which is exactly what the Ulysses/LivingWriter research says subscription writing tools get wrong when they treat renewal as a feature-drop cadence instead of a custody question.

**What is Book Studio's unfair advantage?** Not any single feature researched here — every individual piece (a story bible, a continuity checker, beautiful export, an AI assistant) has a competitor that does that one thing, in some cases better. The unfair advantage is structural: it is the only product in this entire research pass where all of it is the same data model. A competitor can't bolt a story bible onto Vellum or bolt professional print layout onto Campfire without becoming a different, much bigger product than the one their users chose them for — that's a rebuild, not a feature release. Book Studio was architected this way from the start (`Layer 0` → `Content` → `Theme/Layout Engine` → `Export`, with explicit one-way boundaries between layers), which is a multi-year head start a competitor can't buy back with a sprint.

**What is its defining feature?** Not the Book Graph, and not any single checker — it's that changing a character's eye color once actually changes it everywhere: the manuscript stays consistent, the AI prompt context stays accurate, and the continuity checker stops flagging it. That single guarantee is the thing no researched competitor can make, because none of them have one place a fact lives.

**What sentence would a user tell a friend?** *"It's the only one where my characters and my book actually know about each other."*

**What sentence belongs on the homepage?** *"Book Studio is where your book lives — the story, the people in it, and the finished pages — so you stop copying it between apps and start finishing it."*

**What makes it impossible to ignore?** Every other tool researched here asks an author to accept a permanent trade-off: Scrivener's organization without its formatting, Vellum's formatting without any planning, Notion's structure without any manuscript, Campfire's continuity without any print output. Book Studio is the only one in this research where accepting the trade-off isn't required — and once an author has planned a book's world inside it, leaving means rebuilding that world somewhere else with no data model that understands it, which is the same retention mechanism that makes Scrivener projects hard to leave, except earned through genuine value rather than proprietary file-format lock-in.

---

## Part 6: Brutal honesty

**Are you trying to build too much?** The scope as documented (`docs/PRD.md`, `docs/ROADMAP.md`) is genuinely ambitious — planning, drafting, continuity, theming, cover design, print/EPUB/HTML export, publisher validation, AI assistance, and now mobile — and that is, correctly, also every single thing the research shows authors currently stitch together from five separate products. The risk isn't that the scope is wrong; every piece of it maps to a real, researched pain point. The risk is sequencing and depth: trying to make every layer as deep as its best single-purpose competitor (Vellum-grade export *and* Campfire-grade continuity *and* Sudowrite-grade AI prose, all at once) is not achievable by one team on one timeline, and the ROADMAP's own phase structure already implicitly acknowledges this by going deep on one layer at a time. The honest recommendation: keep treating "the whole book lives here" as the permanent, non-negotiable architecture, but let individual layers stay intentionally simpler than their best single-purpose rival for longer than feels comfortable — Book Studio doesn't need PDF export to beat Vellum's on day one; it needs it to be good enough that nobody feels forced to leave for it.

**Where do competitors already win, and can't realistically be beaten head-on?** Three places, honestly: (1) Vellum's raw visual polish and the specific two-page-spread/typography craft it's spent years on — matching that exactly is a multi-year investment in its own right, not a side effect of a good architecture; (2) Sudowrite's prose-generation quality, which is a frontier-model problem, not a product-design problem — Book Studio should integrate AI assistance well, not try to out-model a company whose entire focus is fiction-tuned language models; (3) Obsidian's specific appeal to a real subculture of writers who want local, offline, plain-text-file ownership with zero cloud dependency — Book Studio's local project-file model gets close to this, but a writer who has chosen Obsidian specifically to avoid any app owning their notes is not the target user, and chasing that group would mean compromising the integrated-data-model advantage that's actually the point.

**Is there a genuinely unique opportunity here?** Yes, and it's specific enough to state plainly: nobody researched in this entire pass has built a single project file where a story bible, a manuscript, a continuity checker, and print/EPUB export are the same data, updated in one place, with themes as pure presentation over that data rather than a re-import. Every competitor picked a lane — plan, write, or format — and the ones that tried to cover two of the three (Atticus: write + format; Campfire: plan + write) still stop before the third. That gap isn't a marketing angle; it's a genuine, unclaimed position in a crowded market, and this codebase's own architecture already commits to it structurally, not just in messaging.

---

## Sources

- [Scrivener (Wikipedia)](https://en.wikipedia.org/wiki/Scrivener_(software))
- [Scrivener reviews — Capterra](https://www.capterra.com/p/180597/Scrivener/reviews/?page=3)
- [Scrivener reviews — G2](https://www.g2.com/products/Scrivener/reviews)
- [Atticus book formatting tool — Creativindie](https://www.creativindie.com/atticus-book-formatting-tool-better-than-scrivener-vellum/)
- [Atticus Review — The Write Practice](https://thewritepractice.com/book-writing-software-atticus-review/)
- [Atticus vs Vellum comparison — Kindlepreneur/Goodreads](https://www.goodreads.com/author_blog_posts/23845346-formatting-software-atticus-vs-vellum-a-side-by-side-comparison-by)
- [Vellum Review — Kindlepreneur](https://kindlepreneur.com/vellum-software-review/)
- [Book Formatting Software 2026 — Creativindie](https://www.creativindie.com/is-vellum-worth-it-review-best-book-formatting-software-for-pc-or-mac/)
- [Reedsy Studio reviews — G2](https://www.g2.com/products/reedsy-studio/reviews)
- [Reedsy Studio review — Gone Travelling Productions](https://gonetravellingproductions.com/2025/10/27/reedsy-studio-review/)
- [Ulysses App Review — QuillSpace](https://quillspace.app/blog/ulysses-app-review)
- [Ulysses subscription switch — TechCrunch](https://techcrunch.com/2017/08/11/popular-writing-app-ulysses-switches-to-subscription-model/)
- [Dabble Writer Review — Kindlepreneur](https://kindlepreneur.com/dabble-writer/)
- [Dabble Review — The Write Practice](https://thewritepractice.com/dabble-review/)
- [LivingWriter Review — Kindlepreneur](https://kindlepreneur.com/living-writer-review/)
- [LivingWriter reviews — Trustpilot](https://www.trustpilot.com/review/livingwriter.com)
- [Novlr Review — Kindlepreneur](https://kindlepreneur.com/novlr-review/)
- [Novlr Review — Reedsy](https://reedsy.com/blog/guide/book-writing-software/novlr/)
- [Pressbooks Review — Medium](https://jerryholliday.medium.com/pressbooks-review-5050575f00c4)
- [Pressbooks reviews — Trustpilot](https://www.trustpilot.com/review/pressbooks.com)
- [Affinity Publisher review — TechRadar](https://www.techradar.com/reviews/affinity-publisher)
- [An Alternative to InDesign: Affinity Publisher — Goodreads](https://www.goodreads.com/author_blog_posts/18143504-an-alternative-to-indesign-affinity-publisher)
- [Notion vs Obsidian for Worldbuilding — Quill & Steel](https://www.quillandsteel.com/blogs/writing-tips/notion-vs-obsidian-worldbuilding)
- [Obsidian vs Notion — Writing Pursuits](https://writingpursuits.substack.com/p/obsidian-vs-notion-im-using-both)
- [Milanote for worldbuilding](https://milanote.com/guide/worldbuilding)
- [Milanote novel moodboard guide](https://milanote.com/guide/novel-moodboard)
- [Campfire Write Review — Kindlepreneur](https://kindlepreneur.com/campfire-write-review/)
- [Campfire vs World Anvil — Kindlepreneur](https://kindlepreneur.com/campfire-vs-world-anvil/)
- [Best AI for writing a book 2026 — Monday.com](https://monday.com/blog/ai-agents/best-ai-for-writing-a-book/)
- [Game-Changing AI Tools for Book Writing 2026 — Our Culture](https://ourculturemag.com/2026/07/08/game-changing-ai-tools-for-book-writing/)
- [Best Writing Tools for Fiction Authors 2026 — Laterpress](https://www.laterpress.com/craft-of-writing/best-ai-writing-tools-for-fiction/)
- [Publishing workflow automation 2026 — SidekickWriter](https://www.sidekickwriter.com/blog/best-publishing-workflow-automation-2026-new)
- [Why subscription writing software is a bad deal — StoryWriterPro](https://storywriterpro.app/blog/why-subscription-writing-software-is-a-bad-deal-for-authors/)

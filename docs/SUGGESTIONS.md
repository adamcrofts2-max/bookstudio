# Book Studio — Suggestions Log

A running list of ideas, gaps, and recommendations noticed while building — not a
roadmap (see `docs/ROADMAP.md` for committed, prioritised work) and not a bug tracker
(bugs get fixed and logged in `docs/STATUS.md` directly). This is lower-confidence,
lower-priority, or genuinely optional material: things worth the user's attention that
didn't rise to "do this now," organised newest-first, one entry per commit stage per
the 2026-08-01 instruction to append here after every commit.

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

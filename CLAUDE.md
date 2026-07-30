# CLAUDE.md — Book Studio

Lead architect / senior engineer / UI-UX / typography / print-publishing role for this
repo. Building a commercial, production-quality publishing application — never
demo-quality code.

## Before every session
1. Read every document in `/docs` (PRD, System Architecture, Development Plan, UI
   Design System, Book Layout Rules).
2. Read `docs/STATUS.md` for what's built and what's next.
3. Review recent commits (`git log`). Continue the existing codebase — never restart.

## Non-negotiables
- The manuscript, illustrations and projects are sacred: never delete, overwrite, or
  modify them during theme changes or layout regeneration.
- Layers stay separate — Project, Content, Theme, Layout Engine, Rendering, PDF Export,
  AI. No layer directly mutates another layer's data (see
  `docs/SYSTEM_ARCHITECTURE.md`).
- Themes control presentation only. Switching themes must never require re-importing a
  manuscript or illustrations.
- Beautiful by default. Every screen should feel at home next to Apple, Figma or
  Affinity Publisher — see `docs/UI_DESIGN_SYSTEM.md` for tokens (colour, type scale,
  8pt spacing, radius, shadow, motion). Don't invent ad-hoc values outside those tokens.
- Ship in working milestones: plan → build → test → refactor → commit → repeat. Every
  commit compiles (`npm run build`) and lints (`npm run lint`) clean. Never commit
  broken code.

## Working in this repo
- `npm install` then `npm run dev`. `npm run build` typechecks (`tsc -b`) and bundles
  with Vite. `npm run lint` runs oxlint.
- Path alias `@/*` → `src/*`.
- UI primitives live in `src/components/ui` (shadcn/ui-style, built on Radix + CVA +
  Tailwind — see `components.json`). Extend these rather than reaching for a new
  component library.
- Design tokens are CSS custom properties in `src/index.css`, mapped into Tailwind via
  `@theme`. Dark mode is a `.dark` class on `<html>`, toggled by `src/hooks/useTheme.ts`.
- Zustand stores in `src/store/` are namespaced per architecture layer
  (`projectStore` = Layer 1 only). Don't cross-import a store to mutate a layer it
  doesn't own.

## If context runs out mid-session
Write `docs/HANDOVER.md`: what was completed, files touched, outstanding work, known
issues, recommended next task. Then stop — the next session continues from it instead
of starting over.

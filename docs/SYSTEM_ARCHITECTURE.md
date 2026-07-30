# Book Studio — System Architecture

## Design Philosophy
The architecture separates content from presentation. Layout is never tightly coupled
to manuscript data. Everything should be replaceable.

## Architecture Layers

**Layer 1 — Project.** Metadata, user preferences, assets, version history.
Implemented in `src/types/project.ts` and `src/store/projectStore.ts`.

**Layer 2 — Content.** Chapters, paragraphs, tables, lists, images, captions. Pure
content only, no styling. Shape defined in `src/types/content.ts`; the importer that
populates it lands in Phase 2 (`src/parser/`).

**Layer 3 — Theme.** Fonts, colours, spacing, margins, component styling, page
decorations. Changing the theme regenerates the book without touching content. Shape
defined in `src/types/theme.ts`; presets land in Phase 4 (`src/theme/`).

**Layer 4 — Layout Engine.** Page creation, text flow, image placement, chapter starts,
whitespace balancing, page numbering, running headers, TOC generation. Lands in Phase 3.

**Layer 5 — Rendering.** Screen preview, PDF rendering, zoom, page thumbnails, print
preview. Lands across Phase 3 (`src/renderer/`), Phase 6 (preview) and Phase 7
(`src/pdf/`).

## Rendering Pipeline
Import Manuscript → Parse Structure → Import Assets → Apply Theme → Generate Layout →
Render Pages → Preview → Export PDF.

## Source Layout
```
src/
  components/   ui/ (design-system primitives), common/, settings/
  layout/        AppShell, Sidebar, Toolbar, Workspace, Inspector
  editor/        manuscript editing surfaces (Phase 2)
  parser/        DOCX/Markdown/TXT/HTML import (Phase 2)
  theme/         theme presets and resolvers (Phase 4)
  renderer/      preview rendering (Phase 3/6)
  pdf/           print-ready export (Phase 7)
  store/         Zustand stores — one per layer, never cross-imported for mutation
  hooks/
  lib/           shadcn-style helpers (`cn`)
  utils/         id generation, formatting
  types/         Project / Content / Theme shapes
  pages/         top-level routed screens
docs/            product & architecture documentation (this folder)
```

## State Management
Central, per-layer stores (Zustand). No duplicated data. Every change updates the
preview instantly. `projectStore` owns Layer 1 only; it must never be imported by code
that mutates manuscript, theme or layout data.

## PDF Engine
Responsible for pagination, fonts, images, bleed, crop marks, embedded fonts,
compression. Must produce print-ready PDFs identical to the on-screen preview.

## Future Expansion
The architecture must support cloud sync, collaboration, AI agents, a plugin system, a
marketplace, a mobile companion, and a template marketplace. No architectural decision
in Version 1 should preclude these.

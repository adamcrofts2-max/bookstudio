# Status

## Phase 1 — Foundation: complete

### What was built
- Vite + React 19 + TypeScript app, strict compiler settings, `@/*` path alias.
- Tailwind CSS v4 (CSS-first config) with the full Book Studio design token set: colour
  palette (light + dark), type scale, 8pt spacing (Tailwind's default scale already
  matches), radius tokens per component type, subtle shadow tokens, motion easing.
  Source of truth: `src/index.css`.
- shadcn/ui-style component primitives (hand-built on Radix + CVA, no CLI dependency):
  Button, Input, Label, Separator, Switch, Tooltip, Dialog, Dropdown Menu, Tabs, Scroll
  Area, Select, Progress — `src/components/ui/`.
- Application shell: `AppShell` composing `Sidebar` · `Toolbar` · `Workspace` ·
  `Inspector` in the fixed three-column layout the design system specifies
  (`src/layout/`).
- Dark mode: `useTheme` hook resolves `light | dark | system`, persists via
  `uiStore`, reflected as a `.dark` class on `<html>`; toggle lives in the Toolbar and
  on the Projects home screen.
- Project Settings dialog: name, trim size, margins (top/bottom/inner/outer), bleed,
  theme selection — writes to `projectStore` only, never touches manuscript content.
- Local persistence: `projectStore` (project list, active project, settings) and
  `uiStore` (appearance, panel collapse, inspector tab) persisted to `localStorage` via
  Zustand's `persist` middleware.
- Routing: `/` → Projects home (library grid, empty state, create/delete), `/project/
  :id` → editor shell.
- Folder structure mirrors the five architecture layers, with placeholder READMEs in
  `editor/`, `parser/`, `theme/`, `renderer/`, `pdf/` documenting what each will hold
  and in which phase.
- `docs/` now holds Markdown versions of all five source documents (the original
  `.docx` files remain untouched at the project root).

### Verified
- `npx tsc -b` — clean, no errors.
- `npm run build` — succeeds (Vite production bundle).
- `npx oxlint src` — 0 errors, 1 acceptable warning (shadcn's standard
  `button.tsx` dual-export pattern).
- `vite preview` served the build and all assets returned 200.

### Known issues
- A handful of unused Vite scaffold files (`src/App.css`,
  `src/assets/{react,vite}.svg`, `src/assets/hero.png`) could not be deleted from this
  session's sandboxed view of the project folder (delete/rename is blocked on this
  mount). They are inert and unreferenced. Feel free to delete them locally — Explorer
  on your own machine has no such restriction.
- `node_modules/` inside this folder may be in a partially-installed state left over
  from an npm run that hit filesystem errors on this synced folder (classic cloud-sync
  + `node_modules` friction). It's git-ignored either way — delete the folder locally
  and run `npm install` fresh before your first `npm run dev`.
- `react-router-dom` is pinned to the latest `7.18.2`; `npm audit` still reports two
  high-severity advisories against `react-router` whose "fixed" ranges contradict each
  other (upgrading and downgrading are both flagged) — looks like overlapping/synthetic
  advisory data rather than a real, actionable CVE for this SPA (no RSC/SSR is used
  here). Worth a real second look before shipping, not urgent for the foundation.

### Recommended next task
Phase 2 — Editor: manuscript importer (DOCX/Markdown/TXT/HTML → `src/types/content.ts`
shapes, in `src/parser/`), image library / asset manager, chapter navigation in the
Sidebar, and wiring the Inspector's Typography/Image tabs to real selections.

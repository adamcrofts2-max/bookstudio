# Book Studio

The easiest and most beautiful professional book publishing software available — a
commercial-quality alternative to Adobe InDesign, built so a stunning, print-ready book
can be produced in minutes rather than days.

Full product vision, architecture and roadmap live in [`/docs`](./docs):
[PRD](./docs/PRD.md) · [System Architecture](./docs/SYSTEM_ARCHITECTURE.md) ·
[Development Plan](./docs/DEVELOPMENT_PLAN.md) ·
[UI Design System](./docs/UI_DESIGN_SYSTEM.md) ·
[Book Layout Rules](./docs/BOOK_LAYOUT_RULES.md) · [Status](./docs/STATUS.md).

## Getting started
```
npm install
npm run dev
```

Other scripts: `npm run build` (typecheck + production bundle), `npm run lint`
(oxlint), `npm run preview` (serve the production build locally).

## Stack
React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui-style components (Radix +
CVA) · Zustand · React Router.

## Status
Phase 1 (Foundation) is complete — see [`docs/STATUS.md`](./docs/STATUS.md) for
details and the recommended next task.

# Custom fonts

Book Studio currently embeds exactly two font families everywhere — on
screen, in exported PDFs, and as the two choices offered for a Cover/Back
Cover's font override — because those are the only two font files actually
shipped in `public/fonts/`: Inter and Source Serif 4. This folder is where
you drop additional `.woff2` font files so a future session can wire up
more choices, without needing live internet access to fetch them (this
sandbox's outbound network is blocked, so an agent can't download new font
files itself — see `docs/STATUS.md` Phase 46).

## What to drop in here

- Format: `.woff2` preferred (smallest, and it's what Inter/Source Serif 4
  already use). `.ttf`/`.otf` also work — pdf-lib's font embedding (via
  `fontkit` under the hood) accepts all four, and the browser's own
  `@font-face` rule just needs a matching `format()` hint.
- Naming convention, matching the existing files in `public/fonts/`:
  `<family-slug>-<weight>.woff2`, e.g. `playfair-display-700.woff2`. Add
  `-italic` before the extension for a true italic cut, e.g.
  `playfair-display-700-italic.woff2` (optional — a family with no italic
  file falls back to the standard-14 Helvetica/Times italic exactly the
  way Inter/Source Serif 4 do today, per `pdf/fonts.ts`'s
  `pickItalicFont`).
- Only use font files you have the right to embed and redistribute (most
  Google Fonts are OFL-licensed and fine for this; check the license of
  anything else before dropping it in here).

## Registering a new family once files are here

There's no dynamic/drag-and-drop font loader yet — with only two real
families in the app so far, building one would be speculative. Once real
files exist, wire them in by hand at these spots:

1. **`src/index.css`** — add an `@font-face` block per weight/style, same
   shape as the existing Inter/Source Serif 4 rules just above the design
   system section, pointing at `/fonts/custom/<file>.woff2`.
2. **`src/pdf/fonts.ts`** — add the new weights to `ThemeFontSet`, embed
   them in `loadThemeFonts` (same `embed(doc, url)` pattern already used),
   and extend `pickFont`/`pickItalicFont`'s family-matching logic.
3. **`src/structuralPages/coverTypography.ts`** — add the new family's CSS
   string as another option alongside `SERIF_FAMILY`/`SANS_FAMILY`.
4. **`src/types/structuralPage.ts`** — extend the `CoverFontChoice` union
   with a new id for the family.
5. **`src/layout/inspector/StructuralPagePanel.tsx`** — add it to the
   cover font-choice picker's options.
6. Optionally, **`src/components/settings/CustomThemeEditorDialog.tsx`**'s
   `FONT_OPTIONS` too, if the family should also be choosable for a whole
   book's interior theme, not just its cover.

Move this file (or update it) if the process changes once a first real
custom font actually gets wired up — this is a plan, not a guarantee the
above stays accurate forever.

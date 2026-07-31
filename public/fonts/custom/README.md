# Custom fonts

Book Studio's interior theme system still embeds exactly two font
families — Inter and Source Serif 4, from `public/fonts/` — used
everywhere the book's own theme picks a heading/body font. As of Phase
50, seven more families live here in `public/fonts/custom/` and are wired
up as **Cover/Back Cover-only** typography choices (`CoverFontChoice` in
`src/types/structuralPage.ts`): Anton, Bebas Neue, Oswald, Playfair
Display, DM Serif Display, Abril Fatface, and Fraunces — all real Google
Fonts `.ttf` files, downloaded and dropped in by hand (this sandbox's
outbound network is blocked, so an agent can't fetch new font files
itself — see `docs/STATUS.md` Phase 46).

These seven are deliberately **not** offered as whole-book interior
fonts: Anton/Bebas Neue/Oswald are single-weight-or-condensed display
faces that would be close to unreadable as running paragraph text, and
Playfair Display/DM Serif Display/Abril Fatface/Fraunces are all
display-weight serif faces meant for large cover titling rather than body
copy. A family only belongs in the interior theme system
(`CustomThemeEditorDialog.tsx`'s `FONT_OPTIONS`) if it's genuinely
comfortable to read at book-paragraph sizes across an entire chapter.

## Dropping in more fonts later

- Format: `.woff2` preferred for anything meant to also work as an
  interior theme font (smallest, matches Inter/Source Serif 4). `.ttf`/
  `.otf` are fine too — pdf-lib's font embedding (via `fontkit`) accepts
  all four, and the browser's own `@font-face` rule just needs a matching
  `format()` hint; the seven Phase 50 families are plain `.ttf` straight
  from Google Fonts' own download, unconverted.
- Keep each family in its own subfolder (matching Google Fonts' own zip
  layout — `<Family_Name>/`, with a `static/` folder for fixed-weight
  cuts if the family ships a variable font too). Prefer the `static/`
  fixed-weight files over a variable font for embedding — pdf-lib embeds
  a variable font as just its default instance, so a real static Bold/
  Italic file looks correct where a variable font might not.
- Only use font files you have the right to embed and redistribute (most
  Google Fonts are OFL-licensed and fine for this — every folder here
  keeps its own `OFL.txt`; check the licence of anything else before
  dropping it in).

## Registering a new family

There's still no dynamic/drag-and-drop font loader — wire a new family in
by hand at these spots (mirrors exactly how the seven Phase 50 families
were added; see each file's own Phase 50 comments for a worked example):

1. **`src/index.css`** — one `@font-face` block per real weight/style
   file you have, pointing at `/fonts/custom/<Family>/<file>`.
2. **`src/pdf/fonts.ts`** — add a `loadFamily(doc, { regular, medium?,
   semiBold?, bold?, italic?, boldItalic? }, 'sans' | 'serif')` call in
   `loadThemeFonts`, add the family's id to `CustomCoverFontId`, and add a
   matching entry to `CUSTOM_FAMILY_MATCHERS`. Missing weights/styles are
   fine — `loadFamily` reuses the nearest real file, and falls back to a
   standard-14 italic if the family ships no italic cut at all.
3. **`src/structuralPages/coverTypography.ts`** — add the new family's CSS
   string to `CUSTOM_FAMILY_CSS`.
4. **`src/types/structuralPage.ts`** — extend the `CoverFontChoice` union
   with a new id for the family.
5. **`src/layout/inspector/StructuralPagePanel.tsx`** — add it to
   `FONT_CHOICE_OPTIONS`.
6. Optionally, **`src/components/settings/CustomThemeEditorDialog.tsx`**'s
   `FONT_OPTIONS` too — only if the family is genuinely comfortable as
   whole-book running body/heading text, not just a cover title (see
   above).

Move this file (or update it) if the process changes further — this is a
plan, not a guarantee the above stays accurate forever.

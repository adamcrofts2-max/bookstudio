# English spell-check dictionary

`index.aff` and `index.dic` are copied as-is from the npm package
`dictionary-en` (Hunspell-format data, MIT/BSD-licensed — see `license` in
this folder), for the real dictionary-backed spell-check checker added
Phase 109 (2026-08-02, `src/virtualEditor/checkers/proofreading.ts`'s
`spellingChecker` + `src/virtualEditor/spellcheckDictionary.ts`).

They live here, as static `public/` assets fetched at runtime, rather than
being `import`ed from `node_modules/dictionary-en` directly, because that
package's own `index.js` reads the files off disk via Node's
`fs/promises` at import time — that only works in a Node runtime, and this
is a client-only browser app with no backend (see `CLAUDE.md`'s
non-negotiables). The same "static asset, fetched with `fetch()` at
runtime" pattern this app already uses for its `.woff2` interior/cover
fonts (`public/fonts/`, read by `src/pdf/fonts.ts`).

**This is American English only.** `dictionary-en` contains "color", not
"colour"; "realize", not "realise". This project's Style Guide defaults to
British English (`DEFAULT_STYLE_GUIDE.englishVariant` in
`src/virtualEditor/types.ts`), so the spelling checker only runs when a
project's Style Guide explicitly sets `englishVariant: 'american'` — see
`spellingChecker`'s `isApplicable` for why. Adding British support later
means installing `dictionary-en-gb`, copying its two files into a sibling
`public/dictionaries/en-gb/` folder, and extending
`spellcheckDictionary.ts`'s loader to pick a folder based on
`styleGuide.englishVariant` — the mechanism is already variant-aware, only
the second dictionary's data is missing.

To refresh either file to a newer `dictionary-en` release:
```
cp node_modules/dictionary-en/index.aff public/dictionaries/en/index.aff
cp node_modules/dictionary-en/index.dic public/dictionaries/en/index.dic
```

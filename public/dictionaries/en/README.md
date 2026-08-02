# English spell-check dictionaries

`index.aff` and `index.dic` in this folder and in the sibling `en-gb/`
folder are copied as-is from the npm packages `dictionary-en` (American)
and `dictionary-en-gb` (British) respectively (Hunspell-format data,
MIT/BSD-licensed — see `license` in each folder), for the real
dictionary-backed spell-check checker added Phase 109 (2026-08-02,
`src/virtualEditor/checkers/proofreading.ts`'s `spellingChecker` +
`src/virtualEditor/spellcheckDictionary.ts`).

They live here, as static `public/` assets fetched at runtime, rather than
being `import`ed from `node_modules/dictionary-en(-gb)` directly, because
those packages' own `index.js` files read the `.aff`/`.dic` off disk via
Node's `fs/promises` at import time — that only works in a Node runtime,
and this is a client-only browser app with no backend (see `CLAUDE.md`'s
non-negotiables). The same "static asset, fetched with `fetch()` at
runtime" pattern this app already uses for its `.woff2` interior/cover
fonts (`public/fonts/`, read by `src/pdf/fonts.ts`).

**Which dictionary loads is driven entirely by `StyleGuide.englishVariant`**
(`'british' | 'american'`, no third "no preference" option — see
`types.ts`) — `spellcheckDictionary.ts`'s `DICTIONARY_PATH_BY_VARIANT` maps
`'american'` to this folder and `'british'` to `en-gb/`. A project whose
Style Guide hasn't loaded yet defaults to British, matching
`DEFAULT_STYLE_GUIDE.englishVariant`. Adding a third variant later (e.g.
Australian/Canadian English) means installing that package, copying its two
files into a new sibling folder, widening `StyleGuide.englishVariant`, and
adding one entry to `DICTIONARY_PATH_BY_VARIANT` — nothing else in the
loader or the checker itself needs to change shape.

To refresh either dictionary to a newer release:
```
cp node_modules/dictionary-en/index.aff public/dictionaries/en/index.aff
cp node_modules/dictionary-en/index.dic public/dictionaries/en/index.dic
cp node_modules/dictionary-en-gb/index.aff public/dictionaries/en-gb/index.aff
cp node_modules/dictionary-en-gb/index.dic public/dictionaries/en-gb/index.dic
```

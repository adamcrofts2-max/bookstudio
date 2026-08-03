# English thesaurus data

`data.json` is a `word -> synonyms[]` map converted from the npm package
`thesaurus`'s bundled `th_en_US_new.js` (an OpenOffice/MyThes-format
English thesaurus, BSD-style-licensed — see `license` in this folder),
for the synonym-lookup feature added Phase 114 (2026-08-03,
`src/writing/thesaurusDictionary.ts` +
`src/renderer/FloatingFormatToolbar.tsx`'s "Synonyms" action).

Converted (not imported directly) for the same reason the spell-check
dictionaries live here as static assets instead of being pulled in from
`node_modules` at build time: the source package's own module (`require
('./th_en_US_new')`) is a single ~16 MB JS file — bundling that directly
into the app's JS would bloat every page load for a feature most sessions
never open. As a static `public/` JSON asset instead, it's only fetched the
first time a user actually opens a synonym lookup, then cached — the same
lazy-load pattern `spellcheckDictionary.ts` already established.

Each entry's synonym list includes the headword itself as its first
element (an artifact of the source data's format) — `thesaurusDictionary
.ts`'s `getSynonyms()` filters that out before returning results, so
callers never need to special-case it.

To refresh from a newer release of the `thesaurus` package:
```
node -e "
const data = require('./node_modules/thesaurus/lib/th_en_US_new.js');
const fs = require('fs');
delete data[''];
fs.writeFileSync('public/thesaurus/en/data.json', JSON.stringify(data));
"
cp node_modules/thesaurus/LICENSE.txt public/thesaurus/en/license
```

/**
 * Async-loaded, module-cached English thesaurus lookup — the offline,
 * bundled-dataset counterpart to `virtualEditor/spellcheckDictionary.ts`
 * (same reasoning: this is a client-only, no-backend app, so "bundled
 * dataset fetched once and cached" is the only option that doesn't need an
 * API key or a server — see `docs/ROADMAP.md`'s "Thesaurus / synonym
 * lookup" entry, Phase 114, 2026-08-03).
 *
 * Data lives at `public/thesaurus/en/data.json` (a plain `word ->
 * synonyms[]` map, ~12 MB, converted from the npm `thesaurus` package —
 * see that folder's own README for the conversion command and licensing).
 * Fetched as a static asset with `fetch()`, not `import`ed, so it's only
 * pulled over the network the first time a user actually opens a synonym
 * lookup — bundling ~12 MB of rarely-used data into the main JS bundle
 * would slow down every page load for a feature most sessions never touch.
 */

type ThesaurusData = Record<string, string[]>

let data: ThesaurusData | undefined
let loadPromise: Promise<void> | null = null

function load(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = fetch('/thesaurus/en/data.json')
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch thesaurus data: ${res.status}`)
      return res.json() as Promise<ThesaurusData>
    })
    .then((json) => {
      data = json
    })
    .catch((error) => {
      // Fails closed, same as `spellcheckDictionary.ts` — a missing/broken
      // thesaurus asset should never crash the editor, just leave the
      // Synonyms button reporting "no results" instead of exploding.
      console.error('Failed to load thesaurus data', error)
      loadPromise = null
    })
  return loadPromise
}

/** Kicks off the background fetch — call this as soon as it's plausible the
 * user might want a lookup (e.g. once the floating format toolbar mounts),
 * so the data has a head start on being ready by the time they actually
 * click "Synonyms". Safe to call repeatedly; only the first call actually
 * starts a fetch. Returns the load promise so a caller that started editing
 * *after* a lookup was already opened can `.then()` it to know when to
 * re-render rather than being stuck showing "Loading…" forever. */
export function ensureThesaurusLoading(): Promise<void> {
  return load()
}

export function isThesaurusReady(): boolean {
  return data !== undefined
}

/** Returns synonyms for `word` (case-insensitive), or `[]` if the data
 * isn't loaded yet or the word isn't in the dataset. The source data lists
 * the headword itself as the first entry of its own synonym list — that's
 * filtered out here so callers never see a word offered as a synonym of
 * itself. */
export function getSynonyms(word: string): string[] {
  if (!data) return []
  const key = word.toLowerCase()
  const entry = data[key] ?? data[word]
  if (!entry) return []
  return entry.filter((syn) => syn.toLowerCase() !== key)
}

/**
 * Loads the bundled offline Hunspell dictionary once per app session and
 * caches the resulting `nspell` instance for every later Virtual Editor
 * review — Phase 109 (2026-08-02), the real dictionary-backed spell-check
 * `docs/ROADMAP.md` had listed as blocked since Phase B ("no npm registry
 * access in this sandbox"). Unblocked once the user installed `nspell` +
 * `dictionary-en` from their own terminal, where the registry is reachable
 * — see `public/dictionaries/en/README.md` for why the dictionary *data*
 * still isn't imported straight from that npm package (it reads files off
 * disk via Node's `fs`, which doesn't exist in a browser bundle) and lives
 * as a fetched `public/` asset instead.
 *
 * Deliberately module-level singleton state, not a store: this is
 * read-only, derived-once infrastructure with nothing a user ever edits —
 * putting it in Zustand would just be ceremony around a cache. Every
 * `Checker` in this codebase is synchronous (`types.ts`'s own doc comment),
 * so an async dictionary load can't happen inside `run()` itself; instead
 * `spellingChecker.isApplicable` (see `checkers/proofreading.ts`) calls
 * `ensureSpellDictionaryLoading()` to kick off (or no-op if already
 * started) the fetch, and reports itself inapplicable — "Not yet analysed",
 * the same honest fallback `pipeline.ts` already gives publishingStandards/
 * layout before `pages` exists — until `isSpellDictionaryReady()` flips
 * true. In practice the ~550KB dictionary fetches and parses in well under
 * a second, so this only matters for the very first review right after the
 * app loads.
 */
import nspell, { type NSpell } from 'nspell'

let speller: NSpell | undefined
let loadPromise: Promise<void> | null = null

function load(): Promise<void> {
  if (!loadPromise) {
    loadPromise = Promise.all([
      fetch('/dictionaries/en/index.aff').then((response) => response.arrayBuffer()),
      fetch('/dictionaries/en/index.dic').then((response) => response.arrayBuffer()),
    ])
      .then(([aff, dic]) => {
        speller = nspell({ aff: new Uint8Array(aff), dic: new Uint8Array(dic) })
      })
      .catch((error) => {
        // Fails closed, not open: a network hiccup or a missing dictionary
        // file leaves the checker permanently "Not yet analysed" (see
        // `isSpellDictionaryReady`) rather than silently reporting zero
        // misspellings — a false "all clear" would be worse than not
        // checking at all, since a user might actually trust it.
        console.error('Spell-check dictionary failed to load', error)
        loadPromise = null // allow a retry on the next isApplicable check
      })
  }
  return loadPromise
}

/** Fire-and-forget — safe and cheap to call on every pipeline run (a no-op
 * once loading has started or finished). Call from a checker's
 * `isApplicable`, not from module-load time: nothing should fetch network
 * data just because this module was imported, only when a review is
 * actually attempted. */
export function ensureSpellDictionaryLoading(): void {
  void load()
}

export function isSpellDictionaryReady(): boolean {
  return speller !== undefined
}

/** `undefined` until `isSpellDictionaryReady()` is true — callers must
 * check readiness first, exactly like every other optional `CheckerContext`
 * field in this codebase. */
export function getSpeller(): NSpell | undefined {
  return speller
}

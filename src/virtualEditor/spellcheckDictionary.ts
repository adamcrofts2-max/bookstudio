/**
 * Loads the bundled offline Hunspell dictionaries once per app session and
 * caches the resulting `nspell` instances for every later Virtual Editor
 * review — Phase 109 (2026-08-02), the real dictionary-backed spell-check
 * `docs/ROADMAP.md` had listed as blocked since Phase B ("no npm registry
 * access in this sandbox"). Unblocked once the user installed `nspell` +
 * `dictionary-en` (American) from their own terminal, where the registry is
 * reachable — see `public/dictionaries/en/README.md` for why the dictionary
 * *data* still isn't imported straight from those npm packages (they read
 * files off disk via Node's `fs`, which doesn't exist in a browser bundle)
 * and lives as a fetched `public/` asset instead. Extended the same day once
 * the user also installed `dictionary-en-gb`, so British spelling is a real,
 * separate dictionary rather than the checker staying restricted to
 * American-only projects.
 *
 * Deliberately module-level singleton state, not a store: this is
 * read-only, derived-once infrastructure with nothing a user ever edits —
 * putting it in Zustand would just be ceremony around a cache. Every
 * `Checker` in this codebase is synchronous (`types.ts`'s own doc comment),
 * so an async dictionary load can't happen inside `run()` itself; instead
 * `spellingChecker.isApplicable` (see `checkers/proofreading.ts`) calls
 * `ensureSpellDictionaryLoading(variant)` to kick off (or no-op if already
 * started) the fetch for whichever one variant the project actually needs,
 * and reports itself inapplicable — "Not yet analysed", the same honest
 * fallback `pipeline.ts` already gives publishingStandards/layout before
 * `pages` exists — until `isSpellDictionaryReady(variant)` flips true. In
 * practice each ~550KB dictionary fetches and parses in well under a
 * second, so this only matters for the very first review of each variant
 * right after the app loads.
 *
 * Each project only ever needs one dictionary at a time (`StyleGuide.
 * englishVariant` is a closed `'british' | 'american'` choice, not a
 * "check both" option), but both are loaded lazily and independently keyed
 * — a session with both a British-default and an American-set project open
 * across tabs/reloads never re-fetches a dictionary it's already cached,
 * and never fetches the one it never needed.
 */
import nspell, { type NSpell } from 'nspell'
import type { StyleGuide } from '@/virtualEditor/types'

type Variant = StyleGuide['englishVariant']

/** `StyleGuide.englishVariant` is the only piece of state callers pass in;
 * this is the one place that knows which `public/dictionaries/<key>/`
 * folder (and therefore which actual Hunspell dictionary) a variant maps
 * to. Adding a third variant (e.g. Australian/Canadian English) later means
 * widening `StyleGuide.englishVariant` and adding one entry here — nothing
 * else in this file changes shape. */
const DICTIONARY_PATH_BY_VARIANT: Record<Variant, string> = {
  american: '/dictionaries/en',
  british: '/dictionaries/en-gb',
}

interface DictionaryEntry {
  speller?: NSpell
  loadPromise: Promise<void> | null
}

const entries: Record<Variant, DictionaryEntry> = {
  american: { loadPromise: null },
  british: { loadPromise: null },
}

function load(variant: Variant): Promise<void> {
  const entry = entries[variant]
  if (!entry.loadPromise) {
    const basePath = DICTIONARY_PATH_BY_VARIANT[variant]
    entry.loadPromise = Promise.all([
      fetch(`${basePath}/index.aff`).then((response) => response.arrayBuffer()),
      fetch(`${basePath}/index.dic`).then((response) => response.arrayBuffer()),
    ])
      .then(([aff, dic]) => {
        // Phase 119 (2026-08-03, user: "ALL words, even words typed like
        // hello have red lines underneath" / "no way to even change the
        // misspelt words automatically") — nspell's dictionary parser
        // (`lib/util/dictionary.js`, `lib/util/affix.js`) calls
        // `buf.toString('utf8')` on whatever it's handed. That only decodes
        // bytes correctly for a real Node `Buffer` (which overrides
        // `toString` to accept an encoding); a plain `Uint8Array` — all a
        // browser fetch can ever produce — ignores the `'utf8'` argument and
        // falls back to `Array.prototype.toString`, joining every byte as a
        // decimal number ("83,69,84,32...") instead of decoding real text.
        // Every affix rule and every dictionary word was silently being
        // parsed from that garbage string, so the resulting speller had
        // effectively zero real words in it — `.correct()` returned `false`
        // for *everything*, real or not (confirmed live: "hello"/"world"
        // both flagged, and the Virtual Editor's own `spellingChecker`,
        // which reuses this exact same dictionary, flagged them too — same
        // root cause, not two separate bugs). Decoding to a plain JS string
        // first sidesteps the problem entirely: `String.prototype.toString`
        // takes no encoding argument and just returns itself, so nspell's
        // `buf.toString('utf8')` call is a harmless no-op once `buf` is
        // already a string.
        const decoder = new TextDecoder('utf-8')
        entry.speller = nspell({ aff: decoder.decode(aff), dic: decoder.decode(dic) })
      })
      .catch((error) => {
        // Fails closed, not open: a network hiccup or a missing dictionary
        // file leaves the checker permanently "Not yet analysed" for this
        // variant (see `isSpellDictionaryReady`) rather than silently
        // reporting zero misspellings — a false "all clear" would be worse
        // than not checking at all, since a user might actually trust it.
        console.error(`Spell-check dictionary (${variant}) failed to load`, error)
        entry.loadPromise = null // allow a retry on the next isApplicable check
      })
  }
  return entry.loadPromise
}

/** Safe and cheap to call on every pipeline run (a no-op — returns the same
 * pending/settled promise — once loading for this variant has started or
 * finished). Call from a checker's `isApplicable`, not from module-load
 * time: nothing should fetch network data just because this module was
 * imported, only when a review is actually attempted, and only for the one
 * variant actually needed. Returns the load promise (Phase 116,
 * 2026-08-03) so a caller that needs to react to completion — like
 * `useLiveSpellcheck.ts`'s very first scan of a freshly-opened project,
 * which may start before the dictionary has ever been requested — can
 * `.then()` it instead of polling `isSpellDictionaryReady`; existing
 * fire-and-forget callers (`proofreading.ts`'s `isApplicable`) are
 * unaffected, since they already ignored the return value. */
export function ensureSpellDictionaryLoading(variant: Variant): Promise<void> {
  return load(variant)
}

export function isSpellDictionaryReady(variant: Variant): boolean {
  return entries[variant].speller !== undefined
}

/** `undefined` until `isSpellDictionaryReady(variant)` is true — callers
 * must check readiness first, exactly like every other optional
 * `CheckerContext` field in this codebase. */
export function getSpeller(variant: Variant): NSpell | undefined {
  return entries[variant].speller
}

/**
 * Minimal ambient types for `nspell` (Phase 109, 2026-08-02) — the package
 * ships no TypeScript types of its own and no `@types/nspell` package
 * exists. Only the surface `spellcheckDictionary.ts` actually calls is
 * declared here, not a full re-implementation of nspell's real (larger)
 * API — extend this if a future change needs another method (e.g.
 * `.personal()` for a per-project custom word list).
 *
 * Declared with ESM `export default` syntax (not `export =`) so a plain
 * `import nspell from 'nspell'` type-checks without needing
 * `esModuleInterop` — this tsconfig doesn't set that flag, and Vite/esbuild's
 * own CJS interop already puts nspell's real `module.exports` function at
 * the `.default` slot for ESM importers, so this matches actual runtime
 * behaviour, not just what's convenient to type.
 */
declare module 'nspell' {
  export interface NSpell {
    /** Whether `word` is spelled correctly (Hunspell-aware: handles
     * capitalisation-at-sentence-start and the dictionary's own affix
     * rules, not a raw case-sensitive lookup). */
    correct(word: string): boolean
    /** Ranked replacement suggestions for a word `correct()` rejected. */
    suggest(word: string): string[]
    add(word: string, model?: string): NSpell
    remove(word: string): NSpell
  }

  export interface NSpellDictionary {
    aff: Uint8Array | ArrayBuffer | string
    dic: Uint8Array | ArrayBuffer | string
  }

  export default function nspell(dictionary: NSpellDictionary): NSpell
}

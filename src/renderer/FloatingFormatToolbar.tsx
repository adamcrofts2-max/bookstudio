import { useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Italic, Link as LinkIcon, Sparkles, SpellCheck2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ensureThesaurusLoading, isThesaurusReady, getSynonyms } from '@/renderer/thesaurusDictionary'
import { useProjectStore } from '@/store/projectStore'
import { useLayer0Store } from '@/store/layer0Store'
import { ensureSpellDictionaryLoading, getSpeller, isSpellDictionaryReady } from '@/virtualEditor/spellcheckDictionary'
import { looksLikeAcronym, collectLayer0Names } from '@/virtualEditor/spellcheckWords'

/** A selection counts as "a single word" for the Synonyms/Fix-spelling
 * buttons when it's one run of letters/apostrophes/hyphens with no
 * surrounding whitespace — anything else (a phrase, a partial word plus
 * punctuation) has no useful single-headword lookup. */
const SINGLE_WORD_PATTERN = /^[A-Za-z][A-Za-z'-]*$/

interface FloatingFormatToolbarProps {
  /** The exact contentEditable element being edited — same ref object
   * `useEditableField` already attaches to the field's DOM node. Used only
   * to confirm the current browser selection actually lives inside this
   * field (a page can have many editable fields at once). */
  containerRef: React.RefObject<HTMLElement | null>
  /** Mirrors the owning field's `isEditing` — the toolbar only ever tracks
   * selection while its own field is the one being edited. */
  active: boolean
  /** The owning project's id (Phase 116, 2026-08-03) — needed to look up
   * the project's `StyleGuide.englishVariant` (which dictionary to check
   * spelling against) and Layer 0 bible (invented character/place names to
   * exclude from spelling suggestions), the same two things
   * `useLiveSpellcheck.ts` already needs for its own live underlining.
   * `undefined` only on paths that never edit real project content (there
   * are none today — `paragraph.tsx` always has a real `projectId` — but
   * kept optional defensively, matching `BlockContentProps.projectId`). */
  projectId?: string
}

const iconButtonClass =
  'flex size-7 items-center justify-center rounded-[var(--radius-preview)] text-text-secondary transition-colors hover:bg-hover hover:text-text-primary'

/** Small dropdown of clickable word suggestions, shared by the Synonyms and
 * Fix-spelling buttons below (Phase 116) — both are "a short list of words,
 * pick one to replace the current selection," differing only in what
 * populates the list and how loading/empty states are worded. */
function WordSuggestionsDropdown({
  loading,
  loadingLabel,
  emptyLabel,
  items,
  onPick,
}: {
  loading: boolean
  loadingLabel: string
  emptyLabel: string
  items: string[]
  onPick: (item: string) => void
}) {
  return (
    <div
      className="absolute left-1/2 top-full z-50 mt-1.5 w-48 -translate-x-1/2 rounded-[var(--radius-card)] border border-border bg-panel p-1 shadow-[var(--shadow-md)]"
      onMouseDown={(e) => e.preventDefault()}
    >
      {loading ? (
        <p className="px-2 py-1.5 text-xs text-text-secondary">{loadingLabel}</p>
      ) : items.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-text-secondary">{emptyLabel}</p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
          {items.slice(0, 12).map((item) => (
            <li key={item}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left text-sm text-text-primary transition-colors hover:bg-hover"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(item)
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Small floating bold/italic/link toolbar that appears above the current
 * text selection while editing a paragraph's inline HTML — see
 * docs/ROADMAP.md Phase B ("we can edit text, but it needs improving with a
 * small editor or something"). Only ever used by `paragraph.tsx`: it's the
 * only block field using `useEditableField({ mode: 'html', ... })` — every
 * other field is `mode: 'text'`, which strips all markup on commit
 * (`textContent`), so bold/italic/link would have no effect there.
 *
 * Uses `document.execCommand('bold' | 'italic' | 'createLink')` — deprecated
 * but still universally supported for exactly this contentEditable
 * formatting use case, and the simplest way to get real rich-text commands
 * without pulling in a rich-text-editor library this codebase doesn't
 * otherwise depend on. Whatever markup this produces (`<b>`/`<i>`/`<a>`) is
 * normalised back down to `<strong>`/`<em>`/`<a>` by the existing
 * `sanitiseInline` on commit — no new sanitisation path.
 *
 * Every button uses `onMouseDown` + `preventDefault` (not `onClick`) so the
 * browser never collapses the text selection before the format command
 * runs — the classic contentEditable-toolbar pattern.
 *
 * Phase 114 (2026-08-03) added a "Synonyms" button alongside Bold/Italic/
 * Link, shown only when the selection is a single word
 * (`SINGLE_WORD_PATTERN`). It looks the word up in the bundled, lazily-
 * fetched `thesaurusDictionary.ts` and replaces the selection with whichever
 * synonym the user picks via `execCommand('insertText', ...)` — same
 * "use the browser's native contentEditable commands, no custom DOM
 * splicing" approach the other buttons already use, so it participates in
 * the browser's native undo stack for free.
 *
 * Phase 116 (2026-08-03) added a "Fix spelling" button alongside it, shown
 * only when the selected single word is actually misspelled (same nspell
 * dictionary + exclusion rules `useLiveSpellcheck.ts`'s underlining and the
 * Virtual Editor's `spellingChecker` both use). Selecting a suggestion
 * replaces the word the same `execCommand('insertText', ...)` way Synonyms
 * already does.
 */
export function FloatingFormatToolbar({ containerRef, active, projectId }: FloatingFormatToolbarProps) {
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null)
  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [synonymsOpen, setSynonymsOpen] = useState(false)
  const [spellingOpen, setSpellingOpen] = useState(false)
  // Cloned at the moment a dropdown button is clicked, since opening the
  // dropdown (a separate DOM subtree the user then clicks into) can't rely
  // on the browser selection still pointing at the original word by the
  // time a replacement is actually chosen — cloning a `Range` snapshots it
  // independent of later selection changes.
  const savedRangeRef = useRef<Range | null>(null)

  const variant = projectId ? (useProjectStore.getState().getProject(projectId)?.settings.styleGuide?.englishVariant ?? 'british') : 'british'

  // Kick off the (large, ~12 MB) thesaurus fetch as soon as a field starts
  // being edited, not on first Synonyms click — gives it a head start so
  // the dropdown is more likely to already have data by the time a user
  // actually wants it. `thesaurusReady` mirrors `isThesaurusReady()`
  // reactively — without this, opening the dropdown mid-fetch would show
  // "Loading…" and stay stuck there once the fetch actually finished, since
  // nothing would otherwise trigger a re-render at that moment.
  const [thesaurusReady, setThesaurusReady] = useState(isThesaurusReady())
  useEffect(() => {
    if (!active || thesaurusReady) return
    let cancelled = false
    void ensureThesaurusLoading().then(() => {
      if (!cancelled) setThesaurusReady(isThesaurusReady())
    })
    return () => {
      cancelled = true
    }
  }, [active, thesaurusReady])

  // Same reactive-readiness pattern as the thesaurus above, for the spelling
  // dictionary — in practice this is almost always already loaded by the
  // time a word is selected, since `useLiveSpellcheck.ts` starts fetching
  // it the moment this same field entered edit mode; this effect only
  // matters for the rare case of selecting a word before that fetch lands.
  const [spellDictReady, setSpellDictReady] = useState(isSpellDictionaryReady(variant))
  useEffect(() => {
    if (!active || spellDictReady) return
    let cancelled = false
    void ensureSpellDictionaryLoading(variant).then(() => {
      if (!cancelled) setSpellDictReady(isSpellDictionaryReady(variant))
    })
    return () => {
      cancelled = true
    }
  }, [active, spellDictReady, variant])

  useEffect(() => {
    if (!active) {
      setRect(null)
      setSelectedWord(null)
      setSynonymsOpen(false)
      setSpellingOpen(false)
      return
    }

    const update = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setRect(null)
        setSelectedWord(null)
        return
      }
      const container = containerRef.current
      const range = selection.getRangeAt(0)
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setRect(null)
        setSelectedWord(null)
        return
      }
      const box = range.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) {
        setRect(null)
        setSelectedWord(null)
        return
      }
      setRect({ top: box.top, left: box.left + box.width / 2 })
      setSelectedWord(selection.toString())
      setSynonymsOpen(false)
      setSpellingOpen(false)
    }

    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [active, containerRef])

  if (!rect) return null

  const format = (command: string, value?: string) => {
    document.execCommand(command, false, value)
  }

  const isSingleWord = !!selectedWord && SINGLE_WORD_PATTERN.test(selectedWord)

  const speller = spellDictReady ? getSpeller(variant) : undefined
  const ignoreWords = projectId ? collectLayer0Names(useLayer0Store.getState().getBible(projectId)) : new Set<string>()
  const isMisspelled =
    isSingleWord &&
    !!selectedWord &&
    !!speller &&
    !looksLikeAcronym(selectedWord) &&
    !ignoreWords.has(selectedWord.toLowerCase()) &&
    !speller.correct(selectedWord)

  // Phase 120 (2026-08-03, user: reported the fix-spelling flow still
  // didn't work right after Phase 119 made the dictionary real) —
  // `speller.suggest()` and `getSynonyms()` are non-trivial searches (edit-
  // distance candidate generation against a real, full-size dictionary /a
  // ~12 MB thesaurus), not simple lookups. Before this fix both were called
  // unconditionally on *every render* the instant a misspelled/single word
  // was merely selected — including every intermediate `selectionchange`
  // event a click or drag fires — regardless of whether the user had
  // actually opened the dropdown to look at suggestions. That was cheap
  // and unnoticeable while Phase 119's bug meant the dictionary was
  // effectively empty (nothing to search), but now that the dictionary is
  // real, repeatedly re-running `suggest()` synchronously on the main
  // thread — once per render, every render, while any misspelled word is
  // selected — was measured live to hang the tab entirely (CDP
  // screenshot/eval calls timed out). `useMemo` alone isn't enough on its
  // own (the *first* computation while merely selected is still the
  // expensive one); gating on `spellingOpen`/`synonymsOpen` means the
  // costly call only ever runs once, when the user actually asks for
  // suggestions by clicking the button — not on every intermediate
  // selection change before that.
  const spellingSuggestions = useMemo(
    () => (spellingOpen && isMisspelled && selectedWord && speller ? speller.suggest(selectedWord) : []),
    [spellingOpen, isMisspelled, selectedWord, speller],
  )
  const synonyms = useMemo(
    () => (synonymsOpen && isSingleWord && selectedWord ? getSynonyms(selectedWord) : []),
    [synonymsOpen, isSingleWord, selectedWord],
  )

  const saveCurrentRange = () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) savedRangeRef.current = selection.getRangeAt(0).cloneRange()
  }

  const applyReplacement = (replacement: string) => {
    const selection = window.getSelection()
    const range = savedRangeRef.current
    if (selection && range) {
      selection.removeAllRanges()
      selection.addRange(range)
    }
    // `insertText` replaces the current selection with `replacement` and
    // participates in the browser's native undo stack — same reasoning
    // `format()` above already uses `execCommand` for Bold/Italic/Link
    // rather than manually splicing the DOM.
    document.execCommand('insertText', false, replacement)
    setSynonymsOpen(false)
    setSpellingOpen(false)
  }

  return (
    <div
      className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-[var(--radius-button)] border border-border bg-background-secondary p-1 shadow-[var(--shadow-md)]"
      style={{ top: rect.top - 8, left: rect.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className={iconButtonClass}
        onMouseDown={(e) => {
          e.preventDefault()
          format('bold')
        }}
        aria-label="Bold"
        title="Bold"
      >
        <Bold className="size-3.5" />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        onMouseDown={(e) => {
          e.preventDefault()
          format('italic')
        }}
        aria-label="Italic"
        title="Italic"
      >
        <Italic className="size-3.5" />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        onMouseDown={(e) => {
          e.preventDefault()
          const url = window.prompt('Link URL')
          if (url) format('createLink', url)
        }}
        aria-label="Link"
        title="Link"
      >
        <LinkIcon className="size-3.5" />
      </button>

      {isMisspelled && (
        <div className="relative">
          <button
            type="button"
            className={cn(iconButtonClass, 'text-danger', spellingOpen && 'bg-hover')}
            onMouseDown={(e) => {
              e.preventDefault()
              saveCurrentRange()
              setSynonymsOpen(false)
              setSpellingOpen((open) => !open)
            }}
            aria-label="Fix spelling"
            title="Fix spelling"
          >
            <SpellCheck2 className="size-3.5" />
          </button>

          {spellingOpen && (
            <WordSuggestionsDropdown
              loading={false}
              loadingLabel=""
              emptyLabel="No suggestions found"
              items={spellingSuggestions}
              onPick={applyReplacement}
            />
          )}
        </div>
      )}

      {isSingleWord && (
        <div className="relative">
          <button
            type="button"
            className={cn(iconButtonClass, synonymsOpen && 'bg-hover text-text-primary')}
            onMouseDown={(e) => {
              e.preventDefault()
              saveCurrentRange()
              setSpellingOpen(false)
              setSynonymsOpen((open) => !open)
            }}
            aria-label="Synonyms"
            title="Synonyms"
          >
            <Sparkles className="size-3.5" />
          </button>

          {synonymsOpen && (
            <WordSuggestionsDropdown
              loading={!thesaurusReady}
              loadingLabel="Loading synonyms…"
              emptyLabel="No synonyms found"
              items={synonyms}
              onPick={applyReplacement}
            />
          )}
        </div>
      )}
    </div>
  )
}

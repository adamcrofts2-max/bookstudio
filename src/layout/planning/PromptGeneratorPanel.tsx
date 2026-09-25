import { useMemo, useRef, useState } from 'react'
import { Check, Copy, Loader2, Settings, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/common/EmptyState'
import { useContentStore } from '@/store/contentStore'
import { useLayer0Store } from '@/store/layer0Store'
import { clipboardProvider } from '@/types/aiProvider'
import { apiKeyProvider } from '@/ai/apiKeyProvider'
import { useAiSettingsStore } from '@/store/aiSettingsStore'
import { AiSettingsDialog } from '@/components/settings/AiSettingsDialog'
import { LAYER0_ENTITY_KINDS, LAYER0_KIND_LABELS, LAYER0_KIND_TO_COLLECTION, type Layer0Bible, type Layer0EntityKind } from '@/types/layer0'
import type { Chapter } from '@/types/content'
import {
  buildPromptText,
  chapterPlainText,
  detectMentionedEntityIds,
  getEntityPrimaryLabel,
  type PromptGeneratorSelection,
} from '@/layout/planning/promptContext'

interface PromptGeneratorPanelProps {
  projectId: string
}

const NO_CHAPTER_VALUE = '__none__'

function emptySelectedIds(): Record<Layer0EntityKind, string[]> {
  const record = {} as Record<Layer0EntityKind, string[]>
  for (const kind of LAYER0_ENTITY_KINDS) record[kind] = []
  return record
}

/** Starting checkbox state for a given chapter choice: auto-detected
 * characters/locations/glossary terms (see `promptContext.ts`'s
 * `detectMentionedEntityIds`) pre-checked, every style rule pre-checked
 * (small, global, meant to always apply), everything else opt-in. Called
 * fresh each time the chapter picker changes — the user's own manual
 * toggles on top of this are never fought after that, since detection only
 * re-runs on a real chapter-selection change, not on every render. */
function defaultSelectionForChapter(bible: Layer0Bible, chapter: Chapter | undefined): Record<Layer0EntityKind, string[]> {
  const selection = emptySelectedIds()
  const detected = chapter ? detectMentionedEntityIds(bible, chapterPlainText(chapter)) : new Set<string>()
  selection.character = bible.characters.filter((c) => detected.has(c.id)).map((c) => c.id)
  selection.location = bible.locations.filter((l) => detected.has(l.id)).map((l) => l.id)
  selection.glossaryTerm = bible.glossaryTerms.filter((g) => detected.has(g.id)).map((g) => g.id)
  selection.styleRule = bible.styleRules.map((r) => r.id)
  return selection
}

/**
 * `ClipboardProvider` v1's UI — the "scoped prompt generator" Phase F item.
 * Assembles a minimum-relevant context bundle (task + selected Layer 0
 * entities + optional previous-chapter tail) rather than dumping the whole
 * bible into every prompt, per `docs/AI_WORKSPACE_VISION.md`'s framing of
 * context curation as the actual differentiator. The user copies the
 * result into their own Claude/ChatGPT and pastes the response back into
 * the manuscript themselves — Book Studio never calls an AI on this user's
 * behalf here (paste-response-back-with-review is a separate, later Phase F
 * item; this panel only produces the prompt).
 */
export function PromptGeneratorPanel({ projectId }: PromptGeneratorPanelProps) {
  const manuscript = useContentStore((s) => s.getManuscript(projectId))
  const bible = useLayer0Store((s) => s.getBible(projectId))
  const chapters = useMemo(() => [...(manuscript?.chapters ?? [])].sort((a, b) => a.order - b.order), [manuscript])
  const bibleIsEmpty = LAYER0_ENTITY_KINDS.every((kind) => bible[LAYER0_KIND_TO_COLLECTION[kind]].length === 0)

  const [task, setTask] = useState('')
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [includeTail, setIncludeTail] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Record<Layer0EntityKind, string[]>>(() => defaultSelectionForChapter(bible, undefined))
  const [copied, setCopied] = useState(false)

  /**
   * The direct-API path. Everything below it exists to hand the reply to the
   * *same* review the clipboard flow feeds — `docs/AI_WORKSPACE_VISION.md`'s
   * rule is that the planning bible is never edited without an author
   * accepting a diff, and an API key removes the copy-paste, not the
   * consent.
   */
  const providerId = useAiSettingsStore((s) => s.providerId)
  const hasKey = useAiSettingsStore((s) => s.apiKey.length > 0)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const useApi = providerId === 'api-key' && hasKey

  async function handleAsk() {
    if (!apiKeyProvider.requestResponse) return
    const controller = new AbortController()
    abortRef.current = controller
    setAsking(true)
    setAskError(null)
    setReply('')
    try {
      await apiKeyProvider.requestResponse(promptText, (chunk) => setReply((prev) => prev + chunk), controller.signal)
    } catch (error) {
      // An abort is the user pressing Stop, not a failure worth an alarm.
      if (controller.signal.aborted) return
      setAskError(error instanceof Error ? error.message : 'That request could not be completed.')
    } finally {
      setAsking(false)
      abortRef.current = null
    }
  }

  const chapter = chapters.find((c) => c.id === chapterId)
  const detected = useMemo(() => (chapter ? detectMentionedEntityIds(bible, chapterPlainText(chapter)) : new Set<string>()), [bible, chapter])

  function handleChapterChange(value: string) {
    const nextId = value === NO_CHAPTER_VALUE ? null : value
    setChapterId(nextId)
    setSelectedIds(defaultSelectionForChapter(bible, chapters.find((c) => c.id === nextId)))
  }

  function toggleEntity(kind: Layer0EntityKind, id: string) {
    setSelectedIds((prev) => {
      const current = prev[kind]
      const next = current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]
      return { ...prev, [kind]: next }
    })
  }

  const selection: PromptGeneratorSelection = { task, chapterId, includePreviousChapterTail: includeTail, selectedIds }
  const promptText = useMemo(() => buildPromptText(bible, manuscript, selection), [bible, manuscript, selection])

  async function handleCopy() {
    await clipboardProvider.sendPrompt(promptText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (bibleIsEmpty) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Sparkles}
          title="Nothing to build a prompt from yet"
          description="Add a few characters, locations, or style rules from the categories on the left, then come back here to assemble a scoped prompt for your own Claude or ChatGPT."
          className="py-16"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Generate a prompt</h2>
        <p className="text-sm text-text-secondary">
          Assembles a minimum-relevant context bundle from your planning bible. Copy it into whatever you already use, or
          — if you have added your own API key — ask Claude here. Either way the reply is only ever text for you to
          review; nothing reaches your book until you accept it as a diff.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt-task">What do you want written or planned?</Label>
            <Textarea
              id="prompt-task"
              rows={3}
              placeholder="e.g. Write the opening scene of this chapter…"
              value={task}
              onChange={(e) => setTask(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Chapter (optional)</Label>
            <Select value={chapterId ?? NO_CHAPTER_VALUE} onValueChange={handleChapterChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CHAPTER_VALUE}>No specific chapter — general planning</SelectItem>
                {chapters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title || 'Untitled chapter'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {chapter && (
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" className="accent-accent" checked={includeTail} onChange={(e) => setIncludeTail(e.target.checked)} />
              Include the end of the previous chapter, for continuity
            </label>
          )}

          <div className="flex flex-col gap-3">
            {LAYER0_ENTITY_KINDS.map((kind) => {
              const collection = bible[LAYER0_KIND_TO_COLLECTION[kind]] as { id: string }[]
              if (collection.length === 0) return null
              return (
                <div key={kind} className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{LAYER0_KIND_LABELS[kind].plural}</p>
                  <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {collection.map((entity) => {
                      const label = getEntityPrimaryLabel(kind, entity as unknown as Record<string, unknown>) || 'Untitled'
                      const checked = selectedIds[kind].includes(entity.id)
                      return (
                        <label key={entity.id} className="flex items-center gap-2 text-sm text-text-primary">
                          <input type="checkbox" className="accent-accent" checked={checked} onChange={() => toggleEntity(kind, entity.id)} />
                          <span className="truncate">{label}</span>
                          {detected.has(entity.id) && (
                            <span className="shrink-0 rounded-full bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[0.65rem] text-[var(--color-accent)]">
                              mentioned
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Prompt preview</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setAiSettingsOpen(true)}>
                <Settings className="size-3.5" />
                AI settings
              </Button>
              <Button type="button" variant={useApi ? 'secondary' : 'primary'} size="sm" className="gap-1.5" onClick={() => void handleCopy()}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy to clipboard'}
              </Button>
              {useApi &&
                (asking ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => abortRef.current?.abort()}
                  >
                    <Loader2 className="size-3.5 animate-spin" />
                    Stop
                  </Button>
                ) : (
                  <Button type="button" size="sm" className="gap-1.5" onClick={() => void handleAsk()}>
                    <Sparkles className="size-3.5" />
                    Ask Claude
                  </Button>
                ))}
            </div>
          </div>
          <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-card)] border border-border bg-background-secondary p-4 text-xs leading-relaxed text-text-primary">
            {promptText}
          </pre>
        </div>

        {(reply || askError || asking) && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Claude’s reply</Label>
              {reply && !asking && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => void navigator.clipboard.writeText(reply)}
                >
                  <Copy className="size-3.5" />
                  Copy the reply
                </Button>
              )}
            </div>
            {askError && <p className="text-sm text-danger">{askError}</p>}
            <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-card)] border border-border bg-panel p-4 text-xs leading-relaxed text-text-primary">
              {reply || (asking ? 'Thinking…' : '')}
            </pre>
            {reply && !asking && (
              <p className="text-xs text-text-secondary">
                Nothing has been changed yet. Take this to <strong>Paste response</strong> to review it as a diff before
                any of it reaches your planning bible.
              </p>
            )}
          </div>
        )}
      </div>

      <AiSettingsDialog open={aiSettingsOpen} onOpenChange={setAiSettingsOpen} />
    </div>
  )
}

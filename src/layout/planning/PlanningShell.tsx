import { useState } from 'react'
import { ArrowLeft, ClipboardPaste, Lightbulb, ListTree, Sparkles, Waypoints } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/uiStore'
import { useLayer0Store } from '@/store/layer0Store'
import { useIdeaStore, EMPTY_IDEAS } from '@/store/ideaStore'
import { LAYER0_ENTITY_KINDS, getLayer0KindLabel, LAYER0_KIND_TO_COLLECTION, type Layer0EntityKind } from '@/types/layer0'
import { GRAPH_NODE_ICONS } from '@/layout/planning/graphIcons'
import { EntityListPanel } from '@/layout/planning/EntityListPanel'
import { IdeaInboxPanel } from '@/layout/planning/IdeaInboxPanel'
import { BookGraphView } from '@/layout/planning/BookGraphView'
import { PromptGeneratorPanel } from '@/layout/planning/PromptGeneratorPanel'
import { PasteBackPanel } from '@/layout/planning/PasteBackPanel'
import { OutlineTemplatesPanel } from '@/layout/planning/OutlineTemplatesPanel'
import type { BookForm, Project } from '@/types'

interface PlanningShellProps {
  project: Project
}

/** The left-hand nav's selection: Ideas (the landing view — see
 * `docs/IDEA_SYSTEM_PLAN.md`), one of the eight Layer 0 entity categories,
 * or one of the tool views ("Generate Prompt" / "Paste Response" / "Outline
 * Templates") — living in the same nav rather than a separate top-level
 * control, since they're still squarely part of this screen. */
type PlanningView = 'ideas' | 'graph' | Layer0EntityKind | 'prompt-generator' | 'paste-back' | 'outline-templates'

/** One tool-view nav row (icon + label, no count badge) — the shared markup
 * behind "Generate Prompt"/"Paste Response"/"Outline Templates" below.
 * Pulled out once a third copy-pasted block would have made this file
 * repeat itself for the third time; the entity-kind rows above stay
 * separate since they render a count badge these never need. */
function ToolNavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius-button)] px-3 py-2 text-left text-sm transition-colors duration-150',
        active ? 'bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]' : 'text-text-secondary hover:bg-hover hover:text-text-primary',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  )
}

/** The six kinds named explicitly in `docs/IDEA_SYSTEM_PLAN.md`'s "secondary
 * row" (Characters/Places/Timeline/Research/Illustrations — "Outline" is
 * the existing Outline Templates tool, rendered alongside them via
 * `ToolNavButton`, not a Layer 0 kind). Order matches the spec's own list.
 * The three kinds it doesn't name (Glossary Terms/References/Style Rules)
 * still get a nav row — nothing about existing Layer 0 functionality is
 * removed — just further down, after a second divider, since they weren't
 * called out as headline categories. */
const SECONDARY_ROW_KINDS: Layer0EntityKind[] = ['character', 'location', 'timelineEvent', 'researchNote', 'illustrationBrief']
const REMAINING_KINDS: Layer0EntityKind[] = LAYER0_ENTITY_KINDS.filter((k) => !SECONDARY_ROW_KINDS.includes(k))

/** One Layer 0 entity-kind nav row — pulled out since it's now rendered in
 * two separate groups (`SECONDARY_ROW_KINDS`, `REMAINING_KINDS`) rather
 * than one flat `LAYER0_ENTITY_KINDS.map`. */
function EntityKindNavButton({
  kind,
  count,
  active,
  onClick,
  bookForm,
}: {
  kind: Layer0EntityKind
  count: number
  active: boolean
  onClick: () => void
  bookForm?: BookForm
}) {
  const Icon = GRAPH_NODE_ICONS[kind]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-[var(--radius-button)] px-3 py-2 text-left text-sm transition-colors duration-150',
        active
          ? 'bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]'
          : 'text-text-secondary hover:bg-hover hover:text-text-primary',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{getLayer0KindLabel(kind, bookForm).plural}</span>
      </span>
      {count > 0 && <span className="text-xs text-text-muted">{count}</span>}
    </button>
  )
}

/**
 * Develop's own top-level shell (Layer 0 + the Idea System) — structurally
 * separate from `AppShell` (Sidebar/Toolbar+Workspace/Inspector), rendered
 * instead of it by `EditorPage.tsx` whenever `uiStore.appMode === 'planning'`.
 * This is the "new top-level mode/tab, not a sidebar section" placement
 * decided 2026-08-01 (`docs/AI_WORKSPACE_VISION.md`) — deliberately not a
 * fourth column bolted onto the fixed three-column editor shell, since
 * Character/Location/etc. have nothing to do with manuscript editing and
 * mixing the two would risk exactly the "must never slow down Import →
 * Design → Export" regression that document warns against. Someone who
 * never opens Develop never mounts anything in this file at all.
 *
 * Renamed "Planning" → "Develop" in every user-facing string (Develop
 * Milestone 1, `docs/IDEA_SYSTEM_PLAN.md`) — deliberately NOT a rename of
 * `uiStore.appMode`'s underlying `'planning'` string value, since that
 * value is persisted (`uiStore.ts`'s `persist` covers `appMode`, it isn't
 * excluded in `partialize`); a returning user with Develop open when they
 * last closed the app would have a stale `'planning'` value in
 * localStorage that a renamed value wouldn't match, landing them on a
 * blank branch. The internal identifier stays `'planning'` forever unless
 * a real migration is written for it — see `AppMode`'s own doc comment in
 * `uiStore.ts`.
 *
 * Lands on the Ideas inbox by default — the front door per the spec —
 * with the eight Layer 0 categories and three tool views one click away in
 * two progressively quieter groups below it, not competing for the first
 * click.
 */
export function PlanningShell({ project }: PlanningShellProps) {
  const setAppMode = useUiStore((s) => s.setAppMode)
  const bible = useLayer0Store((s) => s.getBible(project.id))
  const ideaCount = (useIdeaStore((s) => s.byProject[project.id]) ?? EMPTY_IDEAS).length
  const [activeView, setActiveView] = useState<PlanningView>('ideas')

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setAppMode('editor')}>
          <ArrowLeft className="size-4" />
          Back to editor
        </Button>
        <div className="h-6 w-px bg-border" />
        <p className="truncate text-sm font-medium text-text-primary">{project.name} — Develop</p>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-sidebar">
          <ScrollArea className="h-full flex-1">
            <nav className="flex flex-col gap-0.5 p-2">
              {/* Ideas — the front door. Always rendered `font-medium`, not
                 just while active, so it reads as "home" even before it's
                 been clicked, the one deliberate exception to every other
                 row's plain-until-active styling below. */}
              <button
                type="button"
                onClick={() => setActiveView('ideas')}
                className={cn(
                  'flex items-center gap-2 rounded-[var(--radius-button)] px-3 py-2 text-left text-sm font-medium transition-colors duration-150',
                  activeView === 'ideas'
                    ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                    : 'text-text-primary hover:bg-hover',
                )}
              >
                <Lightbulb className="size-3.5 shrink-0" />
                <span className="flex-1">Ideas</span>
                {ideaCount > 0 && <span className="text-xs font-normal text-text-muted">{ideaCount}</span>}
              </button>

              {/* Book Graph — spans the whole book (chapters + every Layer 0
                 kind + Ideas), not one category, so it lives right below
                 Ideas rather than filed under either entity-kind group. See
                 `BookGraphView.tsx`'s doc comment for the full design. */}
              <ToolNavButton
                icon={Waypoints}
                label="Book Graph"
                active={activeView === 'graph'}
                onClick={() => setActiveView('graph')}
              />

              <Separator className="my-2" />

              <ToolNavButton
                icon={ListTree}
                label="Outline Templates"
                active={activeView === 'outline-templates'}
                onClick={() => setActiveView('outline-templates')}
              />
              {SECONDARY_ROW_KINDS.map((kind) => (
                <EntityKindNavButton
                  key={kind}
                  kind={kind}
                  count={bible[LAYER0_KIND_TO_COLLECTION[kind]].length}
                  active={activeView === kind}
                  onClick={() => setActiveView(kind)}
                  bookForm={project.bookForm}
                />
              ))}

              <Separator className="my-2" />

              {REMAINING_KINDS.map((kind) => (
                <EntityKindNavButton
                  key={kind}
                  kind={kind}
                  count={bible[LAYER0_KIND_TO_COLLECTION[kind]].length}
                  active={activeView === kind}
                  onClick={() => setActiveView(kind)}
                  bookForm={project.bookForm}
                />
              ))}
              <Separator className="my-2" />

              {/* "Tools" — Generate Prompt / Paste Response are a real
                 two-step bulk-AI workflow (Phase 143/144), not clutter, but
                 they're a different kind of thing from the Ideas-promotion
                 categories above: those are "content you're building up,"
                 this is "an action you run." A small muted section label
                 makes that distinction legible instead of the two rows
                 reading as one more entity category. Discussed in the
                 Phase 83 design review, deliberately not built then —
                 Phase 92 closes it out. */}
              <p className="px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-[0.08em] text-text-muted">Tools</p>
              <ToolNavButton
                icon={Sparkles}
                label="Generate Prompt"
                active={activeView === 'prompt-generator'}
                onClick={() => setActiveView('prompt-generator')}
              />
              <ToolNavButton
                icon={ClipboardPaste}
                label="Paste Response"
                active={activeView === 'paste-back'}
                onClick={() => setActiveView('paste-back')}
              />
            </nav>
          </ScrollArea>
        </aside>

        <ScrollArea className="h-full min-w-0 flex-1">
          {activeView === 'ideas' ? (
            <IdeaInboxPanel projectId={project.id} onOpenBookGraph={() => setActiveView('graph')} />
          ) : activeView === 'graph' ? (
            <BookGraphView
              projectId={project.id}
              bookForm={project.bookForm}
              bookTitle={project.name}
              onFocusKind={(kind) => setActiveView(kind)}
            />
          ) : activeView === 'prompt-generator' ? (
            <PromptGeneratorPanel projectId={project.id} />
          ) : activeView === 'paste-back' ? (
            <PasteBackPanel projectId={project.id} />
          ) : activeView === 'outline-templates' ? (
            <OutlineTemplatesPanel projectId={project.id} bookForm={project.bookForm} />
          ) : (
            <EntityListPanel projectId={project.id} kind={activeView} bookForm={project.bookForm} />
          )}
        </ScrollArea>
      </div>
    </div>
  )
}

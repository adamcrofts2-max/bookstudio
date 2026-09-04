import { useState } from 'react'
import { ChevronLeft, ChevronRight, Lightbulb, ListChecks, Sparkles, Waypoints } from 'lucide-react'

import { cn } from '@/lib/utils'
import { LAYER0_ENTITY_KINDS, LAYER0_KIND_TO_COLLECTION, getLayer0KindLabel, type Layer0EntityKind } from '@/types/layer0'
import { GRAPH_NODE_ICONS } from '@/layout/planning/graphIcons'
import { EMPTY_LAYER0_BIBLE, useLayer0Store } from '@/store/layer0Store'
import { EMPTY_IDEAS, useIdeaStore } from '@/store/ideaStore'
import { EntityListPanel } from '@/layout/planning/EntityListPanel'
import { IdeaInboxPanel } from '@/layout/planning/IdeaInboxPanel'
import { OutlineTemplatesPanel } from '@/layout/planning/OutlineTemplatesPanel'
import { PromptGeneratorPanel } from '@/layout/planning/PromptGeneratorPanel'
import { BookGraphView } from '@/layout/planning/BookGraphView'
import type { Project } from '@/types'

interface MobileDevelopViewProps {
  project: Project
}

/** Everything Develop can show on a phone. The eight Layer 0 entity kinds
 * plus the three tools that aren't entity kinds. */
type DevelopSection = Layer0EntityKind | 'ideas' | 'outline' | 'prompt' | 'graph'

/**
 * Develop mode on mobile (Phase 129).
 *
 * Desktop's `PlanningShell` is a two-column shell: a nav rail of categories
 * beside the selected category's panel. A phone has room for one column, so
 * this is the same information architecture as a **drill-down** — the
 * category list is the screen, and choosing one pushes its panel with a back
 * row. That is the platform-native shape for master/detail, and it means the
 * category list can carry counts the way the desktop rail does.
 *
 * The panels themselves are desktop's, unmodified: `IdeaInboxPanel`,
 * `EntityListPanel`, `OutlineTemplatesPanel` and `PromptGeneratorPanel` all
 * take a project id and render their own content, so Develop's real
 * behaviour — add, edit, delete, relationships, the Layer 0 bible — is
 * identical on both, with no second implementation to keep in sync.
 *
 * Book Graph is included too (Phase 130). It was left out of Phase 129 on the
 * assumption that a drag-and-zoom canvas needed a pointer — which turned out
 * to be wrong about this canvas: it was built on pointer events with
 * `touch-none` and `setPointerCapture` throughout, so dragging a node already
 * worked under touch, and its force layout already runs in a Web Worker. Only
 * the container needed loosening, via `BookGraphView`'s `compact` prop.
 */
export function MobileDevelopView({ project }: MobileDevelopViewProps) {
  const [section, setSection] = useState<DevelopSection | null>(null)
  const bible = useLayer0Store((s) => s.byProject[project.id]) ?? EMPTY_LAYER0_BIBLE
  const ideas = useIdeaStore((s) => s.byProject[project.id]) ?? EMPTY_IDEAS

  if (section) {
    return (
      <div className="flex h-full flex-col bg-background">
        <button
          type="button"
          onClick={() => setSection(null)}
          className="flex shrink-0 items-center gap-1.5 border-b border-border bg-panel px-3 py-3 text-left active:bg-hover"
        >
          <ChevronLeft className="size-4 shrink-0 text-text-muted" />
          {/* Names where this goes back to, not where you already are: every
              panel below renders its own heading, so repeating the section
              name here just said it twice. */}
          <span className="text-[15px] font-medium text-text-secondary">Develop</span>
        </button>
        <div className={cn('min-h-0 flex-1', section === 'graph' ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain')}>
          {section === 'ideas' && <IdeaInboxPanel projectId={project.id} />}
          {section === 'outline' && <OutlineTemplatesPanel projectId={project.id} bookForm={project.bookForm} />}
          {section === 'prompt' && <PromptGeneratorPanel projectId={project.id} />}
          {section === 'graph' && (
            <BookGraphView
              projectId={project.id}
              bookForm={project.bookForm}
              bookTitle={project.name}
              compact
              // Tapping an entity node drills into that kind's list, the same
              // navigation desktop's graph performs against `PlanningShell`.
              onFocusKind={(kind) => setSection(kind)}
            />
          )}
          {/* Anything not one of the tool sections above is an entity kind. */}
          {section !== 'ideas' && section !== 'outline' && section !== 'prompt' && section !== 'graph' && (
            <EntityListPanel projectId={project.id} kind={section} bookForm={project.bookForm} />
          )}
        </div>
      </div>
    )
  }

  const rows: { key: DevelopSection; label: string; detail: string; count?: number; icon: typeof Lightbulb }[] = [
    { key: 'ideas', label: 'Ideas', detail: 'Capture and triage thoughts', count: ideas.length, icon: Lightbulb },
    ...LAYER0_ENTITY_KINDS.map((kind) => {
      const label = getLayer0KindLabel(kind, project.bookForm)
      return {
        key: kind as DevelopSection,
        label: label.plural,
        detail: label.description,
        count: bible[LAYER0_KIND_TO_COLLECTION[kind]].length,
        icon: GRAPH_NODE_ICONS[kind],
      }
    }),
    { key: 'graph', label: 'Book Graph', detail: 'Everything in the book, connected — drag to arrange', icon: Waypoints },
    { key: 'outline', label: 'Outline Templates', detail: 'Start from a proven structure', icon: ListChecks },
    { key: 'prompt', label: 'AI Prompt', detail: 'Build a prompt from this book’s context', icon: Sparkles },
  ]

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-background pb-6">
      <div className="divide-y divide-border border-b border-border bg-panel">
        {rows.map(({ key, label, detail, count, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 active:bg-hover',
            )}
          >
            <Icon className="size-[18px] shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-text-primary">{label}</span>
              <span className="block truncate text-xs text-text-muted">{detail}</span>
            </span>
            {count !== undefined && count > 0 && (
              <span className="shrink-0 rounded-full bg-background-secondary px-2 py-0.5 text-xs tabular-nums text-text-secondary">
                {count}
              </span>
            )}
            <ChevronRight className="size-4 shrink-0 text-text-muted" />
          </button>
        ))}
      </div>
    </div>
  )
}

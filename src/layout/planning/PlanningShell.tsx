import { useState } from 'react'
import { ArrowLeft, ClipboardPaste, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/uiStore'
import { useLayer0Store } from '@/store/layer0Store'
import { LAYER0_ENTITY_KINDS, LAYER0_KIND_LABELS, LAYER0_KIND_TO_COLLECTION, type Layer0EntityKind } from '@/types/layer0'
import { EntityListPanel } from '@/layout/planning/EntityListPanel'
import { PromptGeneratorPanel } from '@/layout/planning/PromptGeneratorPanel'
import { PasteBackPanel } from '@/layout/planning/PasteBackPanel'
import type { Project } from '@/types'

interface PlanningShellProps {
  project: Project
}

/** The left-hand nav's selection: one of the eight entity categories, or
 * one of the two AI-Workspace tools ("Generate Prompt" / "Paste Response") —
 * living in the same nav rather than a separate top-level control, since
 * they're still squarely part of Layer 0's own screen. */
type PlanningView = Layer0EntityKind | 'prompt-generator' | 'paste-back'

/**
 * Layer 0's own top-level shell — structurally separate from `AppShell`
 * (Sidebar/Toolbar+Workspace/Inspector), rendered instead of it by
 * `EditorPage.tsx` whenever `uiStore.appMode === 'planning'`. This is the
 * "new top-level mode/tab, not a sidebar section" placement decided
 * 2026-08-01 (`docs/AI_WORKSPACE_VISION.md`) — deliberately not a fourth
 * column bolted onto the fixed three-column editor shell, since Character/
 * Location/etc. have nothing to do with manuscript editing and mixing the
 * two would risk exactly the "must never slow down Import → Design →
 * Export" regression that document warns against. A pure-manuscript user
 * who never clicks "Planning" never mounts anything in this file at all.
 *
 * Deliberately simple for this first pass (a category list + one generic
 * list/form pane) — smart context assembly, the paste-back diff, and the
 * Continuity checker are all later Phase F items building on this
 * foundation, not part of it.
 */
export function PlanningShell({ project }: PlanningShellProps) {
  const setAppMode = useUiStore((s) => s.setAppMode)
  const bible = useLayer0Store((s) => s.getBible(project.id))
  const [activeView, setActiveView] = useState<PlanningView>('character')

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setAppMode('editor')}>
          <ArrowLeft className="size-4" />
          Back to editor
        </Button>
        <div className="h-6 w-px bg-border" />
        <p className="truncate text-sm font-medium text-text-primary">{project.name} — Planning</p>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-sidebar">
          <ScrollArea className="h-full flex-1">
            <nav className="flex flex-col gap-0.5 p-2">
              {LAYER0_ENTITY_KINDS.map((kind) => {
                const count = bible[LAYER0_KIND_TO_COLLECTION[kind]].length
                const active = activeView === kind
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setActiveView(kind)}
                    className={cn(
                      'flex items-center justify-between rounded-[var(--radius-button)] px-3 py-2 text-left text-sm transition-colors duration-150',
                      active
                        ? 'bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]'
                        : 'text-text-secondary hover:bg-hover hover:text-text-primary',
                    )}
                  >
                    <span>{LAYER0_KIND_LABELS[kind].plural}</span>
                    {count > 0 && <span className="text-xs text-text-muted">{count}</span>}
                  </button>
                )
              })}

              <Separator className="my-2" />

              <button
                type="button"
                onClick={() => setActiveView('prompt-generator')}
                className={cn(
                  'flex items-center gap-2 rounded-[var(--radius-button)] px-3 py-2 text-left text-sm transition-colors duration-150',
                  activeView === 'prompt-generator'
                    ? 'bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]'
                    : 'text-text-secondary hover:bg-hover hover:text-text-primary',
                )}
              >
                <Sparkles className="size-3.5 shrink-0" />
                <span>Generate Prompt</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView('paste-back')}
                className={cn(
                  'flex items-center gap-2 rounded-[var(--radius-button)] px-3 py-2 text-left text-sm transition-colors duration-150',
                  activeView === 'paste-back'
                    ? 'bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]'
                    : 'text-text-secondary hover:bg-hover hover:text-text-primary',
                )}
              >
                <ClipboardPaste className="size-3.5 shrink-0" />
                <span>Paste Response</span>
              </button>
            </nav>
          </ScrollArea>
        </aside>

        <ScrollArea className="h-full min-w-0 flex-1">
          {activeView === 'prompt-generator' ? (
            <PromptGeneratorPanel projectId={project.id} />
          ) : activeView === 'paste-back' ? (
            <PasteBackPanel projectId={project.id} />
          ) : (
            <EntityListPanel projectId={project.id} kind={activeView} />
          )}
        </ScrollArea>
      </div>
    </div>
  )
}

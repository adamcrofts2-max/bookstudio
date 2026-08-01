import { Palette } from 'lucide-react'

import { useUiStore, type InspectorTab } from '@/store/uiStore'
import { useSelectionStore } from '@/store/selectionStore'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { TypographyPanel } from '@/layout/inspector/TypographyPanel'
import { ImagePanel } from '@/layout/inspector/ImagePanel'
import { StructuralPagePanel } from '@/layout/inspector/StructuralPagePanel'
import { NotesPanel } from '@/layout/inspector/NotesPanel'
import { resolveTheme } from '@/theme/presets'
import type { Project } from '@/types'

interface InspectorProps {
  project: Project
}

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'page', label: 'Page' },
  { id: 'typography', label: 'Type' },
  { id: 'image', label: 'Image' },
  { id: 'notes', label: 'Notes' },
  { id: 'theme', label: 'Theme' },
]

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm font-medium text-text-primary">{value}</span>
    </div>
  )
}

/** Right column: always context-sensitive, never overwhelming. */
export function Inspector({ project }: InspectorProps) {
  const collapsed = useUiStore((s) => s.inspectorCollapsed)
  const activeTab = useUiStore((s) => s.inspectorTab)
  const setInspectorTab = useUiStore((s) => s.setInspectorTab)
  const setProjectSettingsOpen = useUiStore((s) => s.setProjectSettingsOpen)
  const selectedStructuralPageId = useSelectionStore((s) => s.selectedStructuralPageId)

  if (collapsed) return null

  const { settings } = project

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-panel">
      <Tabs value={activeTab} onValueChange={(v) => setInspectorTab(v as InspectorTab)} className="flex h-full min-h-0 flex-col">
        {/* px-1.5/text-xs/gap-0.5 (tighter than this component's px-3/text-sm/gap-1
         * defaults) — with 5 tabs in a 300px panel, the default padding genuinely
         * overflowed the row (labels truncated on both edges depending on scroll
         * position). See docs/STATUS.md's audit-fixes entry. */}
        <div className="shrink-0 p-3 pb-0">
          <TabsList className="w-full gap-0.5">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex-1 px-1.5 text-xs">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* `min-h-0` is load-bearing on a flex child that needs to scroll — without
         * it this region refuses to shrink below its content's natural height, the
         * whole `<aside>` grows past the viewport instead, and scrolling a long
         * panel (e.g. Cover with several stacked element property panels) scrolls
         * the Sidebar/canvas along with it instead of just this column. Confirmed
         * live: a tall Inspector panel scrolled the Cover preview itself out of
         * view. See docs/STATUS.md's audit-fixes entry. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <TabsContent value="page" className="px-1">
            {selectedStructuralPageId ? (
              <StructuralPagePanel projectId={project.id} />
            ) : (
              <div className="flex flex-col divide-y divide-border">
                <SettingRow label="Trim size" value={settings.trimSize.replace('x', ' × ')} />
                <SettingRow label="Margins (in)" value={`${settings.margins.inner}mm inner`} />
                <SettingRow label="Bleed" value={`${settings.bleed}mm`} />
                <SettingRow label="Language" value={settings.language.toUpperCase()} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="typography">
            <TypographyPanel projectId={project.id} />
          </TabsContent>

          <TabsContent value="image">
            <ImagePanel projectId={project.id} />
          </TabsContent>

          <TabsContent value="notes" className="px-1">
            <NotesPanel projectId={project.id} />
          </TabsContent>

          <TabsContent value="theme">
            {/* Previously a permanent "Theme editing arrives in Phase 4" placeholder,
             * even though a full Theme Gallery has existed in Project Settings since
             * Phase 43 — misleading, since a user landing on this tab had no way to
             * know changing themes was possible at all. Now opens that same real
             * gallery instead of duplicating it here. See docs/STATUS.md's
             * audit-fixes entry. */}
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <Palette className="size-6 text-text-muted" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-text-primary">{resolveTheme(settings.themeId).name}</p>
                <p className="text-xs text-text-secondary">
                  Themes control colour, type and layout — switching one never touches your manuscript.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setProjectSettingsOpen(true)}>
                Change theme…
              </Button>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  )
}

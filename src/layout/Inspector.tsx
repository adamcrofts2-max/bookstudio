import { Image as ImageIcon, MousePointerClick, Palette, Type } from 'lucide-react'

import { useUiStore, type InspectorTab } from '@/store/uiStore'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { EmptyState } from '@/components/common/EmptyState'
import type { Project } from '@/types'

interface InspectorProps {
  project: Project
}

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'page', label: 'Page' },
  { id: 'typography', label: 'Type' },
  { id: 'image', label: 'Image' },
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

  if (collapsed) return null

  const { settings } = project

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-panel">
      <div className="p-3">
        <Tabs value={activeTab} onValueChange={(v) => setInspectorTab(v as InspectorTab)}>
          <TabsList className="w-full">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex-1">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="page" className="px-1">
            <div className="flex flex-col divide-y divide-border">
              <SettingRow label="Trim size" value={settings.trimSize.replace('x', ' × ')} />
              <SettingRow label="Margins (in)" value={`${settings.margins.inner}mm inner`} />
              <SettingRow label="Bleed" value={`${settings.bleed}mm`} />
              <SettingRow label="Language" value={settings.language.toUpperCase()} />
            </div>
          </TabsContent>

          <TabsContent value="typography">
            <EmptyState
              icon={Type}
              title="No text selected"
              description="Select a paragraph or heading to edit its typography."
            />
          </TabsContent>

          <TabsContent value="image">
            <EmptyState
              icon={ImageIcon}
              title="No image selected"
              description="Select an image on the page to crop, scale or caption it."
            />
          </TabsContent>

          <TabsContent value="theme">
            <EmptyState
              icon={Palette}
              title="Theme editing arrives in Phase 4"
              description={`Currently using "${settings.themeId.replace('-', ' ')}".`}
            />
          </TabsContent>
        </Tabs>
      </div>

      <div className="mt-auto border-t border-border p-4">
        <EmptyState
          icon={MousePointerClick}
          title="Nothing selected"
          description="Click any element in the preview to inspect it here."
          className="py-4"
        />
      </div>
    </aside>
  )
}

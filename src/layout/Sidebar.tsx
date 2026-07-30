import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, ChevronsLeft, Image, ListTree } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import type { Project } from '@/types'

interface SidebarProps {
  project: Project
}

const NAV_SECTIONS = [
  { id: 'chapters', label: 'Chapters', icon: ListTree },
  { id: 'assets', label: 'Assets', icon: Image },
] as const

/** Left column of the three-column shell: project navigation. */
export function Sidebar({ project }: SidebarProps) {
  const navigate = useNavigate()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  if (collapsed) return null

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 shrink-0 items-center gap-1 px-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          aria-label="Back to Projects"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="truncate text-sm font-medium text-text-primary">{project.name}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={toggleSidebar}
          aria-label="Collapse sidebar"
        >
          <ChevronsLeft className="size-4" />
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 pt-1">
        {NAV_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={cn(
              'flex items-center gap-2.5 rounded-[var(--radius-button)] px-2.5 py-2 text-left text-sm font-medium text-text-secondary',
              'transition-colors duration-150 hover:bg-hover hover:text-text-primary',
            )}
          >
            <section.icon className="size-4" strokeWidth={2} />
            {section.label}
          </button>
        ))}
      </nav>

      <div className="mt-2 flex-1 overflow-y-auto px-1">
        <EmptyState
          icon={BookOpen}
          title="No chapters yet"
          description="Import a manuscript to start building your book."
          className="py-12"
        />
      </div>
    </aside>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronsLeft, ImagePlus, Pencil, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/uiStore'
import { useContentStore } from '@/store/contentStore'
import { EMPTY_ASSETS, useAssetStore } from '@/store/assetStore'
import { removeAssetWithHistory, renameChapterWithHistory } from '@/store/editorActions'
import { useSelectionStore } from '@/store/selectionStore'
import { useDragStore } from '@/store/dragStore'
import { ASSET_DRAG_MIME } from '@/layout/dragTypes'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/common/EmptyState'
import { BookOpen, Image as ImageIcon } from 'lucide-react'
import type { Project } from '@/types'

interface SidebarProps {
  project: Project
}

/** Left column of the three-column shell: chapter navigation + asset library. */
export function Sidebar({ project }: SidebarProps) {
  const navigate = useNavigate()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const selectedChapterId = useSelectionStore((s) => s.selectedChapterId)
  const requestScrollToChapter = useSelectionStore((s) => s.requestScrollToChapter)

  const [renamingChapterId, setRenamingChapterId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')

  const startRename = (chapterId: string, currentTitle: string) => {
    setTitleDraft(currentTitle)
    setRenamingChapterId(chapterId)
  }

  const commitRename = (chapterId: string, fallback: string) => {
    renameChapterWithHistory(project.id, chapterId, titleDraft.trim() || fallback)
    setRenamingChapterId(null)
  }

  const assets = useAssetStore((s) => s.byProject[project.id] ?? EMPTY_ASSETS)
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  const loadAssets = useAssetStore((s) => s.loadAssets)
  const importFiles = useAssetStore((s) => s.importFiles)
  const startDraggingAsset = useDragStore((s) => s.startDraggingAsset)
  const stopDraggingAsset = useDragStore((s) => s.stopDraggingAsset)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAssets(project.id)
  }, [project.id, loadAssets])

  if (collapsed) return null

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 shrink-0 items-center gap-1 px-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to Projects">
          <ArrowLeft className="size-4" />
        </Button>
        <span className="truncate text-sm font-medium text-text-primary">{project.name}</span>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={toggleSidebar} aria-label="Collapse sidebar">
          <ChevronsLeft className="size-4" />
        </Button>
      </div>

      <Tabs defaultValue="chapters" className="flex min-h-0 flex-1 flex-col px-3">
        <TabsList className="w-full">
          <TabsTrigger value="chapters" className="flex-1">Chapters</TabsTrigger>
          <TabsTrigger value="assets" className="flex-1">Assets</TabsTrigger>
        </TabsList>

        <TabsContent value="chapters" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            {!manuscript || manuscript.chapters.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No chapters yet"
                description="Import a manuscript to start building your book."
                className="py-12"
              />
            ) : (
              <nav className="flex flex-col gap-0.5 py-1">
                {manuscript.chapters.map((chapter, i) =>
                  renamingChapterId === chapter.id ? (
                    <div key={chapter.id} className="flex items-center gap-2.5 px-2.5 py-1.5">
                      <span className="text-xs tabular-nums text-text-muted">{i + 1}</span>
                      <input
                        autoFocus
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onBlur={() => commitRename(chapter.id, chapter.title)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            ;(e.currentTarget as HTMLInputElement).blur()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setRenamingChapterId(null)
                          }
                        }}
                        className="min-w-0 flex-1 rounded-[var(--radius-button)] border border-[var(--color-warning)] bg-panel px-1.5 py-0.5 text-sm text-text-primary outline-none"
                      />
                    </div>
                  ) : (
                    <div
                      key={chapter.id}
                      className={cn(
                        'group flex items-center gap-2.5 rounded-[var(--radius-button)] px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150',
                        selectedChapterId === chapter.id
                          ? 'bg-selection text-text-primary'
                          : 'text-text-secondary hover:bg-hover hover:text-text-primary',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => requestScrollToChapter(chapter.id)}
                        onDoubleClick={() => startRename(chapter.id, chapter.title)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <span className="text-xs tabular-nums text-text-muted">{i + 1}</span>
                        <span className="truncate">{chapter.title}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startRename(chapter.id, chapter.title)}
                        aria-label={`Rename ${chapter.title}`}
                        className="shrink-0 rounded-sm p-0.5 text-text-muted opacity-0 transition-opacity duration-150 hover:text-text-primary group-hover:opacity-100"
                      >
                        <Pencil className="size-3" />
                      </button>
                    </div>
                  ),
                )}
              </nav>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="assets" className="flex min-h-0 flex-1 flex-col">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) importFiles(project.id, files)
              e.target.value = ''
            }}
          />
          <Button variant="secondary" size="sm" className="mb-2 gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="size-3.5" />
            Add Images
          </Button>
          <ScrollArea className="h-full flex-1">
            {assets.length === 0 ? (
              <EmptyState icon={ImageIcon} title="No images yet" description="Add illustrations for your book." className="py-10" />
            ) : (
              <div className="grid grid-cols-2 gap-2 pb-3">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(ASSET_DRAG_MIME, asset.id)
                      e.dataTransfer.effectAllowed = 'copy'
                      startDraggingAsset(asset.id)
                    }}
                    onDragEnd={() => stopDraggingAsset()}
                    className="group relative aspect-square cursor-grab overflow-hidden rounded-[var(--radius-image)] border border-border active:cursor-grabbing"
                    title="Drag onto a page to place this image"
                  >
                    {getObjectUrl(asset.id) && (
                      <img src={getObjectUrl(asset.id)} alt={asset.name} className="size-full object-cover" draggable={false} />
                    )}
                    <button
                      type="button"
                      onClick={() => removeAssetWithHistory(project.id, asset.id)}
                      aria-label={`Delete ${asset.name}`}
                      className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  )
}

import { useContentStore } from '@/store/contentStore'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { EMPTY_NOTES, useNotesStore } from '@/store/notesStore'
import { EMPTY_ASSETS, useAssetStore } from '@/store/assetStore'
import { EMPTY_LAYER0_BIBLE, useLayer0Store } from '@/store/layer0Store'
import { EMPTY_IDEAS, useIdeaStore } from '@/store/ideaStore'
import { useCustomThemeStore } from '@/store/customThemeStore'
import { getAssetBlob } from '@/store/assetDb'
import type { ProjectFileSource } from '@/projectFile/exportProjectFile'
import type { Project } from '@/types'

/**
 * Everything that belongs in a `.bookstudio` file, gathered from the stores
 * that own each piece.
 *
 * Read imperatively via `getState()` rather than through hooks, because two
 * callers need it and only one of them is a component: the "Save project
 * file" action (`useExportProjectFile`) and the automatic backup
 * (`useAutoBackup`), which fires from an interval with no render in sight.
 *
 * Having exactly one of these matters more than it looks. A backup that
 * quietly bundles less than a manual save is worse than no backup, and the
 * way that happens is somebody adding a store to one list and not the
 * other months later. There is one list.
 */
export function readProjectFileSource(project: Project): ProjectFileSource {
  const manuscript = useContentStore.getState().getManuscript(project.id)
  const customThemes = useCustomThemeStore.getState().customThemes

  return {
    project,
    manuscript: manuscript ?? { chapters: [], importedAt: new Date().toISOString(), sourceFileName: '' },
    structuralPages: useStructuralPageStore.getState().byProject[project.id] ?? [...EMPTY_STRUCTURAL_PAGES],
    notes: useNotesStore.getState().byProject[project.id] ?? [...EMPTY_NOTES],
    customTheme: customThemes.find((t) => t.id === project.settings.themeId) ?? null,
    assets: useAssetStore.getState().byProject[project.id] ?? [...EMPTY_ASSETS],
    getAssetBlob,
    layer0Bible: useLayer0Store.getState().byProject[project.id] ?? EMPTY_LAYER0_BIBLE,
    ideas: useIdeaStore.getState().byProject[project.id] ?? [...EMPTY_IDEAS],
  }
}

/** The file name a project saves under, in both paths. */
export function projectFileName(project: Project, extension: string): string {
  return `${project.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'book'}${extension}`
}

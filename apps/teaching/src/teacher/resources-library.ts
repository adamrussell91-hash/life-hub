import type { Media, MediaFolder, MediaUsage } from '@/schemas';
import type { CurriculumResponse } from '@/teacher/nav';

/** Which slice of the Resource Library is showing. */
export type LibraryView =
  | { kind: 'all' }
  | { kind: 'unfiled' }
  | { kind: 'unused' }
  | { kind: 'by-unit' }
  | { kind: 'outcomes' }
  | { kind: 'skills' }
  | { kind: 'morphemic' }
  | { kind: 'folder'; id: string };

export interface UsedInLink {
  kind: 'lesson' | 'unit' | 'class';
  id: string;
  label: string;
  href: string;
}

export interface UnitGroup {
  unitId: string | null;
  title: string;
  classTitles: string[];
  media: Media[];
}

const EMPTY_USAGE: MediaUsage = { lesson_ids: [], unit_ids: [], class_ids: [] };

export function newFolderId(): string {
  return `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function folderChildren(folders: ReadonlyArray<MediaFolder>, parentId: string | null): MediaFolder[] {
  return folders
    .filter((folder) => (folder.parent_id ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Root-first chain of folders ending at `id`. */
export function folderPath(folders: ReadonlyArray<MediaFolder>, id: string): MediaFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: MediaFolder[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path;
}

/** `id` and every folder nested under it. */
export function folderAndDescendantIds(folders: ReadonlyArray<MediaFolder>, id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** A resource whose folder was deleted elsewhere counts as Unfiled, not lost. */
export function effectiveFolderId(entry: Media, folders: ReadonlyArray<MediaFolder>): string | null {
  const id = entry.folder_id ?? null;
  return id && folders.some((folder) => folder.id === id) ? id : null;
}

export function usageFor(entry: Media, curriculum: CurriculumResponse): MediaUsage {
  return curriculum.media_usage?.[entry.id] ?? EMPTY_USAGE;
}

export function isUsed(entry: Media, curriculum: CurriculumResponse): boolean {
  const usage = usageFor(entry, curriculum);
  return usage.lesson_ids.length + usage.unit_ids.length + usage.class_ids.length > 0;
}

/** Count of resources in a folder, including its subfolders. */
export function folderItemCount(
  media: ReadonlyArray<Media>,
  folders: ReadonlyArray<MediaFolder>,
  id: string
): number {
  const ids = folderAndDescendantIds(folders, id);
  return media.filter((entry) => {
    const folderId = effectiveFolderId(entry, folders);
    return folderId !== null && ids.has(folderId);
  }).length;
}

/** Resources for a flat view. A folder view shows only what sits directly in that folder. */
export function mediaForView(
  media: ReadonlyArray<Media>,
  view: LibraryView,
  curriculum: CurriculumResponse
): Media[] {
  const folders = curriculum.media_folders ?? [];
  switch (view.kind) {
    case 'all':
    case 'by-unit':
      return [...media];
    case 'unfiled':
      return media.filter((entry) => effectiveFolderId(entry, folders) === null);
    case 'unused':
      return media.filter((entry) => !isUsed(entry, curriculum));
    case 'folder':
      return media.filter((entry) => effectiveFolderId(entry, folders) === view.id);
    case 'outcomes':
    case 'skills':
    case 'morphemic':
      return [];
  }
}

/** Unit ids a resource reaches: units it sits on directly plus the units of its lessons. */
function unitIdsFor(entry: Media, curriculum: CurriculumResponse): string[] {
  const usage = usageFor(entry, curriculum);
  const ids = new Set(usage.unit_ids);
  for (const lessonId of usage.lesson_ids) {
    const lesson = curriculum.lessons.find((row) => row.id === lessonId);
    const owner =
      lesson?.unit_id ?? curriculum.units.find((unit) => unit.lesson_ids.includes(lessonId))?.id;
    if (owner) ids.add(owner);
  }
  return [...ids];
}

/**
 * Used resources grouped by unit, each unit labelled with the classes teaching it.
 * A resource used in two units shows under both. Resources used only on a class page
 * land in a final "Class pages only" group; unused resources are left out.
 */
export function groupMediaByUnit(media: ReadonlyArray<Media>, curriculum: CurriculumResponse): UnitGroup[] {
  const groups = new Map<string, UnitGroup>();
  const classOnly: Media[] = [];
  for (const entry of media) {
    const unitIds = unitIdsFor(entry, curriculum);
    if (unitIds.length === 0) {
      if (usageFor(entry, curriculum).class_ids.length) classOnly.push(entry);
      continue;
    }
    for (const unitId of unitIds) {
      let group = groups.get(unitId);
      if (!group) {
        const unit = curriculum.units.find((row) => row.id === unitId);
        group = {
          unitId,
          title: unit?.title ?? 'Untitled unit',
          classTitles: curriculum.classes
            .filter((cls) => cls.status !== 'trashed')
            .filter((cls) => cls.active_unit_ids?.includes(unitId) || cls.current_unit_id === unitId)
            .map((cls) => cls.title),
          media: []
        };
        groups.set(unitId, group);
      }
      group.media.push(entry);
    }
  }
  const sorted = [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
  if (classOnly.length) {
    sorted.push({ unitId: null, title: 'Class pages only', classTitles: [], media: classOnly });
  }
  return sorted;
}

export function usedInLinks(entry: Media, curriculum: CurriculumResponse): UsedInLink[] {
  const usage = usageFor(entry, curriculum);
  const links: UsedInLink[] = [];
  for (const id of usage.lesson_ids) {
    const lesson = curriculum.lessons.find((row) => row.id === id);
    if (!lesson) continue;
    links.push({ kind: 'lesson', id, label: lesson.title || 'Untitled lesson', href: `/lessons/${id}` });
  }
  for (const id of usage.unit_ids) {
    const unit = curriculum.units.find((row) => row.id === id);
    if (!unit) continue;
    links.push({ kind: 'unit', id, label: unit.title || 'Untitled unit', href: `/units/${id}` });
  }
  for (const id of usage.class_ids) {
    const cls = curriculum.classes.find((row) => row.id === id);
    if (!cls) continue;
    links.push({ kind: 'class', id, label: cls.title || 'Untitled class', href: `/classes/${id}` });
  }
  return links;
}

/**
 * Deleting a folder never deletes resources: its subfolders and resources move up
 * to the deleted folder's parent (or to Unfiled at the top level).
 */
export function planFolderDelete(
  folders: ReadonlyArray<MediaFolder>,
  media: ReadonlyArray<Media>,
  id: string
): { folders: MediaFolder[]; moves: Array<{ mediaId: string; folderId: string | null }> } {
  const target = folders.find((folder) => folder.id === id);
  const parentId = target?.parent_id ?? null;
  return {
    folders: folders
      .filter((folder) => folder.id !== id)
      .map((folder) => (folder.parent_id === id ? { ...folder, parent_id: parentId } : folder)),
    moves: media
      .filter((entry) => entry.folder_id === id)
      .map((entry) => ({ mediaId: entry.id, folderId: parentId }))
  };
}

/** Indented folder choices for a "Move to" picker; Unfiled first. */
export function folderChoices(folders: ReadonlyArray<MediaFolder>): Array<{ value: string; label: string }> {
  const choices: Array<{ value: string; label: string }> = [{ value: '__unfiled', label: 'Unfiled' }];
  const walk = (parentId: string | null, depth: number): void => {
    for (const folder of folderChildren(folders, parentId)) {
      choices.push({ value: folder.id, label: `${'  '.repeat(depth)}${folder.name}` });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return choices;
}

export function sameView(a: LibraryView, b: LibraryView): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'folder' || (b.kind === 'folder' && a.id === b.id);
}

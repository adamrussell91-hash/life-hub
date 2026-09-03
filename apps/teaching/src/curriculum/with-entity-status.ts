import {
  applyArchive,
  applyRestoreFromTrash,
  applyTrash,
  type EntityStatus,
  type LifecycleFields
} from '@/recovery/lifecycle';
import type { CurriculumResponse } from '@/teacher/nav';

export type CurriculumEntityType = 'lesson' | 'unit' | 'class' | 'media';

function patchRow<T extends { id: string; status: string }>(
  row: T,
  status: EntityStatus
): T {
  const current = row as T & LifecycleFields;
  if (status === 'archived') {
    return applyArchive(current) as unknown as T;
  }
  if (status === 'trashed') {
    return applyTrash(current, new Date().toISOString()) as unknown as T;
  }
  return applyRestoreFromTrash(current) as unknown as T;
}

function patchCollection<T extends { id: string; status: string }>(
  list: T[],
  id: string,
  status: EntityStatus
): T[] {
  if (!list.some((row) => row.id === id)) return list;
  return list.map((row) => (row.id === id ? patchRow(row, status) : row));
}

export function readCurriculumEntityStatus(
  curriculum: CurriculumResponse,
  type: CurriculumEntityType,
  id: string
): EntityStatus | undefined {
  const row =
    type === 'lesson'
      ? curriculum.lessons.find((entry) => entry.id === id)
      : type === 'unit'
        ? curriculum.units.find((entry) => entry.id === id)
        : type === 'class'
          ? curriculum.classes.find((entry) => entry.id === id)
          : curriculum.media.find((entry) => entry.id === id);
  if (!row) return undefined;
  if (row.status === 'active' || row.status === 'archived' || row.status === 'trashed') {
    return row.status;
  }
  return undefined;
}

export function withEntityStatus(
  curriculum: CurriculumResponse,
  type: CurriculumEntityType,
  id: string,
  status: EntityStatus
): CurriculumResponse {
  switch (type) {
    case 'lesson':
      return { ...curriculum, lessons: patchCollection(curriculum.lessons, id, status) };
    case 'unit':
      return { ...curriculum, units: patchCollection(curriculum.units, id, status) };
    case 'class':
      return { ...curriculum, classes: patchCollection(curriculum.classes, id, status) };
    case 'media':
      return { ...curriculum, media: patchCollection(curriculum.media, id, status) };
  }
}

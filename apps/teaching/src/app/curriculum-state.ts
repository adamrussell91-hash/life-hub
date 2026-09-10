import { withCreatedEntity } from '@/curriculum/with-created-entity';
import { withScheduledUnit } from '@/curriculum/with-scheduled-unit';
import {
  readCurriculumEntityStatus,
  withEntityStatus,
  type CurriculumEntityType
} from '@/curriculum/with-entity-status';
import type { CreateKind, CreatedRecord } from '@/teacher/create/types';
import { fetchCurriculum, type CurriculumResponse } from '@/teacher/nav';
import type { Class, Media, ScheduledLesson } from '@/schemas';
import type { EntityStatus } from '@/recovery/lifecycle';
import { createCurriculumCache } from './curriculum-cache';

type StatusKey = `${CurriculumEntityType}:${string}`;

const curriculumCache = createCurriculumCache(fetchCurriculum);

const pendingCreates: Array<{ kind: CreateKind; entity: CreatedRecord }> = [];
const pendingMedia: Media[] = [];
const pendingStatuses = new Map<StatusKey, EntityStatus>();

function statusKey(type: CurriculumEntityType, id: string): StatusKey {
  return `${type}:${id}`;
}

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  if (list.some((entry) => entry.id === row.id)) {
    return list.map((entry) => (entry.id === row.id ? row : entry));
  }
  return [...list, row];
}

function collectionHas(curriculum: CurriculumResponse, kind: CreateKind, id: string): boolean {
  switch (kind) {
    case 'class':
      return curriculum.classes.some((entry) => entry.id === id);
    case 'unit':
      return curriculum.units.some((entry) => entry.id === id);
    case 'subject':
      return curriculum.subjects.some((entry) => entry.id === id);
    case 'lesson':
      return curriculum.lessons.some((entry) => entry.id === id);
    case 'scope_sequence':
      return curriculum.scope_sequences.some((entry) => entry.id === id);
  }
}

function applyPending(curriculum: CurriculumResponse): CurriculumResponse {
  let next = curriculum;
  for (const seed of pendingCreates) {
    next = withCreatedEntity(next, seed.kind, seed.entity);
  }
  for (const media of pendingMedia) {
    next = { ...next, media: upsertById(next.media, media) };
  }
  for (const [key, status] of pendingStatuses) {
    const [type, id] = key.split(':') as [CurriculumEntityType, string];
    const current = readCurriculumEntityStatus(next, type, id);
    if (!current) {
      if (status === 'trashed' || status === 'archived') continue;
      continue;
    }
    if (current !== status) {
      next = withEntityStatus(next, type, id, status);
    }
  }
  return next;
}

function prunePending(curriculum: CurriculumResponse): void {
  for (let index = pendingCreates.length - 1; index >= 0; index -= 1) {
    const seed = pendingCreates[index];
    if (seed && collectionHas(curriculum, seed.kind, seed.entity.id)) {
      pendingCreates.splice(index, 1);
    }
  }
  for (let index = pendingMedia.length - 1; index >= 0; index -= 1) {
    const media = pendingMedia[index];
    if (media && curriculum.media.some((entry) => entry.id === media.id)) {
      pendingMedia.splice(index, 1);
    }
  }
  for (const [key, status] of [...pendingStatuses]) {
    const [type, id] = key.split(':') as [CurriculumEntityType, string];
    const current = readCurriculumEntityStatus(curriculum, type, id);
    if (!current || current === status) {
      pendingStatuses.delete(key);
    }
  }
}

export function peekCurriculum(): CurriculumResponse | undefined {
  return curriculumCache.peek();
}

export function replaceCurriculum(curriculum: CurriculumResponse): void {
  curriculumCache.replace(curriculum);
}

export function invalidateCurriculum(): void {
  curriculumCache.invalidate();
}

export function getCurriculum(): Promise<CurriculumResponse> {
  return curriculumCache.get();
}

export function readEntityStatus(
  type: CurriculumEntityType,
  id: string
): EntityStatus | undefined {
  const current = curriculumCache.peek();
  return current ? readCurriculumEntityStatus(current, type, id) : undefined;
}

export function applyCreatedEntity(
  kind: CreateKind,
  entity: CreatedRecord
): CurriculumResponse | undefined {
  pendingCreates.push({ kind, entity });
  const current = curriculumCache.peek();
  if (!current) return undefined;
  const next = withCreatedEntity(current, kind, entity);
  curriculumCache.replace(next);
  return next;
}

export function applyCreatedMedia(media: Media): CurriculumResponse | undefined {
  pendingMedia.push(media);
  const current = curriculumCache.peek();
  if (!current) return undefined;
  const next = { ...current, media: upsertById(current.media, media) };
  curriculumCache.replace(next);
  return next;
}

export function applyEntityStatus(
  type: CurriculumEntityType,
  id: string,
  status: EntityStatus
): CurriculumResponse | undefined {
  pendingStatuses.set(statusKey(type, id), status);
  const current = curriculumCache.peek();
  if (!current) return undefined;
  const next = withEntityStatus(current, type, id, status);
  curriculumCache.replace(next);
  return next;
}

export function applyScheduledUnitResult(result: {
  class: Class;
  scheduled_lessons: ScheduledLesson[];
}): CurriculumResponse | undefined {
  const current = curriculumCache.peek();
  if (!current) return undefined;
  const next = withScheduledUnit(current, result);
  curriculumCache.replace(next);
  return next;
}

export async function reconcileCurriculum(): Promise<CurriculumResponse> {
  const fresh = await fetchCurriculum();
  const merged = applyPending(fresh);
  prunePending(fresh);
  const next = applyPending(merged);
  curriculumCache.replace(next);
  return next;
}

export function resetCurriculumStateForTests(snapshot?: CurriculumResponse): void {
  pendingCreates.length = 0;
  pendingMedia.length = 0;
  pendingStatuses.clear();
  if (snapshot) {
    curriculumCache.replace(snapshot);
  } else {
    curriculumCache.invalidate();
  }
}

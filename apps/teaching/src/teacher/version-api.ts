import { apiGet, apiPost } from '@/api/client';
import type { Class, Lesson, Unit } from '@/schemas';
import type { VersionIndex, VersionKind, VersionRecord } from '@/schemas/version';

function versionsBase(kind: VersionKind, parentId: string): string {
  if (kind === 'lesson') return `/api/lessons/${parentId}/versions`;
  if (kind === 'unit') return `/api/units/${parentId}/versions`;
  return `/api/classes/${parentId}/versions`;
}

export function versionCollectionPath(kind: VersionKind, parentId: string): string {
  return versionsBase(kind, parentId);
}

export function versionItemPath(
  kind: VersionKind,
  parentId: string,
  revision: number
): string {
  return `${versionsBase(kind, parentId)}/${revision}`;
}

export function versionRestorePath(
  kind: VersionKind,
  parentId: string,
  revision: number
): string {
  return `${versionsBase(kind, parentId)}/${revision}/restore`;
}

export function listVersions(kind: VersionKind, parentId: string): Promise<VersionIndex> {
  return apiGet(versionCollectionPath(kind, parentId));
}

export function getVersion(
  kind: VersionKind,
  parentId: string,
  revision: number
): Promise<VersionRecord> {
  return apiGet(versionItemPath(kind, parentId, revision));
}

export function createCheckpoint(
  kind: VersionKind,
  parentId: string,
  label?: string
): Promise<VersionRecord> {
  return apiPost(versionCollectionPath(kind, parentId), label ? { label } : {});
}

export function restoreVersion(
  kind: VersionKind,
  parentId: string,
  revision: number
): Promise<unknown> {
  return apiPost(versionRestorePath(kind, parentId, revision), {});
}

export function listLessonVersions(id: string): Promise<VersionIndex> {
  return listVersions('lesson', id);
}

export function getLessonVersion(id: string, revision: number): Promise<VersionRecord> {
  return getVersion('lesson', id, revision);
}

export function createLessonCheckpoint(id: string, label?: string): Promise<VersionRecord> {
  return createCheckpoint('lesson', id, label);
}

export function restoreLessonVersion(id: string, revision: number): Promise<Lesson> {
  return restoreVersion('lesson', id, revision) as Promise<Lesson>;
}

export function listUnitVersions(id: string): Promise<VersionIndex> {
  return listVersions('unit', id);
}

export function getUnitVersion(id: string, revision: number): Promise<VersionRecord> {
  return getVersion('unit', id, revision);
}

export function createUnitCheckpoint(id: string, label?: string): Promise<VersionRecord> {
  return createCheckpoint('unit', id, label);
}

export function restoreUnitVersion(id: string, revision: number): Promise<Unit> {
  return restoreVersion('unit', id, revision) as Promise<Unit>;
}

export function listClassVersions(id: string): Promise<VersionIndex> {
  return listVersions('class_homepage', id);
}

export function getClassVersion(id: string, revision: number): Promise<VersionRecord> {
  return getVersion('class_homepage', id, revision);
}

export function createClassCheckpoint(id: string, label?: string): Promise<VersionRecord> {
  return createCheckpoint('class_homepage', id, label);
}

export function restoreClassVersion(id: string, revision: number): Promise<Class> {
  return restoreVersion('class_homepage', id, revision) as Promise<Class>;
}

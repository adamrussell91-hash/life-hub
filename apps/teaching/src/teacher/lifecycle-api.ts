import { apiDelete, apiGet, apiPatch, apiPost, ApiClientError } from '@/api/client';
import {
  applyEntityStatus,
  readEntityStatus
} from '@/app/curriculum-state';
import type { CurriculumEntityType } from '@/curriculum/with-entity-status';
import type { DependencyHit } from '@/recovery/dependencies';
import type { EntityStatus } from '@/recovery/lifecycle';

export type LifecycleEntityType =
  | 'lesson'
  | 'unit'
  | 'class'
  | 'media'
  | 'lesson_template'
  | 'unit_template'
  | 'composition';

export type TrashSummary = {
  type: LifecycleEntityType;
  id: string;
  title: string;
  trashed_at?: string;
  previous_status?: 'active' | 'archived';
};

const TYPE_TO_COLLECTION: Record<LifecycleEntityType, string> = {
  lesson: 'lessons',
  unit: 'units',
  class: 'classes',
  media: 'media',
  lesson_template: 'lesson-templates',
  unit_template: 'unit-templates',
  composition: 'compositions'
};

export function entityPath(type: LifecycleEntityType, id: string): string {
  return `/api/${TYPE_TO_COLLECTION[type]}/${id}`;
}

export function restoreFromTrashPath(type: LifecycleEntityType, id: string): string {
  return `${entityPath(type, id)}/restore-from-trash`;
}

export function dependenciesPath(type: LifecycleEntityType, id: string): string {
  return `${entityPath(type, id)}/dependencies`;
}

export function patchStatus(path: string, status: EntityStatus): Promise<unknown> {
  return apiPatch(path, { status });
}

export function listTrash(): Promise<TrashSummary[]> {
  return apiGet<TrashSummary[]>('/api/trash');
}

export function restoreFromTrash(type: LifecycleEntityType, id: string): Promise<unknown> {
  return apiPost(restoreFromTrashPath(type, id), {});
}

export function permanentDelete(
  type: LifecycleEntityType,
  id: string
): Promise<{ deleted: true }> {
  return apiDelete<{ deleted: true }>(entityPath(type, id));
}

export function getDependencies(
  type: LifecycleEntityType,
  id: string
): Promise<{ dependencies: DependencyHit[] }> {
  return apiGet<{ dependencies: DependencyHit[] }>(dependenciesPath(type, id));
}

export function formatDependencyList(deps: DependencyHit[]): string {
  return deps
    .map((dep) => {
      const label = dep.title?.trim() || dep.id;
      return `• ${label} — ${dep.detail}`;
    })
    .join('\n');
}

export function dependenciesFromError(error: unknown): DependencyHit[] {
  if (!(error instanceof ApiClientError)) return [];
  if (error.code !== 'conflict') return [];
  const details = error.details;
  if (typeof details !== 'object' || details === null) return [];
  const deps = (details as { dependencies?: unknown }).dependencies;
  return Array.isArray(deps) ? (deps as DependencyHit[]) : [];
}

function isCurriculumEntityType(type: LifecycleEntityType): type is CurriculumEntityType {
  return type === 'lesson' || type === 'unit' || type === 'class' || type === 'media';
}

function persistErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function persistStatusInBackground(
  type: LifecycleEntityType,
  id: string,
  status: EntityStatus,
  previous: EntityStatus | undefined,
  onApplied: (() => void) | undefined,
  fallback: string
): void {
  void Promise.resolve(patchStatus(entityPath(type, id), status)).catch((error: unknown) => {
    if (isCurriculumEntityType(type) && previous) {
      applyEntityStatus(type, id, previous);
    }
    onApplied?.();
    if (typeof window.alert === 'function') {
      window.alert(persistErrorMessage(error, fallback));
    }
  });
}

/**
 * Confirm, paint the change immediately, then persist in the background.
 * Returns true if the teacher confirmed.
 */
export function confirmAndTrash(
  type: LifecycleEntityType,
  id: string,
  title: string,
  onApplied?: () => void
): boolean {
  const ok = window.confirm(`Move “${title}” to trash?`);
  if (!ok) return false;

  const previous = isCurriculumEntityType(type) ? readEntityStatus(type, id) : undefined;
  if (isCurriculumEntityType(type)) {
    applyEntityStatus(type, id, 'trashed');
  }
  onApplied?.();
  persistStatusInBackground(
    type,
    id,
    'trashed',
    previous ?? 'active',
    onApplied,
    'Unable to move to trash.'
  );
  return true;
}

/**
 * Confirm, paint the change immediately, then persist in the background.
 * Returns true if the teacher confirmed.
 */
export function confirmAndArchive(
  type: LifecycleEntityType,
  id: string,
  title: string,
  onApplied?: () => void
): boolean {
  const ok = window.confirm(`Archive “${title}”?`);
  if (!ok) return false;

  const previous = isCurriculumEntityType(type) ? readEntityStatus(type, id) : undefined;
  if (isCurriculumEntityType(type)) {
    applyEntityStatus(type, id, 'archived');
  }
  onApplied?.();
  persistStatusInBackground(
    type,
    id,
    'archived',
    previous ?? 'active',
    onApplied,
    'Unable to archive.'
  );
  return true;
}

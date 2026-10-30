import { apiDelete, apiPatch, apiPost } from '@/api/client';
import type { CurriculumOutcome } from '@/schemas/outcome';
import type { Subject } from '@/schemas/subject';

export function createCustomOutcome(body: {
  subject_id: string;
  code: string;
  title: string;
  description: string;
  group?: string;
  short?: string;
}): Promise<CurriculumOutcome> {
  return apiPost('/api/outcomes', body);
}

export type OutcomePatch = Partial<Pick<CurriculumOutcome, 'code' | 'title' | 'description' | 'group' | 'short'>>;

export function patchOutcome(id: string, patch: OutcomePatch): Promise<CurriculumOutcome> {
  return apiPatch(`/api/outcomes/${encodeURIComponent(id)}`, patch);
}

export function deleteOutcome(id: string): Promise<{ id: string; deleted: true }> {
  return apiDelete(`/api/outcomes/${encodeURIComponent(id)}`);
}

/** Retags every lesson and unit carrying `id` with `into`, then deletes `id`. */
export function mergeOutcome(id: string, into: string): Promise<{ id: string; merged_into: string; retagged: number }> {
  return apiPost(`/api/outcomes/${encodeURIComponent(id)}/merge`, { into });
}

/** The subject's outcome_ids order is the order the library and picker show. */
export function saveOutcomeOrder(subjectId: string, outcomeIds: string[]): Promise<Subject> {
  return apiPatch(`/api/subjects/${encodeURIComponent(subjectId)}`, { outcome_ids: outcomeIds });
}

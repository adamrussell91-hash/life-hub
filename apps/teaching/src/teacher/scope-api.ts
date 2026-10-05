import { apiPatch } from '@/api/client';
import type { ScopeSequence, TimelineItem } from '@/schemas';
import { normalizeScopeTerms } from '@/scope/timeline-dates';

export async function patchScopeSequence(
  id: string,
  body: { timeline_items?: TimelineItem[]; outcome_ids?: string[] }
): Promise<ScopeSequence> {
  const scope = await apiPatch<ScopeSequence>(`/api/scope-sequences/${id}`, body);
  return { ...scope, terms: normalizeScopeTerms(scope.terms ?? []) };
}

import { apiDelete, apiPatch } from '@/api/client';
import type { KnowledgePlan, OutcomeClimbEntry, ScopeSequence, TimelineItem } from '@/schemas';
import { fillDefaultTermDates, normalizeScopeTerms } from '@/scope/timeline-dates';

export async function patchScopeSequence(
  id: string,
  body: { terms?: ScopeSequence['terms']; timeline_items?: TimelineItem[]; outcome_ids?: string[]; outcome_climb?: OutcomeClimbEntry[]; knowledge_plan?: KnowledgePlan }
): Promise<ScopeSequence> {
  const scope = await apiPatch<ScopeSequence>(`/api/scope-sequences/${id}`, body);
  return { ...scope, terms: fillDefaultTermDates(normalizeScopeTerms(scope.terms ?? []), scope.academic_year) };
}

export function deleteScopeSequence(id: string): Promise<{ deleted: true; id: string }> {
  return apiDelete<{ deleted: true; id: string }>(`/api/scope-sequences/${id}`);
}

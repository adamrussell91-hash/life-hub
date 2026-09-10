import { apiPatch } from '@/api/client';
import type { ScopeSequence, TimelineItem } from '@/schemas';

export function patchScopeSequence(
  id: string,
  body: { timeline_items?: TimelineItem[]; outcome_ids?: string[] }
): Promise<ScopeSequence> {
  return apiPatch(`/api/scope-sequences/${id}`, body);
}

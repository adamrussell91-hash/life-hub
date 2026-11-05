import { apiPatch } from '@/api/client';
import type { DeepUnderstanding } from '@/deep/schema';
import type { Block, Cover, Unit, WalkthruTie } from '@/schemas';

export function patchUnit(
  id: string,
  body: {
    title?: string;
    cover?: Cover | null;
    blocks?: Block[];
    description?: string;
    outcome_ids?: string[];
    deep_understandings?: DeepUnderstanding[];
    walkthru_ties?: WalkthruTie[];
  }
): Promise<Unit> {
  return apiPatch(`/api/units/${id}`, body);
}

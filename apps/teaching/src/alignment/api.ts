import { apiGet, apiPatch } from '@/api/client';
import type { Alignment, AlignmentPatch } from './schema';

export function fetchAlignment(): Promise<{ alignment: Alignment }> {
  return apiGet('/api/syllabus-alignment');
}

export function saveAlignmentPoint(patch: AlignmentPatch): Promise<{ alignment: Alignment }> {
  return apiPatch('/api/syllabus-alignment', patch);
}

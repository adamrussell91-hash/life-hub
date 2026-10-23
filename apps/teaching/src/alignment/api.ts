import { apiGet, apiPatch } from '@/api/client';
import type { Alignment, AlignmentPatch } from './schema';

export function fetchAlignment(): Promise<{ alignment: Alignment }> {
  return apiGet('/api/syllabus-alignment');
}

export function saveAlignmentPoint(patch: AlignmentPatch): Promise<{ alignment: Alignment }> {
  return apiPatch('/api/syllabus-alignment', patch);
}

let alignmentLoad: Promise<Alignment> | null = null;

/** The alignment, fetched once per page and shared by the maps, lesson pages and markbook that need it. */
export function loadAlignment(): Promise<Alignment> {
  alignmentLoad ??= fetchAlignment().then((r) => r.alignment);
  alignmentLoad.catch(() => { alignmentLoad = null; });
  return alignmentLoad;
}

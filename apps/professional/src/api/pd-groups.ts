import { apiGet, apiPatch, apiPost } from '@/api/client';
import type { PdGroupRecord } from '@/domain/types';

export function listPdGroups(options: { signal?: AbortSignal } = {}): Promise<{ groups: PdGroupRecord[] }> {
  return apiGet('/api/pd-groups', { signal: options.signal });
}

export function getPdGroup(id: string, options: { signal?: AbortSignal } = {}): Promise<{ group: PdGroupRecord }> {
  return apiGet(`/api/pd-groups?${new URLSearchParams({ id }).toString()}`, { signal: options.signal });
}

export function createPdGroup(
  body: { shape: 'series' | 'program'; title: string; provider?: string | null },
  options: { signal?: AbortSignal } = {}
): Promise<{ group: PdGroupRecord }> {
  return apiPost('/api/pd-groups', body, { signal: options.signal });
}

export function patchPdGroup(
  id: string,
  patch: { shape?: 'series' | 'program'; title?: string; provider?: string | null },
  options: { signal?: AbortSignal } = {}
): Promise<{ group: PdGroupRecord }> {
  return apiPatch(`/api/pd-groups?${new URLSearchParams({ id }).toString()}`, patch, { signal: options.signal });
}

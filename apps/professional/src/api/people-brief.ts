import { apiGet } from './client';
import type { PersonBrief } from '@/domain/types';

/** `GET /api/people/brief?id=<person id>` (Phase 3, Feature 3.1). */
export function fetchPersonBrief(id: string, options: { signal?: AbortSignal } = {}): Promise<PersonBrief> {
  const params = new URLSearchParams({ id });
  return apiGet<PersonBrief>(`/api/people/brief?${params.toString()}`, { signal: options.signal });
}

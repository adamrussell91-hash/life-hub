import { apiGet, apiPost } from './client';
import type { PersonBrief, PersonBriefGeneration } from '@/domain/types';

/** `GET /api/people/brief?id=<person id>` (Phase 3, Feature 3.1). */
export function fetchPersonBrief(id: string, options: { signal?: AbortSignal } = {}): Promise<PersonBrief> {
  const params = new URLSearchParams({ id });
  return apiGet<PersonBrief>(`/api/people/brief?${params.toString()}`, { signal: options.signal });
}

/**
 * `POST /api/people/brief?id=<person id>&action=generate` (Phase 3,
 * Feature 3.2). Generates "Since you last spoke" / "Talking points". May
 * reject with an `ApiClientError` whose `code` is `people_anthropic_unbound`
 * (503 — generation is not configured, an expected/common state in dev/test
 * environments without an API key bound) or `brief_generation_failed`
 * (502 — the model call or its output failed, retryable).
 */
export function generatePersonBrief(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<PersonBriefGeneration> {
  const params = new URLSearchParams({ id, action: 'generate' });
  return apiPost<PersonBriefGeneration>(`/api/people/brief?${params.toString()}`, undefined, {
    signal: options.signal
  });
}

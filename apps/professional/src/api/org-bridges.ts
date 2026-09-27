import { apiGet } from './client';

/**
 * Thin client for Compare bridges. The pure rule lives in
 * `netlify/functions/_shared/org-bridges.mjs`; when a Compare API is wired,
 * call it here. Until then, callers may import the shared module via the
 * handler once it exists — this wrapper keeps the W1 apiGet surface ready.
 */

export interface OrgBridge {
  kind: 'moved' | 'know_each_other' | 'met_at_event';
  person_a_id: string;
  person_b_id: string;
  org_a_ref: string;
  org_b_ref: string;
  number?: number;
  rule?: 1 | 2 | 3 | null;
  reason?: string | null;
  event_ref?: string | null;
}

export interface OrgBridgesPayload {
  bridges: OrgBridge[];
  hidden_count: number;
  hidden_label: string | null;
}

/** Optional future endpoint — keeps Compare client on apiGet (W1). */
export function fetchOrgBridges(
  organisationIds: string[],
  options: { signal?: AbortSignal } = {}
): Promise<OrgBridgesPayload> {
  const params = new URLSearchParams({ ids: organisationIds.join(',') });
  return apiGet(`/api/org-bridges?${params.toString()}`, { signal: options.signal });
}

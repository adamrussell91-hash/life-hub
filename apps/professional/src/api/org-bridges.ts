import { apiGet, apiPost } from './client';

/**
 * Thin client for Compare bridges. The pure rule lives in
 * `netlify/functions/_shared/org-bridges.mjs`.
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

/** Optional GET — empty until a server-side directory join exists. */
export function fetchOrgBridges(
  organisationIds: string[],
  options: { signal?: AbortSignal } = {}
): Promise<OrgBridgesPayload> {
  const params = new URLSearchParams({ ids: organisationIds.join(',') });
  return apiGet(`/api/org-bridges?${params.toString()}`, { signal: options.signal });
}

/** Evaluate bridges from a people/link payload (POST → buildOrgBridges). */
export function evaluateOrgBridges(
  body: Record<string, unknown>,
  options: { signal?: AbortSignal } = {}
): Promise<OrgBridgesPayload> {
  return apiPost('/api/org-bridges', body, { signal: options.signal });
}

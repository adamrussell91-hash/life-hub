import { apiGet, apiPatch, apiPost } from '@/api/client';

export interface UniversalLinkRecord {
  id: string;
  source_ref: string;
  target_ref: string;
  relationship_type: string;
  status: string;
  role?: string | null;
}

export interface UniversalLinkEntry {
  link: UniversalLinkRecord;
  endpoint?: {
    ref: string;
    kind: string;
    display_label: string;
    href?: string | null;
  };
  direction?: 'outgoing' | 'incoming';
}

export function listUniversalLinksForEntity(
  entityRef: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ outgoing: UniversalLinkEntry[]; incoming: UniversalLinkEntry[] }> {
  const params = new URLSearchParams({ entity_ref: entityRef });
  return apiGet(`/api/universal-links?${params.toString()}`, { signal: options.signal });
}

export function createUniversalLink(
  body: {
    source_ref: string;
    target_ref: string;
    relationship_type: string;
    role?: string | null;
  },
  options: { signal?: AbortSignal } = {}
): Promise<{ link: UniversalLinkRecord; created: boolean }> {
  return apiPost('/api/universal-links', body, { signal: options.signal });
}

export function endUniversalLink(
  id: string,
  body: { valid_to?: string | null } = {},
  options: { signal?: AbortSignal } = {}
): Promise<{ link: UniversalLinkRecord }> {
  const params = new URLSearchParams({ id, action: 'end' });
  return apiPatch(`/api/universal-links?${params.toString()}`, body, { signal: options.signal });
}

/**
 * Registry-controlled role editing: ends the current period and opens the
 * next one with the new role (server-side `changeRole`), so the prior role
 * stays queryable history rather than being overwritten in place.
 */
export function changeUniversalLinkRole(
  id: string,
  body: { role: string | null; changed_at: string },
  options: { signal?: AbortSignal } = {}
): Promise<{ ended: UniversalLinkRecord; created: UniversalLinkRecord }> {
  const params = new URLSearchParams({ id, action: 'change_role' });
  return apiPatch(`/api/universal-links?${params.toString()}`, body, { signal: options.signal });
}

export function createTask(
  body: { title: string; status?: string; domain?: string; priority?: string; kind?: string },
  options: { signal?: AbortSignal } = {}
): Promise<{ id: string; title: string }> {
  return apiPost('/api/tasks', body, { signal: options.signal });
}

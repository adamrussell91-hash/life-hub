import { apiGet, apiPatch, apiPost, ApiClientError } from './client';

export interface UniversalLinkRecord {
  id: string;
  source_ref: string;
  target_ref: string;
  relationship_type: string;
  status: string;
}

export interface UniversalLinkEndpoint {
  ref: string;
  kind: string;
  display_label: string;
  supporting_label?: string | null;
  href?: string | null;
}

export interface UniversalLinkEntry {
  link: UniversalLinkRecord;
  endpoint: UniversalLinkEndpoint;
}

export interface EntitySearchResult {
  ref: string;
  kind: string;
  display_label: string;
  supporting_label: string | null;
  href: string | null;
}

export function searchEntities(
  query: string,
  kinds: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ groups: Record<string, EntitySearchResult[]> }> {
  const params = new URLSearchParams({ q: query, kinds });
  return apiGet(`/api/entities/search?${params.toString()}`, { signal: options.signal });
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
  },
  options: { signal?: AbortSignal } = {}
): Promise<{ link: UniversalLinkRecord; created: boolean }> {
  return apiPost('/api/universal-links', body, { signal: options.signal });
}

export function suppressUniversalLink(
  linkId: string,
  reason = 'operator_requested',
  options: { signal?: AbortSignal } = {}
): Promise<{ link: UniversalLinkRecord }> {
  const params = new URLSearchParams({ id: linkId, action: 'suppress' });
  return apiPatch(`/api/universal-links?${params.toString()}`, { reason }, { signal: options.signal });
}

export { ApiClientError };

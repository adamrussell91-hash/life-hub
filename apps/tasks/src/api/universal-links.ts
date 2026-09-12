import { apiGet, apiPatch, apiPost, ApiClientError } from '@/api/client';

export interface UniversalLinkRecord {
  id: string;
  source_ref: string;
  target_ref: string;
  relationship_type: string;
  status: string;
  temporal_mode?: string;
  context_key?: string | null;
  occurred_at?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
}

export interface UniversalLinkEndpoint {
  ref: string;
  kind: string;
  display_label: string;
  supporting_label?: string | null;
  href?: string | null;
  lifecycle_status?: string | null;
  visibility?: string;
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
  lifecycle_status: string | null;
  visibility: string;
}

export function taskEntityRef(taskId: string): string {
  return `tasks:task:${taskId}`;
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
    context_key?: string | null;
    context_ref?: string | null;
    occurred_at?: string | null;
    valid_from?: string | null;
    metadata?: Record<string, unknown>;
  },
  options: { signal?: AbortSignal } = {}
): Promise<{ link: UniversalLinkRecord; created: boolean }> {
  return apiPost('/api/universal-links', body, { signal: options.signal });
}

export function endUniversalLink(
  linkId: string,
  validTo: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ link: UniversalLinkRecord }> {
  const params = new URLSearchParams({ id: linkId, action: 'end' });
  return apiPatch(`/api/universal-links?${params.toString()}`, { valid_to: validTo }, {
    signal: options.signal
  });
}

export function searchEntities(
  query: string,
  kinds: string,
  options: { signal?: AbortSignal; includeArchived?: boolean } = {}
): Promise<{ groups: Record<string, EntitySearchResult[]> }> {
  const params = new URLSearchParams({ q: query, kinds });
  if (options.includeArchived) params.set('include_archived', 'true');
  return apiGet(`/api/entities/search?${params.toString()}`, { signal: options.signal });
}

export function isLinkWriteIncompleteError(err: unknown): err is ApiClientError & {
  data?: { operation_id?: string; link_id?: string };
} {
  return err instanceof ApiClientError && err.code === 'link_write_incomplete';
}

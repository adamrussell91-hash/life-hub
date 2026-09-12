import { apiGet, apiPost } from '@/api/client';

export interface UniversalLinkRecord {
  id: string;
  source_ref: string;
  target_ref: string;
  relationship_type: string;
  status: string;
}

export interface UniversalLinkEntry {
  link: UniversalLinkRecord;
  endpoint?: {
    ref: string;
    kind: string;
    display_label: string;
  };
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

export function createTask(
  body: { title: string; status?: string; domain?: string; priority?: string; kind?: string },
  options: { signal?: AbortSignal } = {}
): Promise<{ id: string; title: string }> {
  return apiPost('/api/tasks', body, { signal: options.signal });
}

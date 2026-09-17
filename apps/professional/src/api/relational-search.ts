import { apiGet, apiPost } from './client';
import type {
  RelationalSearchFilters,
  RelationalSearchPlanResponse,
  RelationalSearchResponse,
  RelationshipRegistryResponse
} from '@/domain/types';

export interface RelationalSearchRequestOptions {
  signal?: AbortSignal;
}

/**
 * `GET /api/people/relational-search?organisation_ref=&role=&text=` —
 * Relational Search (Phase 3, Feature 3.3), layer 1. Empty/absent filters
 * are simply omitted from the query string rather than sent as `''` — the
 * server treats a missing param and an empty one identically, but omitting
 * keeps request URLs readable.
 */
export function searchRelationally(
  filters: RelationalSearchFilters,
  options: RelationalSearchRequestOptions = {}
): Promise<RelationalSearchResponse> {
  const params = new URLSearchParams();
  if (filters.organisation_ref) params.set('organisation_ref', filters.organisation_ref);
  if (filters.role) params.set('role', filters.role);
  if (filters.text) params.set('text', filters.text);
  return apiGet<RelationalSearchResponse>(`/api/people/relational-search?${params.toString()}`, {
    signal: options.signal
  });
}

/** `GET /api/relationship-registry` — reused here only to source the
 * `role` filter's dropdown options (`professional_relationship`'s
 * `allowed_roles`) from the single source of truth, rather than
 * hardcoding the enum client-side. */
export function fetchRelationshipRegistry(
  options: RelationalSearchRequestOptions = {}
): Promise<RelationshipRegistryResponse> {
  return apiGet<RelationshipRegistryResponse>('/api/relationship-registry', { signal: options.signal });
}

/**
 * `POST /api/people/relational-search?action=plan` (Phase 5, Layer 2).
 * May reject with an `ApiClientError` whose `code` is
 * `people_relational_search_nl_unbound` (503 — not configured, an
 * expected/common state in dev/test environments without an API key
 * bound) or `relational_search_nl_plan_failed` (502 — the model call or
 * its output failed, retryable).
 */
export function askRelationalSearchQuestion(
  question: string,
  options: RelationalSearchRequestOptions = {}
): Promise<RelationalSearchPlanResponse> {
  return apiPost<RelationalSearchPlanResponse>(
    '/api/people/relational-search?action=plan',
    { question },
    { signal: options.signal }
  );
}

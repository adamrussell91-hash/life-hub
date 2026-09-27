import { apiGet, apiPatch, apiPost } from './client';

export type OpportunityKind =
  | 'scholarship'
  | 'pd'
  | 'program'
  | 'role'
  | 'call_for_presenters'
  | 'grant'
  | 'event'
  | 'other';

export type OpportunityStatus = 'open' | 'interested' | 'applied' | 'dismissed' | 'expired';

export interface OpportunityRecord {
  id: string;
  organisation_ref: string;
  kind: OpportunityKind;
  title: string;
  summary: string | null;
  closes_on: string | null;
  closes_precision: 'day' | 'month' | 'none';
  closes_label?: string | null;
  url: string | null;
  sources: Array<{ ref: string | null; url: string | null; excerpt: string | null }>;
  found_by: 'adam' | 'sweep' | 'ann';
  status: OpportunityStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateOpportunityInput {
  organisation_ref: string;
  kind: OpportunityKind;
  title: string;
  summary?: string | null;
  closes_on?: string | null;
  closes_precision?: 'day' | 'month' | 'none';
  url?: string | null;
  sources?: OpportunityRecord['sources'];
  found_by?: 'adam' | 'sweep' | 'ann';
}

export function listOpportunities(
  options: {
    organisationRef?: string;
    status?: OpportunityStatus;
    signal?: AbortSignal;
  } = {}
): Promise<{ opportunities: OpportunityRecord[] }> {
  const params = new URLSearchParams();
  if (options.organisationRef) params.set('organisation_ref', options.organisationRef);
  if (options.status) params.set('status', options.status);
  const qs = params.toString();
  return apiGet(`/api/opportunities${qs ? `?${qs}` : ''}`, { signal: options.signal });
}

export function getOpportunity(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ opportunity: OpportunityRecord }> {
  const params = new URLSearchParams({ id });
  return apiGet(`/api/opportunities?${params.toString()}`, { signal: options.signal });
}

export function createOpportunity(
  body: CreateOpportunityInput,
  options: { signal?: AbortSignal } = {}
): Promise<{ opportunity: OpportunityRecord; created: boolean }> {
  return apiPost('/api/opportunities', body, { signal: options.signal });
}

export function patchOpportunity(
  id: string,
  patch: Partial<Pick<OpportunityRecord, 'status' | 'title' | 'summary' | 'closes_on' | 'closes_precision' | 'url' | 'kind'>>,
  options: { signal?: AbortSignal } = {}
): Promise<{ opportunity: OpportunityRecord }> {
  const params = new URLSearchParams({ id });
  return apiPatch(`/api/opportunities?${params.toString()}`, patch, { signal: options.signal });
}

export function dismissOpportunity(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ opportunity: OpportunityRecord }> {
  const params = new URLSearchParams({ id, action: 'dismiss' });
  return apiPatch(`/api/opportunities?${params.toString()}`, { status: 'dismissed' }, {
    signal: options.signal
  });
}

export function addOpportunityToApplications(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<{
  opportunity: OpportunityRecord;
  application_intent: unknown;
  application: unknown;
  created: boolean;
}> {
  const params = new URLSearchParams({ id, action: 'add_to_applications' });
  return apiPost(`/api/opportunities?${params.toString()}`, {}, { signal: options.signal });
}

/** Add to Events: creates a provider-linked event and marks the opportunity interested. */
export function addOpportunityToEvents(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<{
  opportunity: OpportunityRecord;
  event: unknown;
  created: boolean;
}> {
  const params = new URLSearchParams({ id, action: 'add_to_events' });
  return apiPost(`/api/opportunities?${params.toString()}`, {}, { signal: options.signal });
}

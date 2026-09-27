import { apiGet, apiPost } from './client';

export type OrganisationReadThreadKey =
  | 'real_power'
  | 'your_lines'
  | 'gaps'
  | 'culture'
  | 'drifting';

export interface OrganisationReadThread {
  key: OrganisationReadThreadKey;
  text: string;
  sources: Array<{ ref: string | null; url: string | null; excerpt: string | null }>;
  author: 'ann' | 'adam';
}

export interface OrganisationRead {
  organisation_ref: string;
  summary: string;
  threads: OrganisationReadThread[];
  generated_at: string | null;
  updated_at: string | null;
  status: string;
  error: string | null;
  adam_protected_keys?: string[];
}

export function fetchOrganisationRead(
  organisationRef: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ read: OrganisationRead }> {
  const params = new URLSearchParams({ organisation_ref: organisationRef });
  return apiGet(`/api/organisation-read?${params.toString()}`, { signal: options.signal });
}

export function runOrganisationReadNow(
  organisationRef: string,
  context?: Record<string, unknown>,
  options: { signal?: AbortSignal } = {}
): Promise<{
  read: OrganisationRead;
  created: boolean;
  request_preview?: { has_structure: boolean; membership_count: number };
}> {
  return apiPost(
    '/api/organisation-read?action=run_now',
    { organisation_ref: organisationRef, context },
    { signal: options.signal }
  );
}

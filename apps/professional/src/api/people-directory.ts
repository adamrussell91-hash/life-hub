import { apiGet, apiPatch, apiPost } from './client';

export interface DirectoryPersonRow {
  id: string;
  ref: string;
  display_name: string;
  initials: string;
  role_line: string;
  relationship_roles: Array<{ role: string; label: string; current: boolean }>;
  organisation: {
    ref: string;
    display_name: string;
    monogram: string;
    logo_key: string | null;
    current: boolean;
  } | null;
  organisations: Array<{
    ref: string;
    display_name: string;
    monogram: string;
    logo_key: string | null;
    current: boolean;
  }>;
  warmth: number;
  warmth_band: 'warm' | 'cooling' | 'cold';
  relationship_state: string;
  relationship_reasons: string[];
  open_item_count: number;
  you_owe_count: number;
  they_owe_count: number;
  next_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectoryOrganisation {
  ref: string;
  id: string | null;
  display_name: string;
  logo_key: string | null;
  monogram: string;
  current: boolean;
}

export interface PeopleDirectoryResponse {
  people: DirectoryPersonRow[];
  organisations: DirectoryOrganisation[];
  counts: { people: number; organisations: number };
}

export function fetchPeopleDirectory(options: { signal?: AbortSignal } = {}): Promise<PeopleDirectoryResponse> {
  return apiGet<PeopleDirectoryResponse>('/api/people/directory', { signal: options.signal });
}

export interface UpdateOrganisationInput {
  display_name?: string;
  legal_name?: string | null;
  aliases?: string[];
  logo_key?: string | null;
}

export function updateOrganisation(
  ref: string,
  patch: UpdateOrganisationInput,
  options: { signal?: AbortSignal } = {}
): Promise<unknown> {
  const params = new URLSearchParams({ ref, action: 'update' });
  return apiPatch(`/api/entities?${params.toString()}`, patch, { signal: options.signal });
}

export interface CrestSignResponse {
  put_url: string;
  attachment: { id: string; kind: string; r2_key: string; filename: string; content_type: string };
}

export function signOrgCrest(
  body: { organisation_id: string; filename: string; content_type: string; byte_size: number },
  options: { signal?: AbortSignal } = {}
): Promise<CrestSignResponse> {
  return apiPost<CrestSignResponse>('/api/organisations/crest-sign', body, { signal: options.signal });
}

export async function uploadSignedCrest(putUrl: string, file: Blob, contentType: string): Promise<void> {
  const res = await fetch(putUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType }
  });
  if (!res.ok) throw new Error(`Crest upload failed (${res.status})`);
}

export function fetchOrgCrestUrl(
  ref: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ url: string | null; logo_key: string | null }> {
  const params = new URLSearchParams({ ref });
  return apiGet(`/api/organisations/crest?${params.toString()}`, { signal: options.signal });
}

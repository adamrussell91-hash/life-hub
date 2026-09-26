import { apiGet, apiPatch, apiPost } from './client';
import type { WarmthBand } from '@/domain/warmth-score';
import type { RelationshipChip } from '@/domain/organisation-model';
import type { ArcPoint } from '@/domain/relationship-arc';
import type { OrganisationTimelineLane } from '@/domain/organisation-model';

export interface DirectoryOrganisationRow {
  id: string;
  ref: string;
  display_name: string;
  legal_name: string | null;
  logo_key: string | null;
  monogram: string;
  chips: RelationshipChip[];
  people_count: number;
  people: Array<{
    id: string;
    display_name: string;
    warmth_band: WarmthBand;
    warmth: number;
    first_link_at: string | null;
  }>;
  warmth_spread: { warm: number; cooling: number; cold: number; total: number };
  arc_points: ArcPoint[];
  is_current_workplace: boolean;
  first_touch_at: string | null;
  last_activity_at: string | null;
  timeline_lanes: OrganisationTimelineLane[];
  created_at: string;
  updated_at: string;
}

export interface OrganisationsDirectoryResponse {
  organisations: DirectoryOrganisationRow[];
  counts: { organisations: number; people: number };
}

export function fetchOrganisationsDirectory(
  options: { signal?: AbortSignal } = {}
): Promise<OrganisationsDirectoryResponse> {
  return apiGet<OrganisationsDirectoryResponse>('/api/organisations/directory', {
    signal: options.signal
  });
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

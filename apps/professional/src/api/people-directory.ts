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
  warmth_tier?: string;
  warmth_feed_note?: string;
  relationship_state: string;
  relationship_reasons: string[];
  open_item_count: number;
  you_owe_count: number;
  they_owe_count: number;
  pending_proposal_count?: number;
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

export interface LinkProposal {
  id: string;
  chip_label: string;
  reason: string;
  status: string;
  person_ref: string;
  proposed_link?: unknown;
  sources?: Array<{ ref: string | null; excerpt: string }>;
}

export function fetchLinkProposals(
  personRef: string,
  options: { signal?: AbortSignal; status?: string } = {}
): Promise<{ proposals: LinkProposal[]; count: number }> {
  const params = new URLSearchParams({ person_ref: personRef });
  if (options.status) params.set('status', options.status);
  return apiGet(`/api/people/link-proposals?${params.toString()}`, { signal: options.signal });
}

export function runLinkInference(options: { signal?: AbortSignal } = {}): Promise<{
  created: number;
  skipped: number;
  proposals: LinkProposal[];
}> {
  return apiPost('/api/people/link-proposals', { action: 'infer' }, { signal: options.signal });
}

export function acceptLinkProposal(id: string, options: { signal?: AbortSignal } = {}): Promise<unknown> {
  return apiPost('/api/people/link-proposals', { action: 'accept', id }, { signal: options.signal });
}

export function declineLinkProposal(id: string, options: { signal?: AbortSignal } = {}): Promise<unknown> {
  return apiPost('/api/people/link-proposals', { action: 'decline', id }, { signal: options.signal });
}

export interface LedgerResponse {
  you_owe: Array<{
    id: string;
    text: string;
    source_label?: string;
    sources?: Array<{ ref: string | null; excerpt: string }>;
    task_ref?: string | null;
    derived?: boolean;
    author?: string;
    status?: string;
    href?: string | null;
  }>;
  they_owe: Array<{
    id: string;
    text: string;
    source_label?: string;
    sources?: Array<{ ref: string | null; excerpt: string }>;
    task_ref?: string | null;
    derived?: boolean;
    author?: string;
    status?: string;
    href?: string | null;
  }>;
  you_owe_count: number;
  they_owe_count: number;
  open_item_count: number;
}

export function fetchPersonLedger(
  personRef: string,
  options: { signal?: AbortSignal } = {}
): Promise<LedgerResponse> {
  const params = new URLSearchParams({ person_ref: personRef });
  return apiGet(`/api/people/ledger?${params.toString()}`, { signal: options.signal });
}

export function runClareLedgerScan(
  body: { person_ref: string; display_name?: string },
  options: { signal?: AbortSignal } = {}
): Promise<{ created: unknown[]; count: number; note: string }> {
  return apiPost('/api/people/ledger', { action: 'clare_scan', ...body }, { signal: options.signal });
}

export function patchLedgerItem(
  body: { id: string; text?: string; direction?: string; status?: string },
  options: { signal?: AbortSignal } = {}
): Promise<unknown> {
  return apiPost('/api/people/ledger', { action: 'patch', ...body }, { signal: options.signal });
}

export interface RememberFact {
  id: string;
  text: string;
  source_label: string;
  author: string;
  status: string;
  sort_order: number;
}

export function fetchRememberFacts(
  personRef: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ facts: RememberFact[]; count: number }> {
  const params = new URLSearchParams({ person_ref: personRef });
  return apiGet(`/api/people/remember?${params.toString()}`, { signal: options.signal });
}

export function runAnnRememberScan(
  body: { person_ref: string; display_name?: string },
  options: { signal?: AbortSignal } = {}
): Promise<{ facts: RememberFact[]; count: number; note: string }> {
  return apiPost('/api/people/remember', { action: 'run', ...body }, { signal: options.signal });
}

export function patchRememberFact(
  body: { id: string; text?: string; status?: string; sort_order?: number },
  options: { signal?: AbortSignal } = {}
): Promise<unknown> {
  return apiPost('/api/people/remember', { action: 'patch', ...body }, { signal: options.signal });
}

export interface AskResponse {
  mode: 'ask' | 'search';
  answer: string | null;
  people: Array<{
    id: string;
    ref: string;
    display_name: string;
    reason: string;
    source: string;
  }>;
  filter: { org?: string | null; role?: string | null; q?: string } | null;
  source: string;
}

export function askPeople(question: string, options: { signal?: AbortSignal } = {}): Promise<AskResponse> {
  return apiPost('/api/people/ask', { question }, { signal: options.signal });
}

export interface TodayStripResponse {
  day_key: string;
  slots: Array<{
    id: string;
    kind: string;
    title: string;
    start_minutes: number;
    end_minutes: number;
    start_label: string;
    people: Array<{ ref: string | null; display_name: string }>;
    suggested?: boolean;
    suggestion_note?: string | null;
  }>;
  suggestion: { slot_id: string | null; note: string; person_ref: string } | null;
}

export function fetchTodayStrip(
  options: {
    signal?: AbortSignal;
    person_ref?: string;
    display_name?: string;
    has_meet_item?: boolean;
  } = {}
): Promise<TodayStripResponse> {
  const params = new URLSearchParams();
  if (options.person_ref) params.set('person_ref', options.person_ref);
  if (options.display_name) params.set('display_name', options.display_name);
  if (options.has_meet_item) params.set('has_meet_item', '1');
  const q = params.toString();
  return apiGet(`/api/people/today${q ? `?${q}` : ''}`, { signal: options.signal });
}

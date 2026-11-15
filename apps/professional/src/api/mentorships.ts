import { apiGet, apiPatch, apiPost } from '@/api/client';

/** How the operator mentors someone. The badge on every card comes from this. */
export type MentorshipKind = 'accreditation' | 'halt_highly_accomplished' | 'halt_lead' | 'coaching' | 'other';
export type MentorshipStatus = 'active' | 'completed';

export const MENTORSHIP_KINDS: readonly MentorshipKind[] = [
  'accreditation',
  'halt_highly_accomplished',
  'halt_lead',
  'coaching',
  'other'
];

/** A mentorship without its two block lists, as the list endpoint returns it. */
export interface MentorshipSummary {
  schema_version: number;
  id: string;
  person_ref: string;
  kind: MentorshipKind;
  /** The operator's own short label, for coaching and other mentoring. */
  label: string | null;
  /** Whose crest an accreditation badge shows. */
  organisation_ref: string | null;
  focus: string | null;
  status: MentorshipStatus;
  /** `YYYY-MM-DD`. */
  started_on: string | null;
  completed_on: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
}

export interface Mentorship extends MentorshipSummary {
  /** Private notes. Never leave the hub. */
  blocks: unknown[];
  /** What the mentee's read-only page is built from. */
  shared_blocks: unknown[];
}

export type MentorshipFields = Partial<
  Pick<
    Mentorship,
    'kind' | 'label' | 'organisation_ref' | 'focus' | 'status' | 'started_on' | 'completed_on' | 'outcome' | 'blocks' | 'shared_blocks'
  >
>;

export interface MentorshipShare {
  token: string;
  created_at: string;
  updated_at: string;
}

/** What a publish left off the page, as the meeting share sheet reports it. */
export interface MentorshipLeftOff {
  blocks: number;
  promise_lines: number;
  minutes_sections: number;
  voice_unpublished: number;
}

export function listMentorships(options: { signal?: AbortSignal } = {}): Promise<{ mentorships: MentorshipSummary[] }> {
  return apiGet('/api/mentorships', { signal: options.signal });
}

export function getMentorshipForPerson(
  personRef: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ mentorship: Mentorship | null }> {
  const params = new URLSearchParams({ person_ref: personRef });
  return apiGet(`/api/mentorships?${params.toString()}`, { signal: options.signal });
}

export function createMentorship(
  body: MentorshipFields & { person_ref: string; kind: MentorshipKind }
): Promise<{ mentorship: Mentorship }> {
  return apiPost('/api/mentorships', body);
}

export function updateMentorship(id: string, body: MentorshipFields): Promise<{ mentorship: Mentorship }> {
  const params = new URLSearchParams({ id });
  return apiPatch(`/api/mentorships?${params.toString()}`, body);
}

export function loadMentorshipShare(
  mentorshipId: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ share: MentorshipShare | null }> {
  const params = new URLSearchParams({ mentorship_id: mentorshipId });
  return apiGet(`/api/mentorship-sheets?${params.toString()}`, { signal: options.signal });
}

export function publishMentorshipShare(
  mentorshipId: string,
  body: { title?: string; message?: string; from?: string } = {}
): Promise<{ share: MentorshipShare; left_off: MentorshipLeftOff }> {
  const params = new URLSearchParams({ mentorship_id: mentorshipId, action: 'publish' });
  return apiPost(`/api/mentorship-sheets?${params.toString()}`, body);
}

export function stopMentorshipShare(mentorshipId: string): Promise<{ share: null }> {
  const params = new URLSearchParams({ mentorship_id: mentorshipId, action: 'stop' });
  return apiPost(`/api/mentorship-sheets?${params.toString()}`, {});
}

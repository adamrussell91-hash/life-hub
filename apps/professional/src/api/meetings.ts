import { apiGet, apiPatch, apiPost, ApiClientError } from './client';
import type { MeetingRecord } from '@/domain/types';

export interface MeetingLinkInput {
  source_ref?: string;
  target_ref: string;
  relationship_type: 'attendee' | 'related_to';
  occurred_at?: string | null;
  role?: string | null;
  context_key?: string | null;
  context_ref?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateMeetingInput {
  title: string;
  scheduled_start: string;
  scheduled_end: string;
  time_zone: string;
  location_text?: string | null;
  agenda?: string | null;
  notes?: string | null;
  links?: MeetingLinkInput[];
}

export interface CreateMeetingResult {
  meeting: MeetingRecord;
  links: unknown[];
  created: boolean;
}

export function listMeetings(options: { signal?: AbortSignal } = {}): Promise<{ meetings: MeetingRecord[] }> {
  return apiGet('/api/meetings', { signal: options.signal });
}

export function getMeeting(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ meeting: MeetingRecord }> {
  const params = new URLSearchParams({ id });
  return apiGet(`/api/meetings?${params.toString()}`, { signal: options.signal });
}

export function createMeeting(
  body: CreateMeetingInput,
  options: { signal?: AbortSignal } = {}
): Promise<CreateMeetingResult> {
  return apiPost<CreateMeetingResult>('/api/meetings', body, { signal: options.signal });
}

export function updateMeeting(
  id: string,
  patch: { title?: string; location_text?: string | null; agenda?: string | null; notes?: string | null },
  options: { signal?: AbortSignal } = {}
): Promise<{ meeting: MeetingRecord }> {
  const params = new URLSearchParams({ id });
  return apiPatch(`/api/meetings?${params.toString()}`, patch, { signal: options.signal });
}

export function rescheduleMeeting(
  id: string,
  body: { scheduled_start: string; scheduled_end: string; time_zone: string; reason?: string | null },
  options: { signal?: AbortSignal } = {}
): Promise<{ meeting: MeetingRecord }> {
  const params = new URLSearchParams({ id, action: 'reschedule' });
  return apiPost(`/api/meetings?${params.toString()}`, body, { signal: options.signal });
}

export function meetingStateAction(
  id: string,
  action: 'complete' | 'cancel' | 'no-show',
  options: { signal?: AbortSignal } = {}
): Promise<{ meeting: MeetingRecord }> {
  const params = new URLSearchParams({ id, action });
  return apiPost(`/api/meetings?${params.toString()}`, {}, { signal: options.signal });
}

export function retryMeetingLinks(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<CreateMeetingResult> {
  const params = new URLSearchParams({ id, action: 'retry-links' });
  return apiPost(`/api/meetings?${params.toString()}`, {}, { signal: options.signal });
}

export function isMeetingIncompleteLinksError(err: unknown): err is ApiClientError & {
  data: {
    meeting_id: string;
    operation_id: string;
    completed_link_ids: string[];
    failed_intent_ids: string[];
  };
} {
  return (
    err instanceof ApiClientError &&
    err.code === 'meeting_links_incomplete' &&
    typeof (err as ApiClientError & { data?: unknown }).data === 'object'
  );
}

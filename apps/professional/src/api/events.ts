import { apiGet, apiPatch, apiPost, ApiClientError } from './client';
import type { EventRecord } from '@/domain/types';

export interface EventLinkInput {
  source_ref?: string;
  target_ref: string;
  relationship_type: 'venue' | 'provider' | 'related_to';
  role?: string | null;
  context_key?: string | null;
  context_ref?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateEventInput {
  title: string;
  event_type?: string;
  start: string;
  end: string;
  time_zone: string;
  all_day?: boolean;
  location_text?: string | null;
  accreditation_category?: string | null;
  hours?: number | null;
  attendance_state?: string | null;
  certificate?: EventRecord['certificate'];
  links?: EventLinkInput[];
}

export interface CreateEventResult {
  event: EventRecord;
  links: unknown[];
  created: boolean;
}

export function listEvents(options: { signal?: AbortSignal } = {}): Promise<{ events: EventRecord[] }> {
  return apiGet('/api/events', { signal: options.signal });
}

export function getEvent(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<{ event: EventRecord }> {
  const params = new URLSearchParams({ id });
  return apiGet(`/api/events?${params.toString()}`, { signal: options.signal });
}

export function createEvent(
  body: CreateEventInput,
  options: { signal?: AbortSignal } = {}
): Promise<CreateEventResult> {
  return apiPost<CreateEventResult>('/api/events', body, { signal: options.signal });
}

export function updateEvent(
  id: string,
  patch: Record<string, unknown>,
  options: { signal?: AbortSignal } = {}
): Promise<{ event: EventRecord }> {
  const params = new URLSearchParams({ id });
  return apiPatch(`/api/events?${params.toString()}`, patch, { signal: options.signal });
}

export function rescheduleEvent(
  id: string,
  body: { start: string; end: string; time_zone: string; all_day?: boolean },
  options: { signal?: AbortSignal } = {}
): Promise<{ event: EventRecord }> {
  const params = new URLSearchParams({ id, action: 'reschedule' });
  return apiPost(`/api/events?${params.toString()}`, body, { signal: options.signal });
}

export function eventStateAction(
  id: string,
  action: 'complete' | 'cancel',
  options: { signal?: AbortSignal } = {}
): Promise<{ event: EventRecord }> {
  const params = new URLSearchParams({ id, action });
  return apiPost(`/api/events?${params.toString()}`, {}, { signal: options.signal });
}

export function retryEventLinks(
  id: string,
  options: { signal?: AbortSignal } = {}
): Promise<CreateEventResult> {
  const params = new URLSearchParams({ id, action: 'retry-links' });
  return apiPost(`/api/events?${params.toString()}`, {}, { signal: options.signal });
}

export function isEventIncompleteLinksError(err: unknown): err is ApiClientError & {
  data: {
    event_id: string;
    operation_id: string;
    completed_link_ids: string[];
    failed_intent_ids: string[];
  };
} {
  return (
    err instanceof ApiClientError &&
    err.code === 'event_links_incomplete' &&
    typeof (err as ApiClientError & { data?: unknown }).data === 'object'
  );
}

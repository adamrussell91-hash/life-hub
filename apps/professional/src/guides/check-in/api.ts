import { apiGet, apiPost } from '@/api/client';
import type { CheckInRecord, CheckInSummary, CheckInText } from './types';

let textCache: Promise<CheckInText> | null = null;

/** The guide wording, fetched once per page load and kept in memory only. A failed load is not cached. */
export function loadCheckInText(): Promise<CheckInText> {
  textCache ??= apiGet<{ text: CheckInText }>('/api/check-in-text').then((r) => r.text);
  textCache.catch(() => { textCache = null; });
  return textCache;
}

export function getCheckIn(id: string): Promise<CheckInRecord> {
  return apiGet<{ check_in: CheckInRecord }>(`/api/check-ins?id=${encodeURIComponent(id)}`).then((r) => r.check_in);
}

export function listMeetingCheckIns(meetingId: string): Promise<CheckInSummary[]> {
  return apiGet<{ check_ins: CheckInSummary[] }>(`/api/check-ins?meeting_id=${encodeURIComponent(meetingId)}`).then((r) => r.check_ins);
}

export function listPersonCheckIns(personRef: string, personName: string): Promise<CheckInSummary[]> {
  const params = new URLSearchParams({ person_ref: personRef, person_name: personName });
  return apiGet<{ check_ins: CheckInSummary[] }>(`/api/check-ins?${params.toString()}`).then((r) => r.check_ins);
}

export function saveCheckIn(record: CheckInRecord): Promise<CheckInSummary> {
  return apiPost<{ check_in: CheckInSummary }>('/api/check-ins', { action: 'save', check_in: record }).then((r) => r.check_in);
}

export function deleteCheckIn(id: string): Promise<void> {
  return apiPost('/api/check-ins', { action: 'delete', id }).then(() => undefined);
}

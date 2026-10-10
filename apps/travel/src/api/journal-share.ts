import { apiDelete, apiPost } from '@/api/client';

export interface JournalShareScope {
  moment_ids: string[];
  leg_ids: string[];
}

export interface JournalShareCreateResult {
  url: string;
  token: string;
  scope: JournalShareScope & { resolved_moment_ids: string[] };
  downloads_outside_revocation: string;
}

export function createJournalShareLink(
  tripId: string,
  scope: JournalShareScope,
): Promise<JournalShareCreateResult> {
  return apiPost(`/api/travel-journal-share?trip=${encodeURIComponent(tripId)}`, scope);
}

export function revokeJournalShareLink(tripId: string): Promise<{ revoked: true }> {
  return apiDelete(`/api/travel-journal-share?trip=${encodeURIComponent(tripId)}`);
}

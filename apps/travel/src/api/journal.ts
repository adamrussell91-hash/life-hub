import { ApiClientError, apiGet, apiPut } from '@/api/client';
import type { JournalFixture } from '@/journal/types';

export type JournalDocument = JournalFixture & {
  leg_ids: string[];
  preferences: Record<string, unknown>;
  operations: unknown[];
};

export interface JournalEnvelope {
  journal: JournalDocument;
  version: string;
}

function makeJournalId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `jrn_${out}`;
}

export function emptyJournalDocument(tripId: string): JournalDocument {
  return {
    id: makeJournalId(),
    schema_version: 1,
    trip_id: tripId,
    title: '',
    revision: 0,
    lifecycle: 'live',
    leg_ids: [],
    preferences: {},
    legs: [],
    days: [],
    moments: [],
    media: [],
    transitions: [],
    operations: []
  };
}

export function getJournal(tripId: string, opts?: { trash?: boolean }): Promise<JournalEnvelope> {
  const trash = opts?.trash ? '&trash=1' : '';
  return apiGet(`/api/travel-journal?trip=${encodeURIComponent(tripId)}${trash}`);
}

export function saveJournal(
  tripId: string,
  ifVersion: string,
  journal: JournalDocument
): Promise<JournalEnvelope> {
  return apiPut(`/api/travel-journal?trip=${encodeURIComponent(tripId)}`, {
    if_version: ifVersion,
    journal
  });
}

export async function ensureJournal(tripId: string): Promise<JournalEnvelope> {
  try {
    return await getJournal(tripId);
  } catch (err) {
    if (err instanceof ApiClientError && err.code === 'not_found') {
      const journal = emptyJournalDocument(tripId);
      return apiPut(`/api/travel-journal?trip=${encodeURIComponent(tripId)}`, {
        create: true,
        journal
      });
    }
    throw err;
  }
}

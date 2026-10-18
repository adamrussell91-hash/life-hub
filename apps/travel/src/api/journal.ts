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

/**
 * Last few server copies by version. A save conflict merges three ways
 * (the copy the edit started from, the server's latest, the local edit) so
 * neither side's additions or deletions are lost.
 */
const knownServerCopies = new Map<string, JournalDocument>();
const KNOWN_COPY_LIMIT = 8;

export function rememberJournalEnvelope(envelope: JournalEnvelope): JournalEnvelope {
  if (envelope?.version && envelope.journal) {
    knownServerCopies.delete(envelope.version);
    knownServerCopies.set(envelope.version, structuredClone(envelope.journal));
    while (knownServerCopies.size > KNOWN_COPY_LIMIT) {
      const oldest = knownServerCopies.keys().next().value;
      if (oldest === undefined) break;
      knownServerCopies.delete(oldest);
    }
  }
  return envelope;
}

export function knownJournalAtVersion(version: string): JournalDocument | undefined {
  return knownServerCopies.get(version);
}

/**
 * Always load the full document, Trash included. Deleted rows are filtered
 * for display; loading without them would make the next save erase Trash.
 */
export async function getJournal(tripId: string): Promise<JournalEnvelope> {
  return rememberJournalEnvelope(
    await apiGet<JournalEnvelope>(`/api/travel-journal?trip=${encodeURIComponent(tripId)}&trash=1`)
  );
}

export async function saveJournal(
  tripId: string,
  ifVersion: string,
  journal: JournalDocument
): Promise<JournalEnvelope> {
  return rememberJournalEnvelope(
    await apiPut<JournalEnvelope>(`/api/travel-journal?trip=${encodeURIComponent(tripId)}`, {
      if_version: ifVersion,
      journal
    })
  );
}

export async function ensureJournal(tripId: string): Promise<JournalEnvelope> {
  try {
    return await getJournal(tripId);
  } catch (err) {
    if (err instanceof ApiClientError && err.code === 'not_found') {
      const journal = emptyJournalDocument(tripId);
      return rememberJournalEnvelope(
        await apiPut<JournalEnvelope>(`/api/travel-journal?trip=${encodeURIComponent(tripId)}`, {
          create: true,
          journal
        })
      );
    }
    throw err;
  }
}

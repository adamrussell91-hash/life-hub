import type { JournalDocument } from '@/api/journal';
import { saveJournal } from '@/api/journal';
import { ensureMomentDays } from '@/journal/capture-context';
import {
  isJournalSaveConflict,
  recoverJournalSaveConflict,
} from '@/journal/conflict-resolve';
import {
  clearQueuedJournalSave,
  isRetryableSaveError,
  queueJournalSave,
} from '@/journal/journal-outbox';

export function isFixtureVersion(version: string): boolean {
  return version === 'fixture';
}

export interface PersistedJournal {
  journal: JournalDocument;
  version: string;
  /** No signal: kept on this device and sent automatically later. */
  queued?: boolean;
}

export async function persistJournalPatch(
  tripId: string,
  version: string,
  journal: JournalDocument,
): Promise<PersistedJournal> {
  journal = ensureMomentDays(journal);
  if (isFixtureVersion(version)) {
    return { journal, version };
  }
  try {
    const saved = await saveJournal(tripId, version, journal);
    await clearQueuedJournalSave(tripId);
    return saved;
  } catch (err) {
    if (isJournalSaveConflict(err)) {
      const merged = await recoverJournalSaveConflict(tripId, version, journal);
      await clearQueuedJournalSave(tripId);
      return merged;
    }
    if (isRetryableSaveError(err)) {
      // Keep the edit; the view carries on from the local copy. The version
      // stays the last one the server confirmed, which the merge relies on.
      await queueJournalSave(tripId, version, journal);
      return { journal, version, queued: true };
    }
    throw err;
  }
}

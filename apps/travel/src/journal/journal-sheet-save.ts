import type { JournalDocument } from '@/api/journal';
import { saveJournal } from '@/api/journal';
import {
  isJournalSaveConflict,
  recoverJournalSaveConflict,
} from '@/journal/conflict-resolve';

export function isFixtureVersion(version: string): boolean {
  return version === 'fixture';
}

export async function persistJournalPatch(
  tripId: string,
  version: string,
  journal: JournalDocument,
): Promise<{ journal: JournalDocument; version: string }> {
  if (isFixtureVersion(version)) {
    return { journal, version };
  }
  try {
    return await saveJournal(tripId, version, journal);
  } catch (err) {
    if (!isJournalSaveConflict(err)) throw err;
    return recoverJournalSaveConflict(tripId, version, journal);
  }
}

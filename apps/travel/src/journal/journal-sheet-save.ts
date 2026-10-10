import type { JournalDocument } from '@/api/journal';
import { saveJournal } from '@/api/journal';

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
  return saveJournal(tripId, version, journal);
}

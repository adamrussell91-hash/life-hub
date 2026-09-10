import { nesaEnglishAdvancedOutcomes, NESA_ENGLISH_ADVANCED_SUBJECT_ID } from './nesa-english-advanced';
import type { CurriculumOutcome } from '@/schemas/outcome';
import type { Subject } from '@/schemas/subject';
import { uniqueOutcomeIds } from './outcome-ids';
import { outcomeKey, subjectKey } from '@/storage/keys';

export interface OutcomeStore {
  getJSON<T>(key: string): Promise<T | null> | T | null | undefined;
  setJSON(key: string, value: unknown): Promise<void> | void;
  list?(prefix: string): Promise<{ blobs: Array<{ key: string }> }> | { blobs: Array<{ key: string }> };
  listKeys?(prefix: string): string[];
}

export async function ensureEnglishAdvancedCatalog(
  store: OutcomeStore,
  subject: Subject,
  now = new Date().toISOString()
): Promise<{ subject: Subject; outcomes: CurriculumOutcome[]; changed: boolean }> {
  if (subject.id !== NESA_ENGLISH_ADVANCED_SUBJECT_ID) {
    return { subject, outcomes: [], changed: false };
  }
  if (subject.outcome_ids.length > 0) {
    return { subject, outcomes: [], changed: false };
  }

  const seeded = nesaEnglishAdvancedOutcomes(now);
  for (const outcome of seeded) {
    await store.setJSON(outcomeKey(outcome.id), outcome);
  }
  const next: Subject = {
    ...subject,
    outcome_ids: seeded.map((row) => row.id),
    updated_at: now
  };
  await store.setJSON(subjectKey(subject.id), next);
  return { subject: next, outcomes: seeded, changed: true };
}

export function mergeOutcomeLists(
  stored: CurriculumOutcome[],
  extra: CurriculumOutcome[]
): CurriculumOutcome[] {
  const byId = new Map<string, CurriculumOutcome>();
  for (const row of extra) byId.set(row.id, row);
  for (const row of stored) byId.set(row.id, row);
  return uniqueOutcomeIds([...byId.keys()]).map((id) => byId.get(id)!);
}

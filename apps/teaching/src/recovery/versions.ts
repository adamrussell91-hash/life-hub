import type { Unit } from '@/schemas/unit';
import type { VersionIndex, VersionIndexEntry, VersionKind } from '@/schemas/version';

export const VERSION_RETENTION = 10;

/** Compare versioned unit fields only (ignores updated_at / status / etc.). */
export function unitContentChanged(
  before: Pick<Unit, 'title' | 'description' | 'blocks' | 'lesson_ids'>,
  after: Pick<Unit, 'title' | 'description' | 'blocks' | 'lesson_ids'>
): boolean {
  const fingerprint = (unit: typeof before) =>
    JSON.stringify({
      title: unit.title,
      description: unit.description ?? null,
      blocks: unit.blocks ?? null,
      lesson_ids: unit.lesson_ids
    });
  return fingerprint(before) !== fingerprint(after);
}

export function emptyVersionIndex(kind: VersionKind, parentId: string): VersionIndex {
  return { parent_id: parentId, kind, latest_revision: 0, entries: [] };
}

export function nextRevision(index: VersionIndex): number {
  return index.latest_revision + 1;
}

export function appendCheckpointToIndex(
  index: VersionIndex,
  entry: VersionIndexEntry
): VersionIndex {
  return {
    ...index,
    latest_revision: Math.max(index.latest_revision, entry.revision),
    entries: [entry, ...index.entries.filter((e) => e.revision !== entry.revision)]
  };
}

/** Keep newest `limit` entries (assumes entries newest-first). Returns pruned index + dropped revisions. */
export function pruneIndexEntries(
  index: VersionIndex,
  limit: number = VERSION_RETENTION
): VersionIndex {
  const entries = index.entries
    .slice()
    .sort((a, b) => b.revision - a.revision)
    .slice(0, limit);
  return { ...index, entries };
}

export function revisionsToDelete(indexBeforePrune: VersionIndex, limit: number = VERSION_RETENTION): number[] {
  const sorted = indexBeforePrune.entries.slice().sort((a, b) => b.revision - a.revision);
  return sorted.slice(limit).map((e) => e.revision);
}

export function versionTypeForKind(
  kind: VersionKind
): 'lesson_version' | 'unit_version' | 'class_homepage_version' {
  if (kind === 'lesson') return 'lesson_version';
  if (kind === 'unit') return 'unit_version';
  return 'class_homepage_version';
}

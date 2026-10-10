/**
 * One definition of "has this record been deleted?" for every hub and every agent.
 *
 * Rule: anything dead / trashed / deleted / removed is gone — agents and tools must never
 * see it as live. Archiving is the only soft state that is NOT deletion; archived records
 * stay readable. Covers each hub's vocabulary:
 *   - Tasks: status 'dead', legacy bucket 'trash' / 'trashed'; projects 'archived_dead'
 *     (the Someday "remove" / merge-away state, not ordinary archiving)
 *   - Teaching (classes, lessons, units, scheduled lessons, …): status 'trashed', trashed_at
 *   - People / organisations: lifecycle_status 'deleted' / 'deidentified'
 *   - Generic: status 'deleted' / 'removed', deleted_at, removed_at
 * Do not re-implement this check inline; import it.
 */

const DELETED_STATUSES = new Set(['dead', 'trashed', 'trash', 'deleted', 'removed', 'archived_dead']);
const DELETED_LIFECYCLE = new Set(['deleted', 'deidentified']);
const DELETED_BUCKETS = new Set(['trash', 'trashed']);

export function isDeletedRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (DELETED_STATUSES.has(String(record.status))) return true;
  if (DELETED_LIFECYCLE.has(String(record.lifecycle_status))) return true;
  if (DELETED_BUCKETS.has(String(record.bucket))) return true;
  return Boolean(record.trashed_at || record.deleted_at || record.removed_at);
}

/** Drop deleted records (and non-objects) from a hub list before anything reads it. */
export function withoutDeleted(records) {
  return (Array.isArray(records) ? records : []).filter(
    record => record && typeof record === 'object' && !Array.isArray(record) && !isDeletedRecord(record)
  );
}

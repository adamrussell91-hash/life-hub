import {
  classKey,
  deleteKey,
  draftLessonKey,
  getJSON,
  setJSON,
  unitKey,
  versionIndexKey,
  versionKey
} from './teaching-blobs.mjs';

export const VERSION_RETENTION = 10;
export const CHECKPOINT_AFTER_SAVE_WARNING = 'Saved, but version history checkpoint failed.';

export class VersionStoreError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'VersionStoreError';
    this.code = code;
    this.details = details;
  }
}

export function blobJsonStore(store) {
  return {
    async getJSON(key) {
      const value = await getJSON(store, key);
      return value ?? null;
    },
    async setJSON(key, value) {
      return setJSON(store, key, value);
    },
    async delete(key) {
      return deleteKey(store, key);
    }
  };
}

export function createMemoryJsonStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    async getJSON(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async listKeys(prefix) {
      return [...map.keys()].filter(key => !prefix || key.startsWith(prefix));
    }
  };
}

export async function tryWriteCheckpoint(store, args) {
  try {
    const record = await writeCheckpoint(store, args);
    return { ok: true, record };
  } catch {
    return { ok: false };
  }
}

export function versionTypeForKind(kind) {
  if (kind === 'lesson') return 'lesson_version';
  if (kind === 'unit') return 'unit_version';
  return 'class_homepage_version';
}

export function liveKeyForKind(kind, parentId) {
  if (kind === 'lesson') return draftLessonKey(parentId);
  if (kind === 'unit') return unitKey(parentId);
  return classKey(parentId);
}

export function parentNotFoundMessage(kind) {
  if (kind === 'lesson') return 'Lesson not found';
  if (kind === 'unit') return 'Unit not found';
  return 'Class not found';
}

export function liveSnapshotForKind(kind, live) {
  if (kind === 'class_homepage') {
    const homepage = live && typeof live === 'object' ? live.homepage : undefined;
    return { homepage };
  }
  return live;
}

export function emptyVersionIndex(kind, parentId) {
  return { parent_id: parentId, kind, latest_revision: 0, entries: [] };
}

export function nextRevision(index) {
  return index.latest_revision + 1;
}

export function appendCheckpointToIndex(index, entry) {
  return {
    ...index,
    latest_revision: Math.max(index.latest_revision, entry.revision),
    entries: [entry, ...index.entries.filter(item => item.revision !== entry.revision)]
  };
}

export function pruneIndexEntries(index, limit = VERSION_RETENTION) {
  const entries = index.entries
    .slice()
    .sort((a, b) => b.revision - a.revision)
    .slice(0, limit);
  return { ...index, entries };
}

export function revisionsToDelete(indexBeforePrune, limit = VERSION_RETENTION) {
  return indexBeforePrune.entries
    .slice()
    .sort((a, b) => b.revision - a.revision)
    .slice(limit)
    .map(entry => entry.revision);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function snapshotValidForKind(kind, snapshot) {
  if (!isRecord(snapshot)) return false;
  if (kind === 'class_homepage') {
    return snapshot.homepage === undefined || isRecord(snapshot.homepage);
  }
  if (typeof snapshot.id !== 'string' || !snapshot.id) return false;
  if (typeof snapshot.title !== 'string' || !snapshot.title) return false;
  if (kind === 'lesson') {
    return snapshot.type === 'lesson' || Array.isArray(snapshot.blocks);
  }
  if (kind === 'unit') {
    return snapshot.type === 'unit' || Array.isArray(snapshot.lesson_ids);
  }
  return false;
}

export async function listVersionIndex(store, kind, parentId) {
  const index = await store.getJSON(versionIndexKey(kind, parentId));
  if (!index || typeof index !== 'object') return emptyVersionIndex(kind, parentId);
  return {
    parent_id: parentId,
    kind,
    latest_revision: Number(index.latest_revision) || 0,
    entries: Array.isArray(index.entries) ? index.entries : []
  };
}

export async function getVersion(store, kind, parentId, revision) {
  const record = await store.getJSON(versionKey(kind, parentId, revision));
  if (!record || typeof record !== 'object') return null;
  return record;
}

export async function writeCheckpoint(store, {
  kind,
  parentId,
  snapshot,
  reason,
  label,
  now
}) {
  const created_at = now ?? new Date().toISOString();
  const index = await listVersionIndex(store, kind, parentId);
  const revision = nextRevision(index);
  const id = `version_${kind}_${parentId}_${revision}`;
  const record = {
    id,
    type: versionTypeForKind(kind),
    kind,
    parent_id: parentId,
    revision,
    created_at,
    reason,
    label: label || null,
    snapshot
  };
  await store.setJSON(versionKey(kind, parentId, revision), record);

  const entry = { id, revision, created_at, reason };
  if (label) entry.label = label;
  const beforePrune = appendCheckpointToIndex(index, entry);
  const dropped = revisionsToDelete(beforePrune);
  const nextIndex = pruneIndexEntries(beforePrune);
  await Promise.all(dropped.map(rev => store.delete(versionKey(kind, parentId, rev))));
  await store.setJSON(versionIndexKey(kind, parentId), nextIndex);
  return record;
}

export async function restoreVersion(store, { kind, parentId, revision, now }) {
  const record = await getVersion(store, kind, parentId, revision);
  if (!record) {
    throw new VersionStoreError('not_found', 'Version not found');
  }
  if (!snapshotValidForKind(kind, record.snapshot)) {
    throw new VersionStoreError('validation_error', 'Version snapshot is invalid');
  }

  const liveKey = liveKeyForKind(kind, parentId);
  const live = await store.getJSON(liveKey);
  if (!live || typeof live !== 'object') {
    throw new VersionStoreError('not_found', parentNotFoundMessage(kind));
  }

  const stamp = now ?? new Date().toISOString();
  await writeCheckpoint(store, {
    kind,
    parentId,
    snapshot: liveSnapshotForKind(kind, live),
    reason: 'restore',
    now: stamp
  });

  let next;
  if (kind === 'class_homepage') {
    next = { ...live, homepage: record.snapshot.homepage, updated_at: stamp };
  } else {
    next = { ...record.snapshot, id: parentId, updated_at: stamp };
  }
  await store.setJSON(liveKey, next);
  return next;
}

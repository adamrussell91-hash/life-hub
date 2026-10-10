import type { InspectedPhoto, ProposedMoment } from '@/journal/import-group';

export type ImportFileState =
  | 'selected'
  | 'inspecting'
  | 'proposed'
  | 'uploading'
  | 'partially_complete'
  | 'complete'
  | 'cancelled'
  | 'failed';

export type ImportFileEvent =
  | { type: 'start_inspect' }
  | { type: 'inspected' }
  | { type: 'duplicate_skip'; reason: string }
  | { type: 'start_upload' }
  | { type: 'upload_put_done' }
  | { type: 'upload_verify_failed'; message: string }
  | { type: 'upload_verified' }
  | { type: 'upload_failed'; message: string }
  | { type: 'retry_upload' }
  | { type: 'cancel' };

export interface ImportFileEntry {
  localId: string;
  checksum: string;
  name: string;
  state: ImportFileState;
  operationId: string;
  groupIndex: number;
  skipReason?: string;
  error?: string;
  inspected?: InspectedPhoto;
}

export interface ImportBatchSummary {
  total: number;
  complete: number;
  failed: number;
  uploading: number;
  partial: number;
  cancelled: number;
  skippedDuplicate: number;
  proposed: number;
  inspecting: number;
}

export type BatchOutcome = 'in_progress' | 'all_complete' | 'all_failed' | 'partial' | 'cancelled';

export interface ImportProposalSnapshot {
  tripId: string;
  updatedAt: string;
  groups: ProposedMoment[];
  files: ImportFileEntry[];
}

const TERMINAL: ReadonlySet<ImportFileState> = new Set([
  'complete',
  'cancelled',
  'failed',
]);

export function stableOperationId(tripId: string, checksum: string): string {
  return `op_imp_${tripId}_${checksum.slice(0, 24)}`;
}

export function createImportFile(tripId: string, checksum: string, name: string): ImportFileEntry {
  return {
    localId: `imp_${checksum.slice(0, 12)}_${Math.random().toString(36).slice(2, 8)}`,
    checksum,
    name,
    state: 'selected',
    operationId: stableOperationId(tripId, checksum),
    groupIndex: 0,
  };
}

export function transitionImportFile(entry: ImportFileEntry, event: ImportFileEvent): ImportFileEntry {
  switch (event.type) {
    case 'start_inspect':
      if (entry.state !== 'selected') return entry;
      return { ...entry, state: 'inspecting', error: undefined };
    case 'inspected':
      if (entry.state !== 'inspecting') return entry;
      return { ...entry, state: 'proposed' };
    case 'duplicate_skip':
      if (entry.state !== 'inspecting' && entry.state !== 'selected' && entry.state !== 'proposed') {
        return entry;
      }
      return {
        ...entry,
        state: 'complete',
        skipReason: event.reason,
        error: undefined,
      };
    case 'start_upload':
      if (entry.state === 'complete' && entry.skipReason) return entry;
      if (entry.state !== 'proposed' && entry.state !== 'partially_complete' && entry.state !== 'failed') {
        return entry;
      }
      return { ...entry, state: 'uploading', error: undefined };
    case 'upload_put_done':
      if (entry.state !== 'uploading') return entry;
      return { ...entry, state: 'partially_complete' };
    case 'upload_verify_failed':
      if (entry.state !== 'uploading' && entry.state !== 'partially_complete') return entry;
      return { ...entry, state: 'partially_complete', error: event.message };
    case 'upload_verified':
      if (entry.state !== 'uploading' && entry.state !== 'partially_complete') return entry;
      return { ...entry, state: 'complete', error: undefined };
    case 'upload_failed':
      if (entry.state !== 'uploading' && entry.state !== 'partially_complete') return entry;
      return { ...entry, state: 'failed', error: event.message };
    case 'retry_upload':
      if (entry.state !== 'failed' && entry.state !== 'partially_complete') return entry;
      return { ...entry, state: 'uploading', error: undefined };
    case 'cancel':
      if (TERMINAL.has(entry.state)) return entry;
      return { ...entry, state: 'cancelled' };
    default:
      return entry;
  }
}

export function deriveBatchSummary(files: ImportFileEntry[]): ImportBatchSummary {
  const summary: ImportBatchSummary = {
    total: files.length,
    complete: 0,
    failed: 0,
    uploading: 0,
    partial: 0,
    cancelled: 0,
    skippedDuplicate: 0,
    proposed: 0,
    inspecting: 0,
  };
  for (const f of files) {
    switch (f.state) {
      case 'complete':
        summary.complete += 1;
        if (f.skipReason) summary.skippedDuplicate += 1;
        break;
      case 'failed':
        summary.failed += 1;
        break;
      case 'uploading':
        summary.uploading += 1;
        break;
      case 'partially_complete':
        summary.partial += 1;
        break;
      case 'cancelled':
        summary.cancelled += 1;
        break;
      case 'proposed':
        summary.proposed += 1;
        break;
      case 'inspecting':
        summary.inspecting += 1;
        break;
      default:
        break;
    }
  }
  return summary;
}

export function deriveBatchOutcome(summary: ImportBatchSummary): BatchOutcome {
  const active = summary.uploading + summary.partial + summary.proposed + summary.inspecting;
  const settled = summary.complete + summary.failed + summary.cancelled;
  if (active > 0 || settled < summary.total) return 'in_progress';
  if (summary.cancelled === summary.total) return 'cancelled';
  if (summary.failed > 0 && summary.complete === 0) return 'all_failed';
  if (summary.complete === summary.total) return 'all_complete';
  if (summary.complete > 0 && summary.failed > 0) return 'partial';
  return 'in_progress';
}

export function splitMomentGroup(groups: ProposedMoment[], groupIndex: number): ProposedMoment[] {
  const target = groups[groupIndex];
  if (!target || target.checksums.length < 2) return groups;
  const [head, ...tail] = target.checksums;
  const first: ProposedMoment = { ...target, checksums: [head] };
  const second: ProposedMoment = {
    ...target,
    checksums: tail,
    duplicate_checksums: target.duplicate_checksums.filter((c) => tail.includes(c)),
  };
  return [...groups.slice(0, groupIndex), first, second, ...groups.slice(groupIndex + 1)];
}

export function mergeMomentGroups(
  groups: ProposedMoment[],
  indexA: number,
  indexB: number
): ProposedMoment[] {
  if (indexA === indexB) return groups;
  const lo = Math.min(indexA, indexB);
  const hi = Math.max(indexA, indexB);
  if (hi - lo !== 1) return groups;
  const a = groups[lo];
  const b = groups[hi];
  if (!a || !b) return groups;
  const merged: ProposedMoment = {
    ...a,
    checksums: [...a.checksums, ...b.checksums],
    duplicate_checksums: [...new Set([...a.duplicate_checksums, ...b.duplicate_checksums])],
    needs_date: Boolean(a.needs_date || b.needs_date),
    needs_timezone: Boolean(a.needs_timezone || b.needs_timezone),
    unlocated: a.unlocated && b.unlocated,
  };
  return [...groups.slice(0, lo), merged, ...groups.slice(hi + 1)];
}

export function applyGroupLayout(
  files: ImportFileEntry[],
  groups: ProposedMoment[]
): ImportFileEntry[] {
  const indexByChecksum = new Map<string, number>();
  groups.forEach((g, gi) => {
    for (const c of g.checksums) indexByChecksum.set(c, gi);
    for (const c of g.duplicate_checksums) indexByChecksum.set(c, gi);
  });
  return files.map((f) => ({
    ...f,
    groupIndex: indexByChecksum.get(f.checksum) ?? f.groupIndex,
  }));
}

const IDB_NAME = 'lifehub-travel-journal-import';
const IDB_VERSION = 1;

function openImportDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('proposals')) {
        db.createObjectStore('proposals', { keyPath: 'tripId' });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs');
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveImportProposal(
  snapshot: ImportProposalSnapshot,
  blobs: Map<string, Blob>
): Promise<void> {
  try {
    const db = await openImportDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['proposals', 'blobs'], 'readwrite');
      tx.objectStore('proposals').put({
        ...snapshot,
        updatedAt: new Date().toISOString(),
      });
      const blobStore = tx.objectStore('blobs');
      for (const [checksum, blob] of blobs) {
        blobStore.put(blob, `${snapshot.tripId}:${checksum}`);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* persistence is best-effort */
  }
}

export async function loadImportProposal(
  tripId: string
): Promise<{ snapshot: ImportProposalSnapshot; blobs: Map<string, Blob> } | null> {
  try {
    const db = await openImportDb();
    const snapshot = await new Promise<ImportProposalSnapshot | undefined>((resolve, reject) => {
      const tx = db.transaction('proposals', 'readonly');
      const req = tx.objectStore('proposals').get(tripId);
      req.onsuccess = () => resolve(req.result as ImportProposalSnapshot | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!snapshot) {
      db.close();
      return null;
    }
    const blobs = new Map<string, Blob>();
    const blobStore = db.transaction('blobs', 'readonly').objectStore('blobs');
    for (const f of snapshot.files) {
      const key = `${tripId}:${f.checksum}`;
      const blob = await new Promise<Blob | undefined>((resolve, reject) => {
        const req = blobStore.get(key);
        req.onsuccess = () => resolve(req.result as Blob | undefined);
        req.onerror = () => reject(req.error);
      });
      if (blob) blobs.set(f.checksum, blob);
    }
    db.close();
    return { snapshot, blobs };
  } catch {
    return null;
  }
}

export async function clearImportProposal(tripId: string): Promise<void> {
  try {
    const db = await openImportDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['proposals', 'blobs'], 'readwrite');
      tx.objectStore('proposals').delete(tripId);
      const blobStore = tx.objectStore('blobs');
      const range = IDBKeyRange.bound(`${tripId}:`, `${tripId}:\uffff`);
      blobStore.openCursor(range).onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export function duplicateSkipReason(
  checksum: string,
  known: Set<string>,
  deleted: Set<string>
): string | null {
  if (deleted.has(checksum)) {
    return 'This photo was deleted from the journal. Restore it from Trash before re-importing.';
  }
  if (known.has(checksum)) {
    return 'Already backed up on this journal — skipped.';
  }
  return null;
}

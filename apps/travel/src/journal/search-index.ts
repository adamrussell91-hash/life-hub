import type { JournalDocument } from '@/api/journal';
import type { JournalMedia, JournalMoment } from '@/journal/types';

const IDB_NAME = 'lifehub-travel-journal-search';
const IDB_VERSION = 1;

/** Optional Phase 5 fields — indexed when present on live media. */
type JournalMediaSearchExtras = JournalMedia & {
  transcript?: string;
  object_notes?: string;
};

export type JournalSearchField =
  | 'title'
  | 'place'
  | 'caption'
  | 'text'
  | 'object_note'
  | 'transcript';

export interface JournalSearchRow {
  targetId: string;
  momentId?: string;
  field: JournalSearchField;
  label: string;
  haystack: string;
}

export interface JournalSearchIndex {
  tripId: string;
  revision: number;
  rows: JournalSearchRow[];
  builtAt: string;
}

function openSearchDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('indexes')) {
        db.createObjectStore('indexes', { keyPath: 'tripId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function mediaExtras(media: JournalMedia): JournalMediaSearchExtras {
  return media as JournalMediaSearchExtras;
}

function pushRow(
  rows: JournalSearchRow[],
  row: Omit<JournalSearchRow, 'haystack'> & { haystack?: string },
): void {
  const haystack = (row.haystack ?? row.label).trim();
  if (!haystack) return;
  rows.push({ ...row, haystack });
}

function indexMoment(rows: JournalSearchRow[], moment: JournalMoment, journal: JournalDocument): void {
  if (moment.lifecycle !== 'live') return;
  const leg = journal.legs.find((l) => l.id === moment.leg_id);
  if (!leg || leg.lifecycle !== 'live') return;

  if (moment.place?.name) {
    pushRow(rows, {
      targetId: moment.id,
      momentId: moment.id,
      field: 'place',
      label: moment.place.name,
    });
  }
  if (moment.text?.trim()) {
    pushRow(rows, {
      targetId: moment.id,
      momentId: moment.id,
      field: 'text',
      label: moment.text.trim(),
    });
  }

  for (const mediaId of moment.media_ids) {
    const media = journal.media.find((m) => m.id === mediaId);
    if (!media || media.lifecycle !== 'live') continue;
    const extras = mediaExtras(media);
    if (media.caption?.trim()) {
      pushRow(rows, {
        targetId: moment.id,
        momentId: moment.id,
        field: 'caption',
        label: media.caption.trim(),
      });
    }
    if (extras.object_notes?.trim()) {
      pushRow(rows, {
        targetId: moment.id,
        momentId: moment.id,
        field: 'object_note',
        label: extras.object_notes.trim(),
      });
    }
    if (extras.transcript?.trim()) {
      pushRow(rows, {
        targetId: moment.id,
        momentId: moment.id,
        field: 'transcript',
        label: extras.transcript.trim(),
      });
    }
  }
}

/** Rebuild the full search index from a journal document (excludes deleted rows). */
export function rebuildJournalSearchIndex(journal: JournalDocument): JournalSearchIndex {
  const rows: JournalSearchRow[] = [];

  if (journal.lifecycle === 'live' && journal.title.trim()) {
    const firstLeg = journal.legs
      .filter((l) => l.lifecycle === 'live')
      .sort((a, b) => a.order - b.order)[0];
    pushRow(rows, {
      targetId: firstLeg?.id ?? journal.trip_id,
      field: 'title',
      label: journal.title.trim(),
    });
  }

  for (const leg of journal.legs) {
    if (leg.lifecycle !== 'live') continue;
    pushRow(rows, {
      targetId: leg.id,
      field: 'title',
      label: leg.destination,
    });
  }

  for (const moment of journal.moments) {
    indexMoment(rows, moment, journal);
  }

  return {
    tripId: journal.trip_id,
    revision: journal.revision,
    rows,
    builtAt: new Date().toISOString(),
  };
}

export async function loadJournalSearchIndex(tripId: string): Promise<JournalSearchIndex | null> {
  try {
    const db = await openSearchDb();
    const stored = await new Promise<JournalSearchIndex | undefined>((resolve, reject) => {
      const tx = db.transaction('indexes', 'readonly');
      const req = tx.objectStore('indexes').get(tripId);
      req.onsuccess = () => resolve(req.result as JournalSearchIndex | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return stored ?? null;
  } catch {
    return null;
  }
}

export async function persistJournalSearchIndex(index: JournalSearchIndex): Promise<void> {
  try {
    const db = await openSearchDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('indexes', 'readwrite');
      tx.objectStore('indexes').put(index);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore quota */
  }
}

export async function getOrBuildJournalSearchIndex(journal: JournalDocument): Promise<JournalSearchIndex> {
  const cached = await loadJournalSearchIndex(journal.trip_id);
  if (cached && cached.revision === journal.revision) return cached;
  const built = rebuildJournalSearchIndex(journal);
  await persistJournalSearchIndex(built);
  return built;
}

const FIELD_LABEL: Record<JournalSearchField, string> = {
  title: 'Title',
  place: 'Place',
  caption: 'Caption',
  text: 'Text',
  object_note: 'Object note',
  transcript: 'Transcript',
};

export function journalSearchFieldLabel(field: JournalSearchField): string {
  return FIELD_LABEL[field];
}

/** Substring match on normalized haystack — sufficient for journal scale without MiniSearch. */
export function searchJournalIndex(index: JournalSearchIndex, query: string): JournalSearchRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const hits: JournalSearchRow[] = [];
  for (const row of index.rows) {
    if (!row.haystack.toLowerCase().includes(q)) continue;
    const key = `${row.targetId}:${row.field}:${row.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(row);
  }
  return hits;
}

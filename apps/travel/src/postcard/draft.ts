/**
 * A postcard being made is kept on the phone from the moment anything exists: the photo
 * copy, the clip, the words and the address. A dropped connection or a closed sheet loses
 * nothing. It is removed once the server confirms the postcard, or when it is discarded.
 */
import type { PostcardOrientation } from '@/types';

export interface PostcardDraft {
  tripId: string;
  itemId: string;
  photo: Blob | null;
  photoName: string;
  orientation: PostcardOrientation | null;
  clip: Blob | null;
  clipSeconds: number;
  /** The clip's id once it has been uploaded. */
  audioId: string | null;
  text: string;
  address: string[];
  /** The owner changed the address, so a lookup must not replace it. */
  addressTouched: boolean;
  updatedAt: string;
}

export interface DraftStore {
  load(tripId: string, itemId: string): Promise<PostcardDraft | null>;
  /** False when the phone would not keep it. */
  save(draft: PostcardDraft): Promise<boolean>;
  clear(tripId: string, itemId: string): Promise<void>;
}

const DB_NAME = 'lifehub-travel-postcard-drafts';
const STORE = 'drafts';
const draftKey = (tripId: string, itemId: string): string => `${tripId}:${itemId}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error ?? new Error('IDB open failed'));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Drafts in the browser's own database. Every call fails soft: a phone that refuses storage still posts. */
export function idbDraftStore(): DraftStore {
  return {
    async load(tripId, itemId) {
      try {
        const row = await withStore<(PostcardDraft & { key: string }) | undefined>('readonly', (store) =>
          store.get(draftKey(tripId, itemId))
        );
        if (!row) return null;
        const { key: _key, ...draft } = row;
        return draft;
      } catch {
        return null;
      }
    },
    async save(draft) {
      try {
        await withStore('readwrite', (store) => store.put({ ...draft, key: draftKey(draft.tripId, draft.itemId) }));
        return true;
      } catch {
        return false;
      }
    },
    async clear(tripId, itemId) {
      try {
        await withStore('readwrite', (store) => store.delete(draftKey(tripId, itemId)));
      } catch {
        /* nothing was kept */
      }
    }
  };
}

/** The same contract in memory, for tests. */
export function memoryDraftStore(): DraftStore & { size(): number } {
  const rows = new Map<string, PostcardDraft>();
  return {
    async load(tripId, itemId) {
      return rows.get(draftKey(tripId, itemId)) ?? null;
    },
    async save(draft) {
      rows.set(draftKey(draft.tripId, draft.itemId), draft);
      return true;
    },
    async clear(tripId, itemId) {
      rows.delete(draftKey(tripId, itemId));
    },
    size: () => rows.size
  };
}

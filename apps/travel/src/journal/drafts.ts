export type CaptureDraftMode = 'photos' | 'voice' | 'text';

export interface JournalCaptureDraft {
  tripId: string;
  legId: string;
  localDate: string;
  mode: CaptureDraftMode;
  text: string;
  localTime: string;
  placeName: string;
  updatedAt: string;
  hasVoice: boolean;
  photoNames: string[];
}

const IDB_NAME = 'lifehub-travel-journal-capture';
const IDB_VERSION = 1;

export function captureDraftKey(tripId: string, legId: string, localDate: string): string {
  return `${tripId}:${legId}:${localDate}`;
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs');
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export interface LoadedCaptureDraft {
  draft: JournalCaptureDraft;
  voiceBlob: Blob | null;
  photoBlobs: Blob[];
}

export async function loadCaptureDraft(
  tripId: string,
  legId: string,
  localDate: string
): Promise<LoadedCaptureDraft | null> {
  const key = captureDraftKey(tripId, legId, localDate);
  try {
    const db = await openDraftDb();
    const row = await new Promise<{ draft: JournalCaptureDraft; key: string } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction('drafts', 'readonly');
        const req = tx.objectStore('drafts').get(key);
        req.onsuccess = () => resolve(req.result as { draft: JournalCaptureDraft; key: string } | undefined);
        req.onerror = () => reject(req.error);
      }
    );
    if (!row?.draft) {
      db.close();
      return null;
    }
    const blobStore = db.transaction('blobs', 'readonly').objectStore('blobs');
    const voiceBlob = await new Promise<Blob | null>((resolve, reject) => {
      const req = blobStore.get(`${key}:voice`);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    const photoBlobs: Blob[] = [];
    for (let i = 0; i < row.draft.photoNames.length; i += 1) {
      const blob = await new Promise<Blob | undefined>((resolve, reject) => {
        const req = blobStore.get(`${key}:photo:${i}`);
        req.onsuccess = () => resolve(req.result as Blob | undefined);
        req.onerror = () => reject(req.error);
      });
      if (blob) photoBlobs.push(blob);
    }
    db.close();
    return { draft: row.draft, voiceBlob, photoBlobs };
  } catch {
    return null;
  }
}

export async function saveCaptureDraft(
  draft: JournalCaptureDraft,
  blobs: { voice: Blob | null; photos: Blob[] }
): Promise<boolean> {
  const key = captureDraftKey(draft.tripId, draft.legId, draft.localDate);
  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['drafts', 'blobs'], 'readwrite');
      tx.objectStore('drafts').put({
        key,
        draft: { ...draft, updatedAt: new Date().toISOString() },
      });
      const blobStore = tx.objectStore('blobs');
      blobStore.delete(`${key}:voice`);
      for (let i = 0; i < 32; i += 1) blobStore.delete(`${key}:photo:${i}`);
      if (blobs.voice) blobStore.put(blobs.voice, `${key}:voice`);
      blobs.photos.forEach((blob, i) => blobStore.put(blob, `${key}:photo:${i}`));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function clearCaptureDraft(
  tripId: string,
  legId: string,
  localDate: string
): Promise<void> {
  const key = captureDraftKey(tripId, legId, localDate);
  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['drafts', 'blobs'], 'readwrite');
      tx.objectStore('drafts').delete(key);
      const blobStore = tx.objectStore('blobs');
      blobStore.delete(`${key}:voice`);
      for (let i = 0; i < 32; i += 1) blobStore.delete(`${key}:photo:${i}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export interface DraftAutosaveController {
  schedule(): void;
  flush(): Promise<boolean>;
  destroy(): void;
}

/** Persist after 500ms idle and on blur of bound fields. */
export function createDraftAutosave(
  getPayload: () => {
    draft: JournalCaptureDraft;
    voice: Blob | null;
    photos: Blob[];
  },
  onSaved?: () => void
): DraftAutosaveController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  async function flush(): Promise<boolean> {
    if (destroyed) return false;
    const payload = getPayload();
    const ok = await saveCaptureDraft(payload.draft, {
      voice: payload.voice,
      photos: payload.photos,
    });
    if (ok) onSaved?.();
    return ok;
  }

  function schedule(): void {
    if (destroyed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, 500);
  }

  return {
    schedule,
    flush,
    destroy() {
      destroyed = true;
      if (timer) clearTimeout(timer);
    },
  };
}

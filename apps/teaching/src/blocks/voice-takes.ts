/**
 * Practice takes for the Voice block, kept on the student's device only.
 * Nothing leaves the device until the student submits one take. Bytes are
 * stored as ArrayBuffers (Safari is unreliable with Blobs in IndexedDB).
 * The newest five takes per block are kept.
 */

export type VoiceTake = {
  id: string;
  scope: string;
  recorded_at: string;
  duration_s: number;
  mime: string;
  points: Array<{ label: string; t: number }>;
  /** How many dot points the take reached, for the "4/4" chip. */
  reached: number;
};

type Stored = VoiceTake & { bytes: ArrayBuffer };

export type TakeStore = {
  list: (scope: string) => Promise<VoiceTake[]>;
  audio: (id: string) => Promise<Blob | null>;
  put: (take: VoiceTake, bytes: ArrayBuffer) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const MAX_TAKES = 5;
const DB_NAME = 'lh-voice-takes';
const TAKES = 'takes';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function indexedDbTakes(idb: IDBFactory): TakeStore {
  let opened: Promise<IDBDatabase> | null = null;
  const db = () => {
    opened ??= new Promise((resolve, reject) => {
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(TAKES, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return opened;
  };
  const all = async () => request<Stored[]>((await db()).transaction(TAKES).objectStore(TAKES).getAll());
  const strip = ({ bytes: _bytes, ...take }: Stored): VoiceTake => take;
  return {
    async list(scope) {
      return (await all()).filter((t) => t.scope === scope).map(strip).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
    },
    async audio(id) {
      const row = await request<Stored | undefined>((await db()).transaction(TAKES).objectStore(TAKES).get(id));
      return row ? new Blob([row.bytes], { type: row.mime.split(';')[0] || 'audio/webm' }) : null;
    },
    async put(take, bytes) {
      await request((await db()).transaction(TAKES, 'readwrite').objectStore(TAKES).put({ ...take, bytes }));
    },
    async remove(id) {
      await request((await db()).transaction(TAKES, 'readwrite').objectStore(TAKES).delete(id));
    }
  };
}

export function memoryTakes(): TakeStore {
  const rows = new Map<string, Stored>();
  return {
    async list(scope) {
      return [...rows.values()]
        .filter((t) => t.scope === scope)
        .map(({ bytes: _bytes, ...t }) => t)
        .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
    },
    async audio(id) {
      const row = rows.get(id);
      return row ? new Blob([row.bytes], { type: row.mime }) : null;
    },
    async put(take, bytes) {
      rows.set(take.id, { ...take, bytes });
    },
    async remove(id) {
      rows.delete(id);
    }
  };
}

let defaultStore: TakeStore | null = null;

export function takeStore(): TakeStore {
  if (!defaultStore) defaultStore = typeof indexedDB === 'undefined' ? memoryTakes() : indexedDbTakes(indexedDB);
  return defaultStore;
}

export function setTakeStoreForTests(store: TakeStore | null): void {
  defaultStore = store;
}

/** Saves a take and trims the block's list to the newest five. */
export async function keepTake(store: TakeStore, take: VoiceTake, bytes: ArrayBuffer): Promise<VoiceTake[]> {
  await store.put(take, bytes);
  const takes = await store.list(take.scope);
  for (const old of takes.slice(MAX_TAKES)) await store.remove(old.id);
  return takes.slice(0, MAX_TAKES);
}

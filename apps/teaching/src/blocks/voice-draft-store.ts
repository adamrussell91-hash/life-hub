/**
 * On-device safety copy of annotation voice recordings.
 *
 * Audio is written to IndexedDB every few seconds while recording, so a failed
 * upload, a refresh or a crash never loses it. A draft is removed only after
 * the recording has been uploaded and saved into the block. Bytes are stored
 * as ArrayBuffers (Safari is unreliable with Blobs in IndexedDB).
 */
import type { VoiceTap } from '@/blocks/voice-match';
import type { VoiceWord } from '@/blocks/voice-transcript';

export type VoiceDraftMeta = {
  id: string;
  title: string;
  kind: 'reading' | 'think_aloud';
  layer_id: string;
  lesson_id?: string;
  mime: string;
  started_at: string;
  updated_at: string;
  duration_s: number;
  taps: VoiceTap[];
  live_words: VoiceWord[];
  /** Set once recording stopped; a draft without it was cut off mid-recording. */
  finished?: boolean;
  last_error?: string;
};

export type VoiceDraftBackend = {
  putMeta: (meta: VoiceDraftMeta) => Promise<void>;
  putChunk: (id: string, seq: number, bytes: ArrayBuffer) => Promise<void>;
  listMeta: () => Promise<VoiceDraftMeta[]>;
  chunks: (id: string) => Promise<ArrayBuffer[]>;
  remove: (id: string) => Promise<void>;
};

const DB_NAME = 'lh-voice-drafts';
const META = 'drafts';
const CHUNKS = 'chunks';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function indexedDbBackend(idb: IDBFactory = indexedDB): VoiceDraftBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
          if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          dbPromise = null;
          reject(req.error);
        };
      });
    }
    return dbPromise;
  };
  const range = (id: string) => IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
  return {
    async putMeta(meta) {
      const db = await open();
      const tx = db.transaction(META, 'readwrite');
      tx.objectStore(META).put(meta);
      await done(tx);
    },
    async putChunk(id, seq, bytes) {
      const db = await open();
      const tx = db.transaction(CHUNKS, 'readwrite');
      tx.objectStore(CHUNKS).put(bytes, [id, seq]);
      await done(tx);
    },
    async listMeta() {
      const db = await open();
      const tx = db.transaction(META, 'readonly');
      return (await request(tx.objectStore(META).getAll())) as VoiceDraftMeta[];
    },
    async chunks(id) {
      const db = await open();
      const tx = db.transaction(CHUNKS, 'readonly');
      return (await request(tx.objectStore(CHUNKS).getAll(range(id)))) as ArrayBuffer[];
    },
    async remove(id) {
      const db = await open();
      const tx = db.transaction([META, CHUNKS], 'readwrite');
      tx.objectStore(META).delete(id);
      tx.objectStore(CHUNKS).delete(range(id));
      await done(tx);
    }
  };
}

export function memoryBackend(): VoiceDraftBackend {
  const metas = new Map<string, VoiceDraftMeta>();
  const chunks = new Map<string, Map<number, ArrayBuffer>>();
  return {
    async putMeta(meta) {
      metas.set(meta.id, structuredClone(meta));
    },
    async putChunk(id, seq, bytes) {
      const row = chunks.get(id) ?? new Map<number, ArrayBuffer>();
      row.set(seq, bytes);
      chunks.set(id, row);
    },
    async listMeta() {
      return [...metas.values()].map((m) => structuredClone(m));
    },
    async chunks(id) {
      return [...(chunks.get(id)?.entries() ?? [])].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
    },
    async remove(id) {
      metas.delete(id);
      chunks.delete(id);
    }
  };
}

let defaultBackend: VoiceDraftBackend | null = null;

export function voiceDraftBackend(): VoiceDraftBackend {
  if (!defaultBackend) {
    defaultBackend = typeof indexedDB !== 'undefined' ? indexedDbBackend() : memoryBackend();
  }
  return defaultBackend;
}

export function setVoiceDraftBackendForTests(backend: VoiceDraftBackend | null): void {
  defaultBackend = backend;
}

export async function listVoiceDrafts(backend = voiceDraftBackend()): Promise<VoiceDraftMeta[]> {
  try {
    const rows = await backend.listMeta();
    return rows.sort((a, b) => b.started_at.localeCompare(a.started_at));
  } catch {
    return [];
  }
}

export async function voiceDraftAudio(id: string, mime: string, backend = voiceDraftBackend()): Promise<Blob> {
  const parts = await backend.chunks(id);
  return new Blob(parts, { type: mime.split(';')[0] || 'audio/webm' });
}

export function audioExtension(mime: string): string {
  return mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') ? 'mp3' : mime.includes('wav') ? 'wav' : 'webm';
}

/** Hand the teacher the file: their copy, whatever the server does. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Writes one recording as it happens. Chunks are batched (every few seconds)
 * so IndexedDB isn't hit 4× a second; `flush()` writes whatever is pending.
 */
export function createDraftWriter(meta: VoiceDraftMeta, backend = voiceDraftBackend()) {
  let current = { ...meta };
  let pending: Blob[] = [];
  let seq = 0;
  let chain: Promise<unknown> = Promise.resolve();
  let failed = false;

  const run = (job: () => Promise<void>) => {
    chain = chain.then(job).catch(() => {
      failed = true;
    });
    return chain as Promise<void>;
  };

  void run(() => backend.putMeta(current));

  return {
    get failed() {
      return failed;
    },
    push(chunk: Blob) {
      pending.push(chunk);
    },
    update(patch: Partial<VoiceDraftMeta>) {
      current = { ...current, ...patch, updated_at: new Date().toISOString() };
    },
    flush(): Promise<void> {
      const batch = pending;
      pending = [];
      const snapshot = { ...current };
      return run(async () => {
        if (batch.length > 0) {
          const bytes = await new Blob(batch).arrayBuffer();
          await backend.putChunk(current.id, seq, bytes);
          seq += 1;
        }
        await backend.putMeta(snapshot);
      });
    }
  };
}

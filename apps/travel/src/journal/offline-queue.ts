/** Durable journal edit queue (Phase 4). Survives reload; flushed when online. */

export type JournalOpAckState = 'pending' | 'acked' | 'failed';

export interface JournalOpAck {
  state: JournalOpAckState;
  at?: string;
  server_version?: string;
  error?: string;
}

export interface JournalQueuedOp {
  id: string;
  target_id: string;
  base_revision: number;
  action: string;
  payload: unknown;
  ack: JournalOpAck;
}

export interface EnqueueJournalOpInput {
  id?: string;
  target_id: string;
  base_revision: number;
  action: string;
  payload: unknown;
}

export type JournalOpSender = (op: JournalQueuedOp) => Promise<JournalOpAck>;

export interface JournalQuotaFailureOffer {
  kind: 'quota';
  message: string;
  retry: () => Promise<EnqueueJournalOpResult>;
  downloadPending: () => void;
}

export type EnqueueJournalOpResult =
  | { ok: true; op: JournalQueuedOp }
  | { ok: false; quota: JournalQuotaFailureOffer };

const IDB_NAME = 'lifehub-travel-journal-offline';
const IDB_VERSION = 1;
const STORE = 'journal_ops';

export const PENDING_UNLOAD_MESSAGE =
  'You have journal edits waiting to sync. Leaving now may leave them on this device only.';

interface JournalOpsStore {
  put(op: JournalQueuedOp): Promise<void>;
  get(id: string): Promise<JournalQueuedOp | undefined>;
  getAll(): Promise<JournalQueuedOp[]>;
  delete(id: string): Promise<void>;
}

let storeOverride: JournalOpsStore | null = null;
let cachedPendingCount = 0;

export function __setJournalOpsStoreForTests(store: JournalOpsStore | null): void {
  storeOverride = store;
  cachedPendingCount = 0;
}

async function refreshPendingCount(): Promise<number> {
  cachedPendingCount = await countPendingJournalOps();
  return cachedPendingCount;
}

function pendingAck(): JournalOpAck {
  return { state: 'pending' };
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name ?? '';
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function openJournalOpsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function idbStore(): JournalOpsStore {
  return {
    async put(op) {
      const db = await openJournalOpsDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(op);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async get(id) {
      const db = await openJournalOpsDb();
      const row = await new Promise<JournalQueuedOp | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result as JournalQueuedOp | undefined);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return row;
    },
    async getAll() {
      const db = await openJournalOpsDb();
      const rows = await new Promise<JournalQueuedOp[]>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result as JournalQueuedOp[]) ?? []);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return rows;
    },
    async delete(id) {
      const db = await openJournalOpsDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
  };
}

function store(): JournalOpsStore {
  return storeOverride ?? idbStore();
}

export function createJournalOpId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `jop_${crypto.randomUUID()}`;
  }
  return `jop_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isJournalOpPending(op: JournalQueuedOp): boolean {
  return op.ack.state === 'pending' || op.ack.state === 'failed';
}

export async function listJournalOps(): Promise<JournalQueuedOp[]> {
  const rows = await store().getAll();
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

export async function countPendingJournalOps(): Promise<number> {
  const rows = await listJournalOps();
  return rows.filter(isJournalOpPending).length;
}

function downloadPendingOpsJson(ops: JournalQueuedOp[]): void {
  const blob = new Blob([JSON.stringify(ops, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `travel-journal-pending-ops-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function quotaOffer(retryInput: EnqueueJournalOpInput): JournalQuotaFailureOffer {
  return {
    kind: 'quota',
    message:
      'This device is out of storage for pending journal edits. Free space or download a local copy — that is not a server backup.',
    retry: () => enqueueJournalOp(retryInput),
    downloadPending: () => {
      void listJournalOps().then((ops) => {
        const pending = ops.filter(isJournalOpPending);
        if (pending.length) downloadPendingOpsJson(pending);
      });
    },
  };
}

export async function enqueueJournalOp(input: EnqueueJournalOpInput): Promise<EnqueueJournalOpResult> {
  const id = input.id ?? createJournalOpId();
  const existing = await store().get(id);
  if (existing?.ack.state === 'acked') {
    return { ok: true, op: existing };
  }
  const op: JournalQueuedOp = {
    id,
    target_id: input.target_id,
    base_revision: input.base_revision,
    action: input.action,
    payload: input.payload,
    ack: existing?.ack.state === 'failed' ? pendingAck() : (existing?.ack ?? pendingAck()),
  };
  try {
    await store().put(op);
    await refreshPendingCount();
    return { ok: true, op };
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    return { ok: false, quota: quotaOffer(input) };
  }
}

/** Idempotent: repeating the same ack state is a no-op. */
export async function ackJournalOp(id: string, ack: JournalOpAck): Promise<JournalQueuedOp | null> {
  const existing = await store().get(id);
  if (!existing) return null;
  if (existing.ack.state === 'acked' && ack.state === 'acked') {
    return existing;
  }
  const next: JournalQueuedOp = {
    ...existing,
    ack: {
      ...ack,
      at: ack.at ?? new Date().toISOString(),
    },
  };
  await store().put(next);
  await refreshPendingCount();
  return next;
}

export interface FlushJournalOpsResult {
  sent: string[];
  skipped: string[];
  failed: { id: string; error: string }[];
}

export async function flushJournalOps(sender: JournalOpSender): Promise<FlushJournalOpsResult> {
  const ops = await listJournalOps();
  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const op of ops) {
    if (op.ack.state === 'acked') {
      skipped.push(op.id);
      continue;
    }
    try {
      const ack = await sender(op);
      if (ack.state === 'acked') {
        await ackJournalOp(op.id, ack);
        sent.push(op.id);
      } else if (ack.state === 'failed') {
        await ackJournalOp(op.id, ack);
        failed.push({ id: op.id, error: ack.error ?? 'Send failed' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed';
      await ackJournalOp(op.id, { state: 'failed', error: message });
      failed.push({ id: op.id, error: message });
    }
  }
  await refreshPendingCount();
  return { sent, skipped, failed };
}

export interface BindJournalOfflineQueueOptions {
  sender: JournalOpSender;
  win?: Window;
  onQuotaFailure?: (offer: JournalQuotaFailureOffer) => void;
}

/** Flush on bind (app open) and when the browser goes online; warn before unload if pending. */
export function bindJournalOfflineQueue(options: BindJournalOfflineQueueOptions): () => void {
  const win = options.win ?? window;

  const flushIfOnline = (): void => {
    if (!win.navigator.onLine) return;
    void flushJournalOps(options.sender);
  };

  const onOnline = (): void => flushIfOnline();
  const onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (cachedPendingCount > 0) {
      event.preventDefault();
      event.returnValue = PENDING_UNLOAD_MESSAGE;
    }
  };

  win.addEventListener('online', onOnline);
  win.addEventListener('beforeunload', onBeforeUnload);
  void refreshPendingCount().then(() => flushIfOnline());

  return () => {
    win.removeEventListener('online', onOnline);
    win.removeEventListener('beforeunload', onBeforeUnload);
  };
}

export async function enqueueJournalOpWhileOffline(
  input: EnqueueJournalOpInput,
  online: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true
): Promise<EnqueueJournalOpResult | null> {
  if (online) return null;
  const result = await enqueueJournalOp(input);
  return result;
}

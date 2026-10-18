/**
 * The journal's on-device outbox. Nothing the owner captures may depend on
 * having signal at that moment:
 *
 * - A save that fails for network reasons is kept on the device (latest
 *   full document per trip, with the server copy it was based on) and sent
 *   later; a conflict at send time merges three ways, without prompting.
 * - Every photo and voice note is queued with its bytes before the moment
 *   that references it is saved, and is only dropped from the device once
 *   the server has verified the upload.
 *
 * Flushes on app open, when the browser comes back online, when the tab
 * becomes visible again, and every minute while anything is waiting.
 */
import { ApiClientError } from '@/api/client';
import {
  getJournal,
  knownJournalAtVersion,
  saveJournal,
  type JournalDocument,
  type JournalEnvelope,
} from '@/api/journal';
import {
  enqueueJournalOp,
  flushJournalOps,
  listJournalOps,
  removeJournalOp,
  isJournalOpPending,
  type JournalOpAck,
  type JournalQueuedOp,
} from '@/journal/offline-queue';
import { backUpJournalMedia, type JournalMediaUploadJob } from '@/journal/media-upload';
import { isJournalSaveConflict, recoverJournalSaveConflict } from '@/journal/conflict-resolve';

/** Saves sort (and so flush) before media: verify needs the media row on the server. */
const SAVE_PREFIX = 'a-save:';
const MEDIA_PREFIX = 'b-media:';
const FLUSH_INTERVAL_MS = 60_000;

interface SavePayload {
  kind: 'save';
  tripId: string;
  version: string;
  journal: JournalDocument;
  base?: JournalDocument;
}

interface MediaPayload extends JournalMediaUploadJob {
  kind: 'media';
}

export interface JournalSyncedEvent {
  tripId: string;
  envelope: JournalEnvelope;
  /** A newer local save is still waiting; the envelope is not the latest edit. */
  saveStillPending: boolean;
}

const syncedListeners = new Set<(event: JournalSyncedEvent) => void>();

export function onJournalSynced(listener: (event: JournalSyncedEvent) => void): () => void {
  syncedListeners.add(listener);
  return () => syncedListeners.delete(listener);
}

async function hasPendingSave(tripId: string): Promise<boolean> {
  try {
    const ops = await listJournalOps();
    return ops.some((op) => op.id === SAVE_PREFIX + tripId && isJournalOpPending(op));
  } catch {
    return false;
  }
}

async function emitSynced(tripId: string, envelope: JournalEnvelope): Promise<void> {
  const saveStillPending = await hasPendingSave(tripId);
  for (const listener of syncedListeners) listener({ tripId, envelope, saveStillPending });
}

/** Network trouble (worth keeping and retrying), as opposed to a rejected edit. */
export function isRetryableSaveError(err: unknown): boolean {
  if (err instanceof ApiClientError) {
    if (['network_error', 'timeout', 'invalid_response', 'platform_unavailable'].includes(err.code)) {
      return true;
    }
    return (err.status ?? 0) >= 500 || err.status === 0;
  }
  return err instanceof TypeError;
}

export async function queueJournalSave(
  tripId: string,
  version: string,
  journal: JournalDocument,
): Promise<void> {
  const id = SAVE_PREFIX + tripId;
  // Several offline edits chain on the same server copy: keep the oldest base
  // so the eventual three-way merge sees every local change.
  const existing = (await listJournalOps()).find((op) => op.id === id && isJournalOpPending(op));
  const prior = existing?.payload as SavePayload | undefined;
  const payload: SavePayload = {
    kind: 'save',
    tripId,
    version: prior?.version ?? version,
    journal,
    base: prior ? prior.base : knownJournalAtVersion(version),
  };
  const result = await enqueueJournalOp({
    id,
    replace: true,
    target_id: tripId,
    base_revision: journal.revision,
    action: 'journal_save',
    payload,
  });
  if (!result.ok) throw new Error(result.quota.message);
  scheduleFlush();
}

/**
 * An online save from the view carries every queued edit (the view works from
 * the local copy), so a waiting offline save for the trip is now redundant.
 */
export async function clearQueuedJournalSave(tripId: string): Promise<void> {
  await removeJournalOp(SAVE_PREFIX + tripId).catch(() => undefined);
}

export async function queueJournalMedia(job: JournalMediaUploadJob): Promise<void> {
  const payload: MediaPayload = { kind: 'media', ...job };
  const result = await enqueueJournalOp({
    id: MEDIA_PREFIX + job.mediaId,
    replace: true,
    target_id: job.mediaId,
    base_revision: 0,
    action: 'media_upload',
    payload,
  });
  if (!result.ok) throw new Error(result.quota.message);
  scheduleFlush();
}

export async function dropQueuedJournalMedia(mediaIds: string[]): Promise<void> {
  for (const id of mediaIds) await removeJournalOp(MEDIA_PREFIX + id).catch(() => undefined);
}

async function sendSave(payload: SavePayload): Promise<JournalOpAck> {
  let envelope: JournalEnvelope;
  try {
    envelope = await saveJournal(payload.tripId, payload.version, payload.journal);
  } catch (err) {
    if (!isJournalSaveConflict(err)) throw err;
    envelope = await recoverJournalSaveConflict(
      payload.tripId,
      payload.version,
      payload.journal,
      { base: payload.base, interactive: false },
    );
  }
  void emitSynced(payload.tripId, envelope);
  return { state: 'acked', server_version: envelope.version };
}

async function sendMedia(payload: MediaPayload): Promise<JournalOpAck> {
  try {
    const envelope = await backUpJournalMedia(payload);
    void emitSynced(payload.tripId, envelope);
    return { state: 'acked', server_version: envelope.version };
  } catch (err) {
    // The moment was deleted (or never saved) — nothing references these bytes.
    if (err instanceof ApiClientError && err.code === 'not_found') {
      const { journal } = await getJournal(payload.tripId);
      const row = journal.media.find((m) => m.id === payload.mediaId);
      if (!row || row.lifecycle !== 'live') return { state: 'acked' };
    }
    throw err;
  }
}

async function send(op: JournalQueuedOp): Promise<JournalOpAck> {
  const payload = op.payload as SavePayload | MediaPayload;
  if (payload?.kind === 'save') return sendSave(payload);
  if (payload?.kind === 'media') return sendMedia(payload);
  return { state: 'acked' };
}

let flushing: Promise<void> | null = null;
let flushAgain = false;

export function flushJournalOutbox(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  flushing = (async () => {
    do {
      flushAgain = false;
      await flushJournalOps(send, { purgeAcked: true });
    } while (flushAgain);
  })()
    .catch(() => undefined)
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushJournalOutbox();
  }, 0);
}

let bound = false;

/** Call once at app start. */
export function bindJournalOutbox(): void {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  window.addEventListener('online', () => void flushJournalOutbox());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushJournalOutbox();
  });
  setInterval(() => {
    void listJournalOps()
      .then((ops) => {
        if (ops.some(isJournalOpPending)) void flushJournalOutbox();
      })
      .catch(() => undefined);
  }, FLUSH_INTERVAL_MS);
  void flushJournalOutbox();
}

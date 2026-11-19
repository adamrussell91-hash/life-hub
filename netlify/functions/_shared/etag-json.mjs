/**
 * JSON blobs written with an etag: read, change, write only if nobody wrote in
 * between, retry on a lost race. Shared by games.mjs (solo event logs) and the
 * Fleet week campaign (fleet-week-store.mjs).
 */
import { read, reject } from './question-drop.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
export const list = (v) => (Array.isArray(v) ? v : []);
export const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export async function readWithEtag(store, key) {
  if (typeof store.getWithMetadata !== 'function') return { data: await read(store, key), etag: null };
  const row = await store.getWithMetadata(key, STRONG);
  return { data: row?.data ?? null, etag: row?.etag ?? null };
}

/** The retry pause between lost races. Tests swap `sleep` (and `random`) to stay fast and deterministic. */
export const etagRetry = {
  random: Math.random,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

/**
 * Read, change, write only if nobody wrote in between (create-only when the
 * blob is new). `change(data)` gets a copy and returns the next value, or
 * undefined to write nothing; it may throw to refuse. A lost race re-reads and
 * tries again, up to `attempts` writes, pausing a jittered `backoff_ms × 2^n`
 * between them (0 = no pause); then 409 `retry`. Returns `{ data, written }`.
 */
export async function updateJSON(store, key, change, { attempts = 6, backoff_ms = 15 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const held = await readWithEtag(store, key);
    const next = change(held.data == null ? null : structuredClone(held.data));
    if (next === undefined) return { data: held.data, written: false };
    const options = held.data != null ? (held.etag ? { onlyIfMatch: held.etag } : {}) : { onlyIfNew: true };
    const written = await store.setJSON(key, next, options);
    if (written?.modified !== false) return { data: next, written: true };
    if (attempt >= attempts) reject(409, 'retry', 'Please send it again.');
    if (backoff_ms > 0) await etagRetry.sleep(Math.round(etagRetry.random() * backoff_ms * 2 ** (attempt - 1)));
  }
}

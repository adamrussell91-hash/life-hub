// netlify/functions/_shared/thinking-threads/store.mjs
// Threads in the encrypted cognitive store under thinking-threads/v1/{owner}/{id}.json. Every
// write is conditional on the thread's `revision` (and the object's etag underneath): a stale
// revision is a 409 that carries the current thread, so the client can reapply once.
import { isListed } from './thread.mjs';

export const THREAD_PREFIX = 'thinking-threads/v1';

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });

/** The small row the R2 store lists from (no situation, digest or packets). */
export function threadIndexRow(thread) {
  if (!Array.isArray(thread?.sessions)) return thread;
  const home = thread.sessions.find((s) => s.role === 'home') ?? null;
  return {
    id: thread.id,
    title: thread.title,
    status: thread.status,
    restUntil: thread.restUntil ?? null,
    listed: isListed(thread),
    sessionCount: thread.sessions.length,
    home: home ? { tool: home.tool, sessionId: home.sessionId } : null,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt
  };
}

/** Encrypted R2 store for threads, or null when R2 or SESSION_SECRET is not configured. */
export async function defaultGetThreadStore(env) {
  const { defaultGetCognitiveStore } = await import('../cognitive-store.mjs');
  return defaultGetCognitiveStore(env, { prefix: THREAD_PREFIX, indexRow: threadIndexRow });
}

/** Thread reads and revision-checked writes over a cognitive store (R2 or in-memory). */
export function createThreadStore(store) {
  async function load(owner, id) {
    if (!ID_RE.test(String(id ?? ''))) throw fail(400, 'validation_error', 'Valid thread id required.');
    const row = await store.read(owner, id);
    if (!row) throw fail(404, 'not_found', 'Thread not found.');
    return row;
  }

  return {
    async get(owner, id) {
      return (await load(owner, id)).value;
    },

    /** Listed threads only (more than one session or a detour), open and resting, newest first. */
    async list(owner, { limit = 200 } = {}) {
      const rows = await store.list(owner, 1000, 0);
      return rows
        .map((row) => threadIndexRow(row.value))
        .filter((row) => row?.id && row.listed && (row.status === 'open' || row.status === 'resting'))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, limit);
    },

    async create(owner, thread) {
      const written = await store.write(owner, thread.id, thread, null);
      if (!written) throw fail(409, 'conflict', 'That thread already exists.');
      return written.value;
    },

    /**
     * Apply `change` to the thread at `revision`. A different revision, or a write that loses
     * the race, is a 409 whose error carries the current thread (`error.thread`).
     */
    async update(owner, id, revision, change) {
      const { value, etag } = await load(owner, id);
      if (Number(revision) !== value.revision) throw fail(409, 'conflict', 'This thread changed elsewhere.', { thread: value });
      const next = await change(value);
      if (next === value) return value;
      const written = await store.write(owner, id, { ...next, revision: value.revision + 1 }, etag);
      if (!written) throw fail(409, 'conflict', 'This thread changed elsewhere.', { thread: (await store.read(owner, id))?.value ?? value });
      return written.value;
    },

    /** Read, change and write at whatever revision is current, retrying once on a lost race (server-side landings). */
    async updateLatest(owner, id, change) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { value } = await load(owner, id);
        try {
          return await this.update(owner, id, value.revision, change);
        } catch (error) {
          if (error.status !== 409 || attempt === 1) throw error;
        }
      }
      throw fail(409, 'conflict', 'This thread changed elsewhere.');
    },

    getMeta: (owner, name) => (store.getMeta ? store.getMeta(owner, name) : null),
    setMeta: (owner, name, value) => (store.setMeta ? store.setMeta(owner, name, value) : null)
  };
}

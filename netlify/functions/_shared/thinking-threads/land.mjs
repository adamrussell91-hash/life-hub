// netlify/functions/_shared/thinking-threads/land.mjs
// Server-side landings: a detour session finished (its last step recorded, or a protocol run
// completed) lands its packet on the thread; a detour deleted stops its home step waiting.
// Never throws: a thread that cannot be reached must not block the tool's own save.
import { landPacket, sessionOf, setSessionState } from './thread.mjs';
import { packetFrom } from './adapters.mjs';
import { KIND_TOOL } from './briefs.mjs';
import { createThreadStore, defaultGetThreadStore } from './store.mjs';

export const ownerOf = (env) => env?.COGNITIVE_OWNER_ID || 'operator';

/** The thread a detour belongs to: an engine session's `threadDetour`, a protocol session's `origin`. */
export const detourThreadId = (session) => session?.threadDetour?.threadId ?? session?.origin?.threadId ?? null;

async function threadsFor(env, deps) {
  if (deps.threads) return deps.threads;
  const store = deps.getThreadStore ? await deps.getThreadStore(env) : await defaultGetThreadStore(env);
  return store ? createThreadStore(store) : null;
}

/**
 * Land `packetFrom(tool, session)` on the detour's thread. `tool` defaults to the session kind's
 * tool; a protocol run passes `{ tool: 'knowledge-protocols' }`. Returns the thread, or null when
 * there is nothing to land on (no thread, store unbound, the session is not in the thread).
 */
export async function landDetour(env, session, deps = {}) {
  const threadId = detourThreadId(session);
  if (!threadId) return null;
  try {
    const threads = await threadsFor(env, deps);
    if (!threads) return null;
    const tool = deps.tool ?? KIND_TOOL[session.kind] ?? null;
    if (!tool) return null;
    const packet = packetFrom(tool, session);
    const now = (deps.now ?? (() => new Date().toISOString()))();
    return await threads.updateLatest(ownerOf(env), threadId, (thread) => (sessionOf(thread, session.id) ? landPacket(thread, session.id, packet, now) : thread));
  } catch (error) {
    deps.log?.(error);
    return null;
  }
}

/** A detour's session moved state outside a landing: archived ('removed') or failed. */
export async function markDetour(env, session, state, deps = {}) {
  const threadId = detourThreadId(session);
  if (!threadId) return null;
  try {
    const threads = await threadsFor(env, deps);
    if (!threads) return null;
    const now = (deps.now ?? (() => new Date().toISOString()))();
    return await threads.updateLatest(ownerOf(env), threadId, (thread) => {
      const entry = sessionOf(thread, session.id);
      return entry && entry.state !== 'returned' ? setSessionState(thread, session.id, state, now) : thread;
    });
  } catch (error) {
    deps.log?.(error);
    return null;
  }
}

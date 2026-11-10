// netlify/functions/_shared/thinking-threads/engine-hooks.mjs
// The `threads` hooks the engine service (problem-solver/service.mjs) calls: a direct start
// makes a quiet thread, a detour's last step lands its packet, an archived detour is removed.
import { createThread } from './thread.mjs';
import { createThreadStore, defaultGetThreadStore } from './store.mjs';
import { landDetour, markDetour } from './land.mjs';

/** The tool id behind a store prefix ('rules-book/v1' -> 'rules-book'). */
export const toolOfPrefix = (prefix) => String(prefix ?? 'problem-solver/v1').replace(/\/v1$/, '');

/** Hooks for one tool, or null when the thread store is not configured. */
export async function engineThreadHooks(env, toolId, deps = {}) {
  const store = deps.getThreadStore ? await deps.getThreadStore(env) : await defaultGetThreadStore(env);
  if (!store) return null;
  const threads = createThreadStore(store);
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    async quiet(owner, session) {
      const thread = createThread({ situation: session.turns?.[0]?.text ?? session.title, title: session.title, homeSession: { kind: 'tool', tool: toolId, sessionId: session.id }, now: now() });
      return (await threads.create(owner, thread)).id;
    },
    landed: (session) => landDetour(env, session, { threads, tool: toolId, now }),
    removed: (session) => markDetour(env, session, 'removed', { threads, now })
  };
}

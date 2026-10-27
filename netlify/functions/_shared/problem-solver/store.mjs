// netlify/functions/_shared/problem-solver/store.mjs
import { randomUUID } from 'node:crypto';
import { summaryRow } from './session.mjs';

export const PROBLEM_SOLVER_PREFIX = 'problem-solver/v1';
export const DECISION_BOOK_PREFIX = 'decision-book/v1';
export const GEAR_SHIFTER_PREFIX = 'get-things-done/v1';
export const RULES_BOOK_PREFIX = 'rules-book/v1';
export const CHANGE_BOOK_PREFIX = 'change-book/v1';

/** In-memory store with the same read/write/list contract as the R2 cognitive store. */
export function createMemoryProblemStore() {
  const rows = new Map();
  const key = (owner, id) => `${owner}/${id}`;
  return {
    async read(owner, id) {
      const row = rows.get(key(owner, id));
      return row ? { value: structuredClone(row.value), etag: row.etag } : null;
    },
    async write(owner, id, value, expectedEtag) {
      const prior = rows.get(key(owner, id));
      if (expectedEtag === null ? Boolean(prior) : prior?.etag !== expectedEtag) return null;
      const next = { value: structuredClone(value), etag: `"${randomUUID()}"` };
      rows.set(key(owner, id), next);
      return { value: structuredClone(next.value), etag: next.etag };
    },
    async list(owner, limit = 200, offset = 0) {
      return [...rows.entries()]
        .filter(([k]) => k.startsWith(`${owner}/`))
        .map(([, row]) => ({ value: summaryRow(row.value) }))
        .sort((a, b) => String(b.value.updatedAt).localeCompare(String(a.value.updatedAt)))
        .slice(offset, offset + limit);
    }
  };
}

/** Encrypted R2 store under problem-solver/v1, or null when R2 or SESSION_SECRET is not configured. */
export async function defaultGetProblemStore(env, prefix = PROBLEM_SOLVER_PREFIX) {
  const { defaultGetCognitiveStore } = await import('../cognitive-store.mjs');
  return defaultGetCognitiveStore(env, { prefix, indexRow: summaryRow });
}

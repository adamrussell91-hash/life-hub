/**
 * /api/day-review — the train-home pass.
 *   GET  ?date=YYYY-MM-DD → { done, at }
 *   POST { date, outcomes: [{ blockId, outcome }], bookmarks: [{ taskId, note }] }
 *
 * Outcomes land on the work block (`outcome`, `outcome_at`): mostly worked / mixed /
 * blocked / didn't start. A blocked block is a blocker, never evidence the work is
 * slow. Bookmarks land on the task (`bookmark: { note, at, source }`); an empty note
 * keeps the previous bookmark. Skipping the pass writes nothing.
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetTasksStore, getJSON, setJSON, taskKey } from './_shared/tasks-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { DAY_REVIEW_PREFIX } from './_shared/day-sense-notify.mjs';

export const config = { path: '/api/day-review' };

export const OUTCOMES = new Set(['worked', 'mixed', 'blocked', 'not_started']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_.:-]{1,120}$/;

export function readReviewBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_request' };
  for (const key of Object.keys(body)) {
    if (!['date', 'outcomes', 'bookmarks'].includes(key)) return { error: 'invalid_request' };
  }
  if (!DATE.test(body.date ?? '')) return { error: 'invalid_request' };
  const outcomes = Array.isArray(body.outcomes) ? body.outcomes : [];
  const bookmarks = Array.isArray(body.bookmarks) ? body.bookmarks : [];
  if (outcomes.length > 12 || bookmarks.length > 8) return { error: 'invalid_request' };
  for (const row of outcomes) {
    if (!ID.test(row?.blockId ?? '') || !OUTCOMES.has(row?.outcome)) return { error: 'invalid_request' };
  }
  for (const row of bookmarks) {
    if (!ID.test(row?.taskId ?? '') || typeof row?.note !== 'string') return { error: 'invalid_request' };
  }
  return {
    date: body.date,
    outcomes: outcomes.map((row) => ({ blockId: row.blockId, outcome: row.outcome })),
    bookmarks: bookmarks
      .map((row) => ({ taskId: row.taskId, note: row.note.replace(/\s+/g, ' ').trim().slice(0, 280) }))
      .filter((row) => row.note)
  };
}

export function createDayReviewHandler(deps = {}) {
  const now = deps.now ?? Date.now;
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method === 'GET') {
      const date = new URL(request.url).searchParams.get('date') ?? '';
      if (!DATE.test(date)) return withCors(errorResponse(400, 'invalid_request', 'Provide date.', false), request, env);
      const saved = await getJSON(store, `${DAY_REVIEW_PREFIX}${date}`).catch(() => null);
      return withCors(okResponse(200, { done: Boolean(saved), at: saved?.at ?? null }), request, env);
    }
    if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const body = readReviewBody(parsed.value);
    if (body.error) return withCors(errorResponse(400, 'invalid_request', 'Outcomes and notes only.', false), request, env);
    const at = new Date(now()).toISOString();
    const missing = [];
    for (const row of body.outcomes) {
      const key = `work_blocks/${row.blockId}`;
      const block = await getJSON(store, key);
      if (!block) { missing.push(row.blockId); continue; }
      await setJSON(store, key, { ...block, outcome: row.outcome, outcome_at: at, updated_at: at });
    }
    for (const row of body.bookmarks) {
      const key = taskKey(row.taskId);
      const task = await getJSON(store, key);
      if (!task) { missing.push(row.taskId); continue; }
      await setJSON(store, key, { ...task, bookmark: { note: row.note, at, source: 'day_review' }, updated_at: at });
    }
    await setJSON(store, `${DAY_REVIEW_PREFIX}${body.date}`, {
      date: body.date,
      at,
      outcomes: body.outcomes.length,
      bookmarks: body.bookmarks.length
    });
    return withCors(okResponse(200, { saved: true, missing }), request, env);
  }, { getContentStore: defaultGetTasksStore, unboundMessage: 'Tasks store is not bound.', ...deps });
}

export default createDayReviewHandler();

/**
 * /api/calendar-freed — regained time (Day Sense §3.5).
 *
 *   POST   { series, title, date, start, end, reason? }  "I've dropped this" on a repeating event
 *   DELETE ?id=…                                          undo
 *
 * The freed span is the dropped event's weekly slot from `date` on. It remembers why,
 * and the term it falls in, so a new commitment placed there can show what it costs
 * across the rest of term. Advisory only: nothing is moved or declined in iCloud.
 * Stored beside the iCloud feed cache; GET /api/calendar-feeds returns it as `freed`.
 */
import { createHash } from 'node:crypto';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';
import { readSchoolTerms } from './almanac.mjs';

export const config = { path: '/api/calendar-freed' };
export const FREED_KEY = 'meta/freed_spans';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const line = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function readFreed(store) {
  const list = await getJSON(store, FREED_KEY).catch(() => null);
  return Array.isArray(list) ? list.filter((row) => row && typeof row.id === 'string') : [];
}

/** Validate a POST body into a freed span (term_end filled from the school terms). */
export function freedEntry(body, { terms = [], nowIso = new Date().toISOString() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_request' };
  const series = line(body.series, 300);
  const title = line(body.title, 120);
  if (!series || !title || !DATE.test(body.date ?? '') || !TIME.test(body.start ?? '') || !TIME.test(body.end ?? '') || body.start >= body.end) {
    return { error: 'invalid_request' };
  }
  const term = terms.find((row) => body.date >= row.starts_on && body.date <= row.ends_on) ?? null;
  return {
    entry: {
      id: `freed-${createHash('sha256').update(`${series}|${body.date}`).digest('hex').slice(0, 12)}`,
      series,
      title,
      weekday: new Date(`${body.date}T00:00:00Z`).getUTCDay(),
      start: body.start,
      end: body.end,
      from: body.date,
      reason: line(body.reason, 160),
      term_end: term?.ends_on ?? null,
      created_at: nowIso
    }
  };
}

export function createCalendarFreedHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method === 'POST') {
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const terms = await (deps.readTerms ?? readSchoolTerms)(() => (deps.getTasksStore ?? defaultGetTasksStore)(env)).catch(() => []);
      const { entry, error } = freedEntry(parsed.value, { terms });
      if (error) return withCors(errorResponse(400, error, 'series, title, date, start < end required', false), request, env);
      const list = (await readFreed(store)).filter((row) => row.series !== entry.series);
      await setJSON(store, FREED_KEY, [...list, entry]);
      return withCors(okResponse(201, entry), request, env);
    }
    if (request.method === 'DELETE') {
      const id = new URL(request.url).searchParams.get('id') ?? '';
      const list = await readFreed(store);
      if (!list.some((row) => row.id === id)) return withCors(errorResponse(404, 'not_found', 'Nothing freed with that id.', false), request, env);
      await setJSON(store, FREED_KEY, list.filter((row) => row.id !== id));
      return withCors(okResponse(200, { id, deleted: true }), request, env);
    }
    return withCors(methodNotAllowed('POST, DELETE, OPTIONS'), request, env);
  }, deps);
}

export default createCalendarFreedHandler();

/**
 * /api/readiness-checkin — the morning check-in (bubbles on the Life dashboard).
 *   GET  ?date=YYYY-MM-DD           → { done, checkin }
 *   GET  ?from=YYYY-MM-DD&to=…      → { checkins: [...] }   (at most 31 days; feeds every dial)
 *   POST { date, answers, questions, prediction, final }   → saves the observation
 *   POST { date, skipped: true, prediction }               → saves a skip (hides the card; not evidence)
 *   POST { date, action: 'reason', reason_codes, note? }    → adds "what did we miss?" to that day
 *
 * One observation per day. The prediction issued before the answer is stored beside the
 * answer, so the residual is honest and the later reason never rewrites it. Records live in
 * the private Tasks Blobs store, never in this repo.
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { DISCREPANCY_REASONS, QUESTIONS, READINESS } from '../../packages/design-kit/js/calendar/readiness-model.js';

export const config = { path: '/api/readiness-checkin' };
export const CHECKIN_PREFIX = 'meta/readiness_checkin/';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;
const REASONS = new Set(DISCREPANCY_REASONS.map(([code]) => code));
const QUESTION_IDS = new Set(Object.keys(QUESTIONS));

function optionCodes(id) {
  return new Set(QUESTIONS[id].options.map(([code]) => code));
}

function readPrediction(value) {
  if (!value || typeof value !== 'object') return null;
  const pct = Number(value.pct);
  const low = Number(value.low);
  const high = Number(value.high);
  if (![pct, low, high].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) return null;
  const issued = typeof value.issued_at === 'string' && !Number.isNaN(Date.parse(value.issued_at)) ? value.issued_at : null;
  return { pct: Math.round(pct), low: Math.round(low), high: Math.round(high), issued_at: issued };
}

export function readCheckinBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_request' };
  if (!DATE.test(body.date ?? '')) return { error: 'invalid_request' };
  if (body.action === 'reason') {
    const codes = Array.isArray(body.reason_codes) ? body.reason_codes : [];
    if (!codes.length || codes.length > 4 || !codes.every(code => REASONS.has(code))) return { error: 'invalid_request' };
    const note = typeof body.note === 'string' ? body.note.replace(/\s+/g, ' ').trim().slice(0, 280) : '';
    return { action: 'reason', date: body.date, reason_codes: [...new Set(codes)], note: note || null };
  }
  const prediction = readPrediction(body.prediction);
  if (!prediction) return { error: 'invalid_request' };
  if (body.skipped === true) return { action: 'skip', date: body.date, prediction };
  const answers = body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return { error: 'invalid_request' };
  const entries = Object.entries(answers);
  if (!entries.length || entries.length > 3) return { error: 'invalid_request' };
  for (const [id, code] of entries) {
    if (!QUESTION_IDS.has(id) || !optionCodes(id).has(code)) return { error: 'invalid_request' };
  }
  const final = Number(body.final);
  if (!Number.isFinite(final) || final < 0 || final > 100) return { error: 'invalid_request' };
  const questions = Array.isArray(body.questions) ? body.questions.filter(id => QUESTION_IDS.has(id)).slice(0, 3) : Object.keys(answers);
  return { action: 'answer', date: body.date, answers: Object.fromEntries(entries), questions, prediction, final: Math.round(final) };
}

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function createReadinessCheckinHandler(deps = {}) {
  const now = deps.now ?? Date.now;
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const bad = (message) => withCors(errorResponse(400, 'invalid_request', message, false), request, env);
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const date = params.get('date');
      if (date) {
        if (!DATE.test(date)) return bad('Provide date.');
        const saved = await getJSON(store, `${CHECKIN_PREFIX}${date}`).catch(() => null);
        return withCors(okResponse(200, { done: Boolean(saved), checkin: saved ?? null }), request, env);
      }
      const from = params.get('from') ?? '';
      const to = params.get('to') ?? '';
      if (!DATE.test(from) || !DATE.test(to) || from > to || addDays(from, MAX_RANGE_DAYS) < to) {
        return bad('Provide date, or from and to within 31 days.');
      }
      const keys = [];
      for (let d = from; d <= to; d = addDays(d, 1)) keys.push(d);
      const rows = await Promise.all(keys.map(d => getJSON(store, `${CHECKIN_PREFIX}${d}`).catch(() => null)));
      return withCors(okResponse(200, { checkins: rows.filter(Boolean) }), request, env);
    }
    if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const body = readCheckinBody(parsed.value);
    if (body.error) return bad('Answers from the check-in only.');
    const key = `${CHECKIN_PREFIX}${body.date}`;
    const existing = await getJSON(store, key).catch(() => null);
    const at = new Date(now()).toISOString();

    if (body.action === 'reason') {
      if (!existing || existing.skipped) return withCors(errorResponse(404, 'not_found', 'No check-in for that day.', false), request, env);
      const next = { ...existing, reason_codes: body.reason_codes, reason_status: 'provided', note: body.note, reason_recorded_at: at };
      await setJSON(store, key, next);
      return withCors(okResponse(200, { saved: true, checkin: next }), request, env);
    }
    if (existing && !existing.skipped) {
      return withCors(errorResponse(409, 'already_checked_in', 'Already checked in today.', false), request, env);
    }

    const base = {
      id: `checkin-${body.date}`,
      type: 'readiness_checkin',
      date: body.date,
      source: 'morning_bubbles',
      recorded_at: at,
      observed_at: at,
      model_version: READINESS.version,
      predicted_estimate: body.prediction.pct,
      predicted_range: [body.prediction.low, body.prediction.high],
      forecast_issued_at: body.prediction.issued_at
    };
    let record;
    if (body.action === 'skip') {
      record = { ...base, skipped: true, answers: null, questions: [], final_estimate: null, residual: null, reason_status: 'not_needed' };
    } else {
      const residual = body.final - body.prediction.pct;
      const outside = body.final < body.prediction.low || body.final > body.prediction.high;
      const discrepant = outside && Math.abs(residual) >= READINESS.discrepancy;
      record = {
        ...base,
        skipped: false,
        answers: body.answers,
        questions: body.questions,
        reported_estimate: body.answers.overall ? body.final : null,
        final_estimate: body.final,
        residual,
        reason_status: discrepant ? 'pending' : 'not_needed',
        reason_codes: [],
        note: null,
        supersedes_observation_id: existing?.skipped ? existing.id : null
      };
    }
    await setJSON(store, key, record);
    return withCors(okResponse(200, { saved: true, checkin: record }), request, env);
  }, { getContentStore: defaultGetTasksStore, unboundMessage: 'Tasks store is not bound.', ...deps });
}

export default createReadinessCheckinHandler();

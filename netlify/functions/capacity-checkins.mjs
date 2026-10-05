/**
 * /api/capacity-checkins — morning bubbles, forecast snapshots and discrepancy reasons.
 *
 *   GET  ?date=YYYY-MM-DD[&days=14]
 *        → { snapshot, observations, discrepancies, recent }
 *   POST { action: 'snapshot', date, snapshot }           first pre-answer forecast for the day
 *   POST { action: 'observe', date, answers, notes?, snapshot?, supersedes_observation_id? }
 *   POST { action: 'reason', observation_id, date, reason_codes, note? }
 *   POST { action: 'delete', observation_id, date }
 *
 * Rules (docs/capacity-forecast-handoff/check-ins-and-logging.md):
 * - Snapshots are immutable: the first one issued for a day/target is kept forever.
 * - Observations are append-only. A correction is a new observation that supersedes the
 *   old one; nothing is edited in place.
 * - The residual is computed here against the stored snapshot (the prediction issued
 *   before the answer), never against a number the client sends with the answer.
 * - The observation is saved and usable before any reason is given; the reason lands on
 *   a separate discrepancy record. "Not sure" is a valid, honest reason.
 * - Deleted observations (deleted_at) never reach the forecast, history or agents.
 * - Central Node gets one short dated line per day, linked to the observation id,
 *   replaced (not duplicated) when the day's check-in is corrected. Best effort: the
 *   observation never waits on GitHub.
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetTasksStore, getJSON, listJSON, newRecordId, readIndex, setJSON, writeIndex } from './_shared/tasks-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { withoutDeleted } from './_shared/record-liveness.mjs';
import { createGitHubClient } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { appendRecentAction, formatLogDate } from '../../apps/life/js/core/central-node-write.js';
import { ANSWERS, REASONS, discrepancy, reportedEstimate, sydneyLocal, addDays } from '../../packages/design-kit/js/calendar/readiness-model.js';

export const config = { path: '/api/capacity-checkins' };

export const CAPACITY_PREFIX = 'capacity/';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const TARGETS = new Set(['morning']);
const DOMAINS = new Set(Object.keys(ANSWERS));
const CENTRAL_NODE_PATH = 'central-node.md';
/** The Almanac caches its view; a check-in changes capacity, so the cache must go. */
const ALMANAC_SNAPSHOT_KEY = 'meta/almanac_snapshot';
const dropAlmanacCache = store => setJSON(store, ALMANAC_SNAPSHOT_KEY, null).catch(() => {});

export const snapshotKey = (date, target = 'morning') => `${CAPACITY_PREFIX}snapshots/${date}--${target}`;
export const obsPrefix = date => `${CAPACITY_PREFIX}observations/${date}/`;
export const discPrefix = date => `${CAPACITY_PREFIX}discrepancies/${date}/`;

const finite = v => (Number.isFinite(v) ? v : null);
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Validate answers: known domain → known code (or the "premise was wrong" route). */
export function readAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [domain, code] of Object.entries(raw)) {
    if (!DOMAINS.has(domain)) return null;
    if (code !== 'premise_wrong' && !ANSWERS[domain][code]) return null;
    out[domain] = code;
  }
  return out;
}

/** Only the shape we archive; the client cannot plant arbitrary fields. */
export function readSnapshot(raw, date) {
  if (!raw || typeof raw !== 'object') return null;
  const est = finite(raw.predicted_estimate);
  const range = Array.isArray(raw.predicted_range) ? raw.predicted_range.map(Number) : null;
  if (est == null || est < 0 || est > 100 || !range || range.length !== 2 || !range.every(Number.isFinite)) return null;
  const target = TARGETS.has(raw.target) ? raw.target : 'morning';
  const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj && k in obj).map(k => [k, obj[k]]));
  return {
    date,
    target,
    model_version: clip(raw.model_version, 60),
    predicted_estimate: Math.round(est),
    predicted_range: [Math.round(range[0]), Math.round(range[1])],
    domains: pick(raw.domains, ['physical', 'cognitive', 'emotional']),
    inputs: pick(raw.inputs, ['energy', 'focus', 'mood', 'health', 'sleep', 'history']),
    sources: pick(raw.sources, ['energy', 'focus', 'mood', 'health', 'sleep']),
    missing: Array.isArray(raw.missing) ? raw.missing.map(m => clip(m, 20)).slice(0, 8) : [],
    state: Number.isInteger(raw.state) && raw.state >= 1 && raw.state <= 30 ? raw.state : null,
    explanation: clip(raw.explanation, 400) || null,
    features: raw.features && typeof raw.features === 'object' ? JSON.parse(JSON.stringify(raw.features)) : null
  };
}

async function listDay(store, prefix, { list = true } = {}) {
  const ids = await readIndex(store, `${prefix}_index`);
  const rows = await Promise.all(ids.map(id => getJSON(store, `${prefix}${id}`).catch(() => null)));
  // Blob listing can lag a fresh write; the index covers that. History reads skip it.
  const listed = list ? await listJSON(store, prefix).catch(() => []) : [];
  const byId = new Map();
  for (const row of [...rows, ...listed]) if (row?.id) byId.set(row.id, row);
  return [...byId.values()];
}

/** Live observations: not deleted and not superseded by a later live correction. */
export function liveObservations(rows) {
  const alive = withoutDeleted(rows);
  const superseded = new Set(alive.map(r => r.supersedes_observation_id).filter(Boolean));
  return alive.filter(r => !superseded.has(r.id)).sort((a, b) => String(a.observed_at).localeCompare(String(b.observed_at)));
}

async function putSnapshotOnce(store, date, body, at) {
  const key = snapshotKey(date, body.target);
  const existing = await getJSON(store, key);
  if (existing) return { snapshot: existing, created: false };
  const snapshot = { id: newRecordId('fcs'), ...body, issued_at: at, issued_local: sydneyLocal(at) };
  await setJSON(store, key, snapshot);
  return { snapshot, created: true };
}

/** Central Node one-liner for the day's check-in. Replaces that day's earlier line. */
export function centralNodeLine(obs, snapshot) {
  const time = (obs.observed_local ?? '').slice(11, 16) || 'Morning';
  const parts = [];
  const rep = obs.reported_estimate;
  if (rep != null && snapshot) {
    const diff = rep - snapshot.predicted_estimate;
    parts.push(Math.abs(diff) < 10 ? 'readiness close to forecast' : diff < 0 ? 'readiness lower than forecast' : 'readiness higher than forecast');
  } else if (rep != null) parts.push(`readiness ${ANSWERS.overall[obs.answers.overall]?.label.toLowerCase()}`);
  const a = obs.answers ?? {};
  if (a.sleep && a.sleep !== 'premise_wrong') parts.push(`sleep ${ANSWERS.sleep[a.sleep].label.toLowerCase()}`);
  if (a.lingering && a.lingering !== 'premise_wrong') parts.push(`lingering: ${ANSWERS.lingering[a.lingering].label.toLowerCase()}`);
  if (a.symptoms && a.symptoms !== 'premise_wrong') parts.push(`symptoms ${ANSWERS.symptoms[a.symptoms].label.toLowerCase()}`);
  if (a.energy && a.energy !== 'premise_wrong') parts.push(`energy ${ANSWERS.energy[a.energy].label.toLowerCase()}`);
  if (a.focus && a.focus !== 'premise_wrong') parts.push(`focus ${ANSWERS.focus[a.focus].label.toLowerCase()}`);
  const body = parts.length ? parts.join('; ') : 'answered';
  return `**${formatLogDate(obs.local_date)}:** Capacity: ${time} morning check-in: ${body}. (check-in ${obs.id})`;
}

/** Pure: put the line in, dropping that date's previous Capacity line. */
export function upsertCentralNodeLine(content, line, date) {
  const marker = `**${formatLogDate(date)}:** Capacity:`;
  const cleaned = content.split('\n').filter(l => !l.trim().startsWith(marker)).join('\n');
  return appendRecentAction(cleaned, line);
}

async function syncCentralNode(openRepo, obs, snapshot) {
  const { client } = await openRepo();
  const current = await client.resolveTree();
  const entry = current.tree.find(item => item.path === CENTRAL_NODE_PATH && item.type === 'blob');
  if (!entry) return { updated: false, reason: 'no_central_node' };
  const content = decodeBlob(await client.readBlob(entry.sha));
  if (content == null) return { updated: false, reason: 'decode_failed' };
  const updated = upsertCentralNodeLine(content, centralNodeLine(obs, snapshot), obs.local_date);
  if (updated === content) return { updated: false, reason: 'unchanged' };
  await client.writeFile({ path: CENTRAL_NODE_PATH, content: updated, sha: entry.sha, message: `chore(central-node): capacity check-in ${obs.local_date}` });
  return { updated: true };
}

/** The route itself: (Request, { env, store }) → Response. The operator gate wraps it. */
export function capacityCheckinsRoute(deps = {}) {
  const now = deps.now ?? Date.now;
  const openRepo = deps.openRepo ?? (async () => ({ client: createGitHubClient({ env: process.env, fetchImpl: fetch }) }));
  return async (request, context) => {
    const { env, store } = context;
    const bad = msg => withCors(errorResponse(400, 'invalid_request', msg, false), request, env);

    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const date = params.get('date') ?? '';
      if (!DATE.test(date)) return bad('Provide date.');
      const days = Math.min(21, Math.max(0, Number(params.get('days') ?? 14) || 0));
      const snapshot = await getJSON(store, snapshotKey(date));
      const observations = liveObservations(await listDay(store, obsPrefix(date)));
      const discrepancies = withoutDeleted(await listDay(store, discPrefix(date)));
      const recent = [];
      for (let i = 1; i <= days; i += 1) {
        const d = addDays(date, -i);
        const rows = liveObservations(await listDay(store, obsPrefix(d), { list: false }));
        if (rows.length) recent.push(...rows);
      }
      return withCors(okResponse(200, { date, snapshot: snapshot ?? null, observations, discrepancies, recent }), request, env);
    }
    if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);

    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const body = parsed.value;
    if (!DATE.test(body?.date ?? '')) return bad('Provide date.');
    const date = body.date;
    const at = new Date(now()).toISOString();

    if (body.action === 'snapshot') {
      const snap = readSnapshot(body.snapshot, date);
      if (!snap) return bad('Snapshot needs predicted_estimate and predicted_range.');
      const existingObs = liveObservations(await listDay(store, obsPrefix(date)));
      // A forecast issued after the answer is not a forecast: refuse to back-fill it.
      if (existingObs.length && !(await getJSON(store, snapshotKey(date, snap.target)))) {
        return withCors(errorResponse(409, 'answered', 'Today already has a check-in; its forecast cannot be issued now.', false), request, env);
      }
      const result = await putSnapshotOnce(store, date, snap, at);
      return withCors(okResponse(result.created ? 201 : 200, result), request, env);
    }

    if (body.action === 'observe') {
      const answers = readAnswers(body.answers);
      if (!answers || !Object.keys(answers).length) return bad('Pick at least one answer, or skip.');
      if (body.supersedes_observation_id != null && !ID.test(body.supersedes_observation_id)) return bad('Bad supersedes id.');
      // The pre-answer forecast is stored first (if the client could not send it earlier).
      let snapshot = await getJSON(store, snapshotKey(date));
      if (!snapshot && body.snapshot) {
        const snap = readSnapshot(body.snapshot, date);
        if (snap) snapshot = (await putSnapshotOnce(store, date, snap, at)).snapshot;
      }
      const reported = reportedEstimate(answers);
      const d = discrepancy({ predicted: snapshot?.predicted_estimate, predictedRange: snapshot?.predicted_range, reported });
      const id = newRecordId('obs');
      const obs = {
        id,
        observed_at: at,
        recorded_at: at,
        observed_local: sydneyLocal(at),
        local_date: date,
        source: 'morning_bubbles',
        domain: 'overall_readiness',
        answers,
        answer_text: Object.fromEntries(Object.entries(answers).map(([k, c]) => [k, c === 'premise_wrong' ? 'Something else' : ANSWERS[k][c].label])),
        notes: clip(body.notes, 280) || null,
        reported_estimate: reported,
        answer_resolution: reported != null ? 'coarse_anchor' : null,
        sleep_quality: answers.sleep ?? null,
        sleep_trend: answers.sleep ? ANSWERS.sleep[answers.sleep]?.trend ?? null : null,
        residual_fatigue: answers.sleep ? Boolean(ANSWERS.sleep[answers.sleep]?.residual) : null,
        focus: answers.focus ?? null,
        forecast_snapshot_id: snapshot?.id ?? null,
        forecast_issued_at: snapshot?.issued_at ?? null,
        forecast_target: snapshot?.target ?? 'morning',
        model_version: snapshot?.model_version ?? null,
        predicted_estimate: snapshot?.predicted_estimate ?? null,
        predicted_range: snapshot?.predicted_range ?? null,
        residual: d.residual,
        reason_status: d.ask ? 'pending' : 'not_needed',
        supersedes_observation_id: body.supersedes_observation_id ?? null,
        central_node_receipt_id: null
      };
      const prefix = obsPrefix(date);
      await setJSON(store, `${prefix}${id}`, obs);
      await writeIndex(store, `${prefix}_index`, [...await readIndex(store, `${prefix}_index`), id]);
      if (d.ask) {
        const dp = discPrefix(date);
        await setJSON(store, `${dp}${id}`, {
          id, observation_id: id, local_date: date, created_at: at,
          forecast_snapshot_id: snapshot?.id ?? null, predicted_estimate: snapshot?.predicted_estimate ?? null,
          reported_estimate: reported, residual: d.residual, direction: d.direction,
          reason_codes: [], note: null, reason_status: 'pending'
        });
        await writeIndex(store, `${dp}_index`, [...await readIndex(store, `${dp}_index`), id]);
      }
      await dropAlmanacCache(store);
      let centralNode = { updated: false, reason: 'skipped' };
      try {
        centralNode = await syncCentralNode(openRepo, obs, snapshot);
        if (centralNode.updated) {
          obs.central_node_receipt_id = `cn:${date}:${id}`;
          await setJSON(store, `${prefix}${id}`, obs);
        }
      } catch (error) {
        centralNode = { updated: false, reason: 'central_node_failed' };
        console.error('capacity check-in central node sync failed', error instanceof Error ? error.message : error);
      }
      return withCors(okResponse(201, { observation: obs, snapshot, askReason: d.ask, centralNode }), request, env);
    }

    if (body.action === 'reason') {
      if (!ID.test(body.observation_id ?? '')) return bad('Provide observation_id.');
      const codes = Array.isArray(body.reason_codes) ? [...new Set(body.reason_codes)] : [];
      if (!codes.length || codes.length > 4 || !codes.every(c => c in REASONS)) return bad('Pick a reason, or Not sure.');
      const key = `${discPrefix(date)}${body.observation_id}`;
      const rec = await getJSON(store, key);
      if (!rec) return withCors(errorResponse(404, 'not_found', 'No discrepancy for that check-in.', false), request, env);
      const note = clip(body.note, 280) || null;
      const next = { ...rec, reason_codes: codes, note, reason_status: codes.includes('not_sure') && codes.length === 1 ? 'unexplained' : 'provided', reason_at: at };
      await setJSON(store, key, next);
      return withCors(okResponse(200, { discrepancy: next }), request, env);
    }

    if (body.action === 'delete') {
      if (!ID.test(body.observation_id ?? '')) return bad('Provide observation_id.');
      const key = `${obsPrefix(date)}${body.observation_id}`;
      const rec = await getJSON(store, key);
      if (!rec) return withCors(errorResponse(404, 'not_found', 'No such check-in.', false), request, env);
      await setJSON(store, key, { ...rec, deleted_at: at });
      const dkey = `${discPrefix(date)}${body.observation_id}`;
      const disc = await getJSON(store, dkey);
      if (disc) await setJSON(store, dkey, { ...disc, deleted_at: at });
      await dropAlmanacCache(store);
      return withCors(okResponse(200, { deleted: true }), request, env);
    }

    return bad('Unknown action.');
  };
}

export function createCapacityCheckinsHandler(deps = {}) {
  return createOperatorHandler(capacityCheckinsRoute(deps), { getContentStore: defaultGetTasksStore, unboundMessage: 'Tasks store is not bound.', ...deps });
}

export default createCapacityCheckinsHandler();

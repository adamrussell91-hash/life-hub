/**
 * /api/mio — Mio opportunities (Day Sense step 11).
 *
 *   GET                                   → { synced_at, places, declined }
 *   POST { decline: { save_id, date } }   → "Not this time": remembered 60 days, nothing else
 *   POST { plan: { save_id, date, start, end, after? } } → queues a Hammond `outing` ghost
 *        (the client accepts it through /api/calendar-ghosts, like any proposal)
 *
 * Mio has no server credential here: its connector belongs to Claude. A Claude session
 * with the connector writes `mio-candidates.json` to the data repo on request (see
 * docs/MIO-SYNC.md); this endpoint only reads that cache. Mio stays the source of truth.
 */
import { createHash } from 'node:crypto';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { createGitHubClient, GitHubClientError, GitHubConfigurationError } from './_shared/github-client.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';
import { getSydneyDateKey, getSydneyTimestamp } from '../../apps/life/js/core/time.js';
import { validateGhost } from '../../apps/life/js/app/ghost-writes.js';
import { PENDING_CALENDAR_GHOSTS_PATH, parsePendingCalendarGhostsDoc, serializePendingCalendarGhosts } from './calendar-ghosts.mjs';
import { openAlmanacRepo } from './almanac.mjs';
import { MIO, parseCandidates } from '../../packages/design-kit/js/calendar/mio-model.js';

export const config = { path: '/api/mio' };

const CACHE_KEY = 'meta/mio_cache';
const DECLINED_KEY = 'meta/mio_declined';
const CACHE_MS = 30 * 60 * 1000;
const DECLINE_DAYS = 60;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

async function readCandidates({ store, client, nowMs }) {
  const hit = await getJSON(store, CACHE_KEY).catch(() => null);
  if (hit && nowMs - hit.at < CACHE_MS) return hit.doc;
  const opened = await openAlmanacRepo(client);
  const doc = parseCandidates(await opened.readFile(MIO.candidatesPath));
  await setJSON(store, CACHE_KEY, { at: nowMs, doc }).catch(() => {});
  return doc;
}

async function readDeclined(store, today) {
  const list = await getJSON(store, DECLINED_KEY).catch(() => null);
  const floor = new Date(Date.parse(`${today}T00:00:00Z`) - DECLINE_DAYS * 86_400_000).toISOString().slice(0, 10);
  return (Array.isArray(list) ? list : []).filter((row) => row && typeof row.save_id === 'string' && row.date >= floor);
}

/** The outing ghost for "Plan it". Throws TypeError on a bad request. */
export function mioOutingGhost(plan, place, { nowIso }) {
  if (!DATE.test(plan?.date ?? '') || !TIME.test(plan?.start ?? '') || !TIME.test(plan?.end ?? '') || plan.start >= plan.end) {
    throw new TypeError('plan needs date and start < end');
  }
  const after = typeof plan.after === 'string' ? plan.after.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const ghost = {
    id: `mio-${plan.date}-${createHash('sha256').update(`${place.id}|${plan.start}`).digest('hex').slice(0, 10)}`,
    agent: 'hammond',
    kind: 'outing',
    date: plan.date,
    start: plan.start,
    end: plan.end,
    title: place.name,
    place: place.address || place.area,
    notes: `From your Mio saves${place.creator ? ` (saved from ${place.creator})` : ''}.`,
    reason: after ? `On the way: ${after}` : 'From your Mio saves'
  };
  validateGhost(ghost);
  return {
    ...ghost,
    label: place.name,
    meta: `Hammond · ${ghost.reason}`,
    chip: { date: ghost.date, start: ghost.start, end: ghost.end, kind: 'social' },
    created_at: nowIso,
    status: 'pending',
    via: 'mio'
  };
}

export function createMioHandler(deps = {}) {
  const createClient = deps.createGitHubClient ?? createGitHubClient;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const tasksStore = deps.getTasksStore ?? defaultGetTasksStore;
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    const instant = new Date(now());
    const today = getSydneyDateKey(instant);
    let store;
    let client;
    try {
      store = await tasksStore(env);
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) return withCors(errorResponse(503, 'misconfigured', 'Repository is not configured.', false), request, env);
      return withCors(errorResponse(503, 'unavailable', 'Mio saves are unavailable right now.', true), request, env);
    }

    if (request.method === 'GET') {
      try {
        const doc = await readCandidates({ store, client, nowMs: instant.getTime() });
        const declined = await readDeclined(store, today);
        return withCors(okResponse(200, { ...doc, declined: declined.map((row) => `${row.save_id}|${row.date}`) }), request, env);
      } catch {
        return withCors(errorResponse(503, 'github_unavailable', 'Mio saves are unavailable right now.', true), request, env);
      }
    }
    if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);

    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const body = parsed.value;
    if (body.decline) {
      const { save_id: saveId, date } = body.decline;
      if (typeof saveId !== 'string' || !saveId || !DATE.test(date ?? '')) {
        return withCors(errorResponse(400, 'invalid_request', 'decline needs save_id and date', false), request, env);
      }
      const list = (await readDeclined(store, today)).filter((row) => !(row.save_id === saveId && row.date === date));
      await setJSON(store, DECLINED_KEY, [...list, { save_id: saveId.slice(0, 64), date, at: instant.toISOString() }]);
      return withCors(okResponse(200, { declined: true }), request, env);
    }
    if (!body.plan) return withCors(errorResponse(400, 'invalid_request', 'Send decline or plan.', false), request, env);

    let entry;
    try {
      const doc = await readCandidates({ store, client, nowMs: instant.getTime() });
      const place = doc.places.find((row) => row.id === body.plan.save_id);
      if (!place) return withCors(errorResponse(404, 'not_found', 'That place is not in your synced Mio saves.', false), request, env);
      entry = mioOutingGhost(body.plan, place, { nowIso: getSydneyTimestamp(instant) });
    } catch (error) {
      if (error instanceof TypeError) return withCors(errorResponse(400, 'invalid_ghost', error.message, false), request, env);
      return withCors(errorResponse(503, 'github_unavailable', 'Mio saves are unavailable right now.', true), request, env);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const opened = await openAlmanacRepo(client);
        const doc = parsePendingCalendarGhostsDoc(await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH));
        if (!doc.ghosts.some((row) => row.id === entry.id)) {
          await client.commitFiles({
            files: [{ path: PENDING_CALENDAR_GHOSTS_PATH, content: serializePendingCalendarGhosts([...doc.ghosts, entry], doc.last_run) }],
            message: `chore(calendar): mio outing ${entry.date}`,
            parentSha: opened.base.commitSha,
            baseTreeSha: opened.base.treeSha
          });
        }
        return withCors(okResponse(200, { ghost: entry }), request, env);
      } catch (error) {
        if (error instanceof GitHubClientError && error.code === 'write_conflict' && attempt === 0) continue;
        return withCors(errorResponse(503, 'github_unavailable', 'The repository is temporarily unavailable.', true), request, env);
      }
    }
    return withCors(errorResponse(409, 'write_conflict', 'The repository changed while saving. Try again.', true), request, env);
  }, deps);
}

export default createMioHandler();

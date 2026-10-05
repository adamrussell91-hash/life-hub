/**
 * /api/readiness-insights — patterns between capacity and the rest of Adam's life,
 * computed deterministically (no AI) and cached for the Life agents to OFFER.
 *
 *   GET                                   → { enabled, computed_at, insights: [{ id, agents, topic }] }
 *   POST { action: 'refresh' }            → recompute from six weeks of Life logs + check-ins
 *   POST { action: 'settings', enabled }  → Adam's off switch
 *
 * The finding text is never returned here: agents only reveal it after Adam says yes
 * (readiness-insight-turn.mjs). Everything stays in the private tasks store.
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createGitHubClient } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { githubOpenCommit, readEvents } from './_shared/calendar-ghosts-propose.mjs';
import { readinessEvidenceEvents } from './_shared/readiness-evidence.mjs';
import { loadTeachingLessonsFromBlobs, readSchoolTerms } from './almanac.mjs';
import { findInsights, INSIGHT_WINDOW_DAYS } from '../../packages/design-kit/js/calendar/readiness-insights.js';
import { addDays } from '../../packages/design-kit/js/calendar/readiness-model.js';
import { isHoliday as isSchoolHoliday } from '../../packages/design-kit/js/school-time.js';
import { getSydneyDateKey } from '../../apps/life/js/core/time.js';

export const config = { path: '/api/readiness-insights' };

export const INSIGHTS_KEY = 'insights/readiness';
export const INSIGHT_STATE_KEY = 'insights/readiness_state';
export const INSIGHT_SETTINGS_KEY = 'insights/readiness_settings';
const LIFE_LOG_PATH = /^data\/(?:nutrition|mind|sleep|fitness)\//;

/** Settings default to on; Adam can switch them off. */
export async function insightsEnabled(store) {
  const settings = await getJSON(store, INSIGHT_SETTINGS_KEY).catch(() => null);
  return settings?.enabled !== false;
}

/** Recompute and cache. Shared by the endpoint and the check-in save. */
export async function refreshInsights({ store, env = process.env, now = new Date(), openRepo = null, loadLessons = loadTeachingLessonsFromBlobs, loadMeetings }) {
  const today = getSydneyDateKey(now);
  const from = addDays(today, -(INSIGHT_WINDOW_DAYS + 25));
  const repo = openRepo ? await openRepo() : await githubOpenCommit(createGitHubClient({ env, fetchImpl: fetch }), { decodeBlob }).open();
  const paths = (typeof repo.listPaths === 'function' ? repo.listPaths() : []).filter(path => LIFE_LOG_PATH.test(path));
  const logs = await readEvents(paths, path => repo.readFile(path), from, today, () => {});
  const terms = await readSchoolTerms(async () => store, { warn: () => {} });
  const extra = await readinessEvidenceEvents({
    store,
    today,
    lessons: await loadLessons(env).catch(() => []),
    now: now.getTime(),
    lookback: INSIGHT_WINDOW_DAYS + 25,
    env,
    ...(loadMeetings ? { loadMeetings } : {})
  });
  const insights = findInsights({ events: [...logs, ...extra], today, isHoliday: date => isSchoolHoliday(date, terms) });
  const doc = { computed_at: now.toISOString(), today, insights };
  await setJSON(store, INSIGHTS_KEY, doc);
  return doc;
}

/** The route itself: (Request, { env, store }) → Response. The operator gate wraps it. */
export function readinessInsightsRoute(deps = {}) {
  const now = deps.now ?? (() => new Date());
  return async (request, context) => {
    const { env, store } = context;
    if (request.method === 'GET') {
      const doc = await getJSON(store, INSIGHTS_KEY).catch(() => null);
      return withCors(okResponse(200, {
        enabled: await insightsEnabled(store),
        computed_at: doc?.computed_at ?? null,
        insights: (doc?.insights ?? []).map(({ id, agents, topic }) => ({ id, agents, topic }))
      }), request, env);
    }
    if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const body = parsed.value;
    if (body?.action === 'settings') {
      if (typeof body.enabled !== 'boolean') return withCors(errorResponse(400, 'invalid_request', 'enabled must be true or false.', false), request, env);
      await setJSON(store, INSIGHT_SETTINGS_KEY, { enabled: body.enabled, updated_at: now().toISOString() });
      return withCors(okResponse(200, { enabled: body.enabled }), request, env);
    }
    if (body?.action === 'refresh') {
      try {
        const doc = await refreshInsights({ store, env, now: now(), openRepo: deps.openRepo ?? null, loadLessons: deps.loadLessons, loadMeetings: deps.loadMeetings });
        return withCors(okResponse(200, { computed_at: doc.computed_at, count: doc.insights.length }), request, env);
      } catch (error) {
        console.error('readiness insights refresh failed', error instanceof Error ? error.message : error);
        return withCors(errorResponse(503, 'refresh_failed', 'Could not read your logs right now.', true), request, env);
      }
    }
    return withCors(errorResponse(400, 'invalid_request', 'Unknown action.', false), request, env);
  };
}

export function createReadinessInsightsHandler(deps = {}) {
  return createOperatorHandler(readinessInsightsRoute(deps), { getContentStore: defaultGetTasksStore, unboundMessage: 'Tasks store is not bound.', ...deps });
}

export default createReadinessInsightsHandler();

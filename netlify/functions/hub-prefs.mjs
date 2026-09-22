import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/hub-prefs' };

const HUB_PREFS_KEY = 'meta/hub_prefs';
const DEFAULT_TZ = 'Australia/Sydney';

function parseHubPrefs(raw) {
  const body = raw && typeof raw === 'object' ? raw : {};
  const dismissed = Array.isArray(body.dismissed_insight_ids)
    ? body.dismissed_insight_ids
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const id = String(row.id ?? '').trim();
          const fingerprint = String(row.fingerprint ?? '').trim();
          return id && fingerprint ? { id, fingerprint } : null;
        })
        .filter(Boolean)
    : [];
  return {
    schema_version: 1,
    timezone: typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone : DEFAULT_TZ,
    updated_at: typeof body.updated_at === 'string' ? body.updated_at : null,
    dismissed_insight_ids: dismissed
  };
}

export function createHubPrefsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const prefs = parseHubPrefs(await getJSON(store, HUB_PREFS_KEY));
        return withCors(okResponse(200, prefs), request, env);
      }

      if (request.method !== 'PATCH' && request.method !== 'PUT') {
        return withCors(methodNotAllowed('GET, PATCH, PUT, OPTIONS'), request, env);
      }

      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const current = parseHubPrefs(await getJSON(store, HUB_PREFS_KEY));
      const next = parseHubPrefs({
        ...current,
        ...(parsed.value && typeof parsed.value === 'object' ? parsed.value : {}),
        updated_at: new Date().toISOString()
      });
      await setJSON(store, HUB_PREFS_KEY, next);
      return withCors(okResponse(200, next), request, env);
    } catch (error) {
      return withCors(errorResponse(400, 'bad_request', error.message, false), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createHubPrefsHandler();

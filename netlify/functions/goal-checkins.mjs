// netlify/functions/goal-checkins.mjs
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/goal-checkins' };

function keyFor(date) {
  return `goal_checkins/${date}`;
}

const LATEST_KEY = 'goal_checkins/latest';

export function createGoalCheckinsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const date = url.searchParams.get('date');
        if (date) {
          const row = (await getJSON(store, keyFor(date))) ?? (await getJSON(store, LATEST_KEY));
          return withCors(okResponse(200, { checkin: row }), request, env);
        }
        const latest = await getJSON(store, LATEST_KEY);
        return withCors(okResponse(200, { checkin: latest }), request, env);
      }
      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const date = typeof parsed.value.date === 'string' ? parsed.value.date : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return withCors(errorResponse(400, 'invalid_date', 'date must be YYYY-MM-DD', false), request, env);
        }
        const row = {
          date,
          moved: Array.isArray(parsed.value.moved) ? parsed.value.moved : [],
          stuck: Array.isArray(parsed.value.stuck) ? parsed.value.stuck : [],
          moves_planned: Number(parsed.value.moves_planned) || 0,
          saved_at: new Date().toISOString()
        };
        await setJSON(store, keyFor(date), row);
        await setJSON(store, LATEST_KEY, row);
        // Persist stuck reasons onto goal_reads/<id>
        for (const item of row.stuck) {
          if (!item?.id || !item?.reason) continue;
          const cached = (await getJSON(store, `goal_reads/${item.id}`)) ?? {};
          await setJSON(store, `goal_reads/${item.id}`, { ...cached, stuck_reason: item.reason });
        }
        return withCors(okResponse(200, { checkin: row }), request, env);
      }
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch {
      return withCors(errorResponse(503, 'tasks_blobs_unbound', 'Tasks content store is not bound.', true), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createGoalCheckinsHandler();

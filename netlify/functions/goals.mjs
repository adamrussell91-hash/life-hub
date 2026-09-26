import { createTasksCollectionHandler } from './_shared/tasks-collection.mjs';
import { GOAL_INPUT_KEYS, normalizeGoalRecord, ensureGoalSphere } from './_shared/goal-record.mjs';
import { listJSON } from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/goals' };

function pickGoalInput(body) {
  const out = {};
  for (const key of GOAL_INPUT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

async function areasById(store) {
  const areas = await listJSON(store, 'areas/');
  const map = new Map();
  for (const area of areas) {
    if (area && typeof area === 'object' && typeof area.id === 'string') map.set(area.id, area);
  }
  return map;
}

export function createGoalsHandler(deps = {}) {
  return createTasksCollectionHandler({
    prefix: 'goals/',
    indexKey: 'goals/_index',
    listKey: 'goals',
    idPrefix: 'goal',
    notFound: 'Goal not found',
    normalize: normalizeGoalRecord,
    pickPatch: pickGoalInput,
    async onRead(record, store) {
      return ensureGoalSphere(record, await areasById(store));
    },
    async beforePatch(existing, patch, store) {
      // Write through a derived sphere on the next write (§2.3).
      if (Object.prototype.hasOwnProperty.call(patch, 'sphere')) return patch;
      const ensured = ensureGoalSphere(existing, await areasById(store));
      if (!ensured._sphere_derived) return patch;
      return { ...patch, sphere: ensured.sphere };
    },
    create(body, id, timestamp) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        return { error: { code: 'validation_error', message: 'title is required' } };
      }
      return {
        record: {
          ...pickGoalInput(body),
          schema_version: 1,
          id,
          title,
          parent_area_id: typeof body.parent_area_id === 'string' ? body.parent_area_id : null,
          parent_someday_id: typeof body.parent_someday_id === 'string' ? body.parent_someday_id : null,
          created_at: timestamp,
          updated_at: timestamp
        }
      };
    }
  }, deps);
}

export default createGoalsHandler();

import { createTasksCollectionHandler } from './_shared/tasks-collection.mjs';
import { GOAL_INPUT_KEYS, normalizeGoalRecord } from './_shared/goal-record.mjs';

export const config = { path: '/api/goals' };

function pickGoalInput(body) {
  const out = {};
  for (const key of GOAL_INPUT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
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

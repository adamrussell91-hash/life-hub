import { createTasksCollectionHandler } from './_shared/tasks-collection.mjs';

export const config = { path: '/api/goals' };

export function createGoalsHandler(deps = {}) {
  return createTasksCollectionHandler({
    prefix: 'goals/',
    indexKey: 'goals/_index',
    listKey: 'goals',
    idPrefix: 'goal',
    notFound: 'Goal not found',
    create(body, id, timestamp) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        return { error: { code: 'validation_error', message: 'title is required' } };
      }
      return {
        record: {
          schema_version: 1,
          id,
          title,
          description: typeof body.description === 'string' ? body.description : '',
          parent_area_id: typeof body.parent_area_id === 'string' ? body.parent_area_id : null,
          status: 'active',
          created_at: timestamp,
          updated_at: timestamp
        }
      };
    }
  }, deps);
}

export default createGoalsHandler();

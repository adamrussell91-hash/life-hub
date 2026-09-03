import { createTasksCollectionHandler } from './_shared/tasks-collection.mjs';

export const config = { path: '/api/areas' };

export function createAreasHandler(deps = {}) {
  return createTasksCollectionHandler({
    prefix: 'areas/',
    indexKey: 'areas/_index',
    listKey: 'areas',
    idPrefix: 'area',
    notFound: 'Area not found',
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
          created_at: timestamp,
          updated_at: timestamp
        }
      };
    }
  }, deps);
}

export default createAreasHandler();

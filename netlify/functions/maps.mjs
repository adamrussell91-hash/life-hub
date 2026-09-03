import { createTasksCollectionHandler } from './_shared/tasks-collection.mjs';

export const config = { path: '/api/maps' };

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function createMapsHandler(deps = {}) {
  return createTasksCollectionHandler({
    prefix: 'maps/',
    indexKey: 'maps/_index',
    listKey: 'maps',
    idPrefix: 'map',
    notFound: 'Map not found',
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
          year: Number.isInteger(body.year) ? body.year : null,
          lines: asArray(body.lines),
          stations: asArray(body.stations),
          ticks: asArray(body.ticks),
          created_at: timestamp,
          updated_at: timestamp
        }
      };
    }
  }, deps);
}

export default createMapsHandler();

import { createTasksCollectionHandler } from './_shared/tasks-collection.mjs';

export const config = { path: '/api/projects' };

export function createProjectsHandler(deps = {}) {
  return createTasksCollectionHandler({
    prefix: 'projects/',
    indexKey: 'projects/_index',
    listKey: 'projects',
    idPrefix: 'proj',
    notFound: 'Project not found',
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
          type: typeof body.type === 'string' ? body.type : 'standard',
          status: 'active',
          parent_goal_id: typeof body.parent_goal_id === 'string' ? body.parent_goal_id : null,
          created_at: timestamp,
          updated_at: timestamp
        }
      };
    }
  }, deps);
}

export default createProjectsHandler();

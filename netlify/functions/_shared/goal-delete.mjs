// netlify/functions/_shared/goal-delete.mjs
import {
  deleteKey,
  getJSON,
  listJSON,
  PROJECT_PREFIX,
  setJSON,
  TASK_PREFIX
} from './tasks-blobs.mjs';

function touch(record) {
  return { ...record, updated_at: new Date().toISOString() };
}

/**
 * Side-effects when a goal is deleted:
 * - hosted projects and tasks get parent_goal_id: null
 * - goal_reads/<id> is removed
 * - the id is dropped from any Someday idea's linked_goal_ids
 */
export async function cascadeGoalDelete(store, goalId) {
  if (!goalId || typeof goalId !== 'string') return;

  const [projects, tasks] = await Promise.all([
    listJSON(store, PROJECT_PREFIX),
    listJSON(store, TASK_PREFIX)
  ]);

  await Promise.all([
    ...projects
      .filter(p => p && typeof p === 'object' && p.parent_goal_id === goalId && typeof p.id === 'string')
      .map(p => setJSON(store, `${PROJECT_PREFIX}${p.id}`, touch({ ...p, parent_goal_id: null }))),
    ...tasks
      .filter(t => t && typeof t === 'object' && typeof t.id === 'string')
      .map(async t => {
        let next = t;
        let changed = false;
        if (t.parent_goal_id === goalId) {
          next = { ...next, parent_goal_id: null };
          changed = true;
        }
        if (Array.isArray(t.linked_goal_ids) && t.linked_goal_ids.includes(goalId)) {
          next = {
            ...next,
            linked_goal_ids: t.linked_goal_ids.filter(id => id !== goalId)
          };
          changed = true;
        }
        if (changed) await setJSON(store, `${TASK_PREFIX}${t.id}`, touch(next));
      }),
    deleteKey(store, `goal_reads/${goalId}`).catch(() => null)
  ]);
}

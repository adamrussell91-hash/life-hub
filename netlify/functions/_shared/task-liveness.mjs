/**
 * One definition of "is this task still live?" for every server-side agent and tool.
 *
 * A task is closed when it is done (status 'done', bucket 'done', or completed_at) or
 * trashed (status 'dead' — what the Tasks UI and clare_mutate trash_task write — or a
 * legacy bucket 'trash' / 'trashed'). Closed tasks never appear on the Tasks board, so an
 * agent must never treat them as open work. Do not re-implement this check inline; import it.
 */

const CLOSED_STATUSES = new Set(['done', 'dead']);
const CLOSED_BUCKETS = new Set(['done', 'trash', 'trashed']);

export function isClosedTask(task) {
  if (!task || typeof task !== 'object') return true;
  if (CLOSED_STATUSES.has(String(task.status))) return true;
  if (CLOSED_BUCKETS.has(String(task.bucket))) return true;
  return Boolean(task.completed_at);
}

/** Open = not closed and has a usable title. */
export function isOpenTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return false;
  if (isClosedTask(task)) return false;
  return typeof task.title === 'string' && task.title.trim().length > 0;
}

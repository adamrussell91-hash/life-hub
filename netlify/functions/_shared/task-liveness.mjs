/**
 * One definition of "is this task still live?" for every server-side agent and tool.
 *
 * A task is closed when it is done (status 'done', bucket 'done', or completed_at) or
 * deleted by the shared record rule (record-liveness.mjs — status 'dead', bucket 'trash',
 * and every other hub's deleted vocabulary). Closed tasks never appear on the Tasks board,
 * so an agent must never treat them as open work. Do not re-implement this check inline.
 */
import { isDeletedRecord } from './record-liveness.mjs';

export function isClosedTask(task) {
  if (!task || typeof task !== 'object') return true;
  if (isDeletedRecord(task)) return true;
  if (task.status === 'done' || task.bucket === 'done') return true;
  return Boolean(task.completed_at);
}

/** Open = not closed and has a usable title. */
export function isOpenTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return false;
  if (isClosedTask(task)) return false;
  return typeof task.title === 'string' && task.title.trim().length > 0;
}

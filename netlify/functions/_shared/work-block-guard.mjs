/**
 * One block per task per day. A task holds at most one active work block on a date
 * unless the blocks are deliberate parts of one split (same split_group), the way one
 * Teaching lesson can be taught over several slots. Every work_blocks/<id> writer calls
 * this after it stores an active block, so a second block replaces the first instead of
 * stacking, whichever path wrote it.
 */
import { getJSON as getTasksJSON, listJSON as listTasksJSON, readIndex, setJSON as setTasksJSON } from './tasks-blobs.mjs';
import { withoutDeleted } from './record-liveness.mjs';

const WORK_BLOCK_PREFIX = 'work_blocks/';

/** Every stored block; stores without list() (tests, narrow doubles) fall back to the index. */
async function storedBlocks(store) {
  if (typeof store.list === 'function') return listTasksJSON(store, WORK_BLOCK_PREFIX);
  const ids = await readIndex(store, `${WORK_BLOCK_PREFIX}_index`).catch(() => []);
  const rows = await Promise.all(ids.map(id => getTasksJSON(store, `${WORK_BLOCK_PREFIX}${id}`).catch(() => null)));
  return rows.filter(Boolean);
}

/** Statuses that put a task on the day. done / cancelled blocks never clash. */
export const ONE_BLOCK_STATUSES = Object.freeze(['proposed', 'confirmed', 'in_progress']);

function isOccupying(block) {
  return Boolean(block && typeof block === 'object' && ONE_BLOCK_STATUSES.includes(block.status));
}

function splitGroupOf(block) {
  return typeof block?.split_group === 'string' && block.split_group.trim() ? block.split_group.trim() : '';
}

/**
 * Both blocks are parts of the same split. A part may name an unmarked first block
 * as its group (split_<that block's id>), so adding part 2 never has to rewrite part 1.
 */
export function sameSplit(a, b) {
  const groupA = splitGroupOf(a);
  const groupB = splitGroupOf(b);
  if (groupA && groupA === groupB) return true;
  return (Boolean(groupA) && groupA === `split_${b?.id}`) || (Boolean(groupB) && groupB === `split_${a?.id}`);
}

/**
 * Blocks the incoming record replaces: same task, same date, still occupying the day,
 * not the record itself, and not a part of the same split.
 * @param {object} record the block being written
 * @param {object[]} existing every stored block
 */
export function blocksToSupersede(record, existing) {
  if (!isOccupying(record) || typeof record.task_id !== 'string' || !record.task_id || !record.date) return [];
  return withoutDeleted(Array.isArray(existing) ? existing : []).filter(block =>
    block
    && block.id !== record.id
    && block.task_id === record.task_id
    && block.date === record.date
    && isOccupying(block)
    && !sameSplit(block, record)
  );
}

/**
 * Cancel the blocks a just-written record replaces. Kept as history (status cancelled,
 * superseded_by), so nothing is deleted.
 * @returns {Promise<string[]>} ids cancelled
 */
export async function supersedeDuplicateBlocks(store, record, {
  listBlocks = storedBlocks,
  setJSON = setTasksJSON,
  nowIso = () => new Date().toISOString()
} = {}) {
  if (!store || !isOccupying(record) || !record?.task_id) return [];
  const existing = await listBlocks(store);
  const stale = blocksToSupersede(record, existing);
  const stamp = nowIso();
  for (const block of stale) {
    await setJSON(store, `${WORK_BLOCK_PREFIX}${block.id}`, {
      ...block,
      status: 'cancelled',
      superseded_by: record.id ?? null,
      updated_at: stamp
    });
  }
  return stale.map(block => block.id);
}

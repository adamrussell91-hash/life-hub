/**
 * Planned time for a task. A task's due_date / due_time is its deadline; when Adam
 * time-blocks it ("do it 3–4pm"), the plan is a work block linked to the task.
 * Clare's two task tool sets (clare_mutate, create_task / update_task) both write
 * blocks through this, on the same Confirm as the task.
 */
const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function newBlockId() {
  return `wblock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Minutes from start_time to end_time, or 0 when either is invalid or end is not later. */
export function spanMinutes(start, end) {
  if (!HHMM.test(String(start ?? '')) || !HHMM.test(String(end ?? ''))) return 0;
  const mins = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return Math.max(0, mins(end) - mins(start));
}

/** A block in one of these states is the task's planned time; cancelled / done / proposed are not. */
export const ACTIVE_BLOCK_STATUSES = Object.freeze(['confirmed', 'in_progress']);

function isActiveBlock(block) {
  return Boolean(block && typeof block === 'object' && ACTIVE_BLOCK_STATUSES.includes(block.status));
}

function addMinutes(hhmm, minutes) {
  const total = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + minutes;
  const clamped = Math.max(0, Math.min(total, 24 * 60 - 1));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** Active (confirmed / in-progress) blocks for one task, earliest first. */
export function activeTaskBlocks(blocks, taskId) {
  const id = String(taskId ?? '').trim();
  if (!id) return [];
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => isActiveBlock(block) && block.task_id === id)
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
}

/**
 * The existing block a time change should move. Same day first; with no explicit block_date,
 * a task's single upcoming block counts (so "move it to 5pm" moves today's block, not a new one).
 */
export function findTaskBlockToMove(blocks, taskId, { date = null, explicitDate = false, today = null } = {}) {
  const active = activeTaskBlocks(blocks, taskId);
  if (!active.length) return null;
  const sameDay = date ? active.find((block) => block.date === date) : null;
  if (sameDay || explicitDate) return sameDay ?? null;
  const upcoming = YMD.test(today ?? '') ? active.filter((block) => String(block.date) >= today) : active;
  return upcoming.length === 1 ? upcoming[0] : null;
}

/** Spoken time for a block: "16:30–17:00". */
export function blockTimeLabel(block) {
  const start = String(block?.start_time ?? '');
  if (!HHMM.test(start)) return '';
  const minutes = Number(block.duration_minutes) || 0;
  return minutes > 0 ? `${start}–${addMinutes(start, minutes)}` : start;
}

/** Compact view of a task's planned blocks for agent reads. */
export function scheduledBlocksForTask(blocks, taskId) {
  return activeTaskBlocks(blocks, taskId).map((block) => ({
    work_block_id: block.id ?? null,
    date: block.date ?? null,
    start_time: block.start_time ?? null,
    end_time: HHMM.test(String(block.start_time ?? '')) && Number(block.duration_minutes) > 0
      ? addMinutes(block.start_time, Number(block.duration_minutes))
      : null,
    duration_minutes: Number(block.duration_minutes) || null,
    status: block.status
  }));
}

/**
 * Overwrite an existing block at a new date / time. Keeps its id, so the task keeps one block.
 * @param {object} block existing work block record
 * @param {{ start_time?: string, end_time?: string, duration_minutes?: number, date?: string }} spec
 * @returns {null | { path: string, mode: 'overwrite', content: string, diff: string, record: object }}
 */
export function workBlockMoveWrite(block, spec, stamp) {
  if (!block?.id) return null;
  const start = String(spec?.start_time ?? '').trim() || String(block.start_time ?? '');
  if (!HHMM.test(start)) return null;
  const end = String(spec?.end_time ?? '').trim();
  const explicitMinutes = Number(spec?.duration_minutes);
  const minutes = end
    ? spanMinutes(start, end)
    : Number.isFinite(explicitMinutes) && explicitMinutes > 0
      ? Math.round(explicitMinutes)
      : Number(block.duration_minutes) || 30;
  if (!minutes) return null;
  const nextDate = String(spec?.date ?? '').trim();
  const date = YMD.test(nextDate) ? nextDate : block.date;
  const record = {
    ...block,
    date,
    start_time: start,
    duration_minutes: minutes,
    updated_at: stamp
  };
  const from = `${block.date} ${blockTimeLabel(block)}`.trim();
  const to = `${date} ${blockTimeLabel(record)}`.trim();
  return {
    path: `tasks:work_block:${block.id}`,
    mode: 'overwrite',
    content: JSON.stringify(record, null, 2),
    diff: `move block ${from} → ${to} · ${block.title || 'Planned work'}`,
    record
  };
}

/** Cancel an existing block (kept as history, gone from the day). */
export function workBlockCancelWrite(block, stamp) {
  if (!block?.id) return null;
  const record = { ...block, status: 'cancelled', updated_at: stamp };
  return {
    path: `tasks:work_block:${block.id}`,
    mode: 'overwrite',
    content: JSON.stringify(record, null, 2),
    diff: `cancel block ${block.date} ${blockTimeLabel(block)} · ${block.title || 'Planned work'}`.replace(/\s+/g, ' '),
    record
  };
}

/**
 * Planned-time write for a task. When the task already holds a confirmed / in-progress block
 * for that day (see findTaskBlockToMove), the block is moved in place; otherwise a new one is created.
 * @param {{ id: string, title?: string, due_date?: string|null, parent_project_id?: string|null, depth?: string|null }} task
 * @param {{ start_time?: string, end_time?: string, block_date?: string }} spec
 * @param {string} stamp ISO time
 * @param {{ today?: string|null, existingBlocks?: object[]|null }} [opts]
 * @returns {null | { path: string, mode: 'create'|'overwrite', content: string, diff: string }}
 */
export function taskBlockWrite(task, spec, stamp, { today = null, existingBlocks = null } = {}) {
  const start = String(spec?.start_time ?? '').trim();
  const end = String(spec?.end_time ?? '').trim();
  const blockDate = String(spec?.block_date ?? '').trim();
  const explicitDate = YMD.test(blockDate);
  const date = explicitDate
    ? blockDate
    : YMD.test(task?.due_date ?? '')
      ? task.due_date
      : YMD.test(today ?? '') ? today : stamp.slice(0, 10);
  if (task?.id && HHMM.test(start) && Array.isArray(existingBlocks)) {
    const existing = findTaskBlockToMove(existingBlocks, task.id, {
      date,
      explicitDate,
      today: YMD.test(today ?? '') ? today : stamp.slice(0, 10)
    });
    if (existing) {
      // An end time must still be after the start; a bare start keeps the block's length.
      if (end && !spanMinutes(start, end)) return null;
      const moved = workBlockMoveWrite(existing, {
        start_time: start,
        end_time: end || undefined,
        date: explicitDate ? blockDate : existing.date
      }, stamp);
      if (!moved) return null;
      const { record: _record, ...write } = moved;
      return write;
    }
  }
  const minutes = spanMinutes(start, end);
  if (!task?.id || !minutes) return null;
  const id = newBlockId();
  const title = String(task.title || 'Planned work');
  const record = {
    schema_version: 1,
    id,
    task_id: task.id,
    project_id: task.parent_project_id ?? null,
    title,
    date,
    start_time: start,
    duration_minutes: minutes,
    depth: task.depth === 'deep' ? 'deep' : task.depth === 'admin' ? 'admin' : 'shallow',
    status: 'confirmed',
    source: 'clare',
    locked: false,
    created_at: stamp,
    updated_at: stamp
  };
  return {
    path: `tasks:work_block:${id}`,
    mode: 'create',
    content: JSON.stringify(record, null, 2),
    diff: `block ${date} ${start}–${end} · ${title}`
  };
}

export const TIME_BLOCK_FIELDS = Object.freeze({
  start_time: { type: 'string', description: 'HH:MM planned start (time-block). With end_time, the same Confirm adds a work block linked to the task. If the task already has a confirmed block that day, the same Confirm moves that block instead (start_time alone keeps its length) — never a second block.' },
  end_time: { type: 'string', description: 'HH:MM planned end. Must be after start_time. Optional when moving an existing block.' },
  block_date: { type: 'string', description: 'YYYY-MM-DD for the block, when it differs from due_date. Defaults to due_date, else today.' }
});

export const DUE_TIME_FIELD = Object.freeze({
  type: 'string',
  description: 'HH:MM hard deadline ("due by 5pm"). Never a start time: use start_time + end_time to time-block.'
});

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

/**
 * @param {{ id: string, title?: string, due_date?: string|null, parent_project_id?: string|null, depth?: string|null }} task
 * @param {{ start_time?: string, end_time?: string, block_date?: string }} spec
 * @param {string} stamp ISO time
 * @param {{ today?: string|null }} [opts]
 * @returns {null | { path: string, mode: 'create', content: string, diff: string }}
 */
export function taskBlockWrite(task, spec, stamp, { today = null } = {}) {
  const start = String(spec?.start_time ?? '').trim();
  const end = String(spec?.end_time ?? '').trim();
  const minutes = spanMinutes(start, end);
  if (!task?.id || !minutes) return null;
  const blockDate = String(spec?.block_date ?? '').trim();
  const date = YMD.test(blockDate)
    ? blockDate
    : YMD.test(task.due_date ?? '')
      ? task.due_date
      : YMD.test(today ?? '') ? today : stamp.slice(0, 10);
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
  start_time: { type: 'string', description: 'HH:MM planned start (time-block). With end_time, the same Confirm adds a work block linked to the task.' },
  end_time: { type: 'string', description: 'HH:MM planned end. Must be after start_time.' },
  block_date: { type: 'string', description: 'YYYY-MM-DD for the block, when it differs from due_date. Defaults to due_date, else today.' }
});

export const DUE_TIME_FIELD = Object.freeze({
  type: 'string',
  description: 'HH:MM hard deadline ("due by 5pm"). Never a start time: use start_time + end_time to time-block.'
});

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function tasksEventsFromTasks(tasks) {
  return (tasks ?? [])
    .filter(task =>
      task &&
      typeof task.id === 'string' &&
      DATE_KEY.test(task.due_date) &&
      task.status !== 'done' &&
      task.status !== 'dead'
    )
    .map(task => ({
      path: `tasks:${task.id}`,
      record: {
        type: 'task',
        id: task.id,
        date: task.due_date,
        time: typeof task.due_time === 'string' && TIME_KEY.test(task.due_time) ? task.due_time : undefined,
        title: typeof task.title === 'string' && task.title ? task.title : task.id,
        status: typeof task.status === 'string' ? task.status : undefined
      },
      body: ''
    }));
}

/** Emit planned work blocks with time — distinct from hard deadlines. */
export function tasksEventsFromWorkBlocks(blocks) {
  return (blocks ?? [])
    .filter(
      (block) =>
        block &&
        typeof block.id === 'string' &&
        DATE_KEY.test(block.date) &&
        TIME_KEY.test(block.start_time) &&
        block.status !== 'cancelled'
    )
    .map((block) => ({
      path: `work_block:${block.id}`,
      record: {
        type: 'work_block',
        id: block.id,
        date: block.date,
        time: block.start_time,
        duration_min: Number(block.duration_minutes) || 60,
        title: typeof block.title === 'string' && block.title ? block.title : block.id,
        status: typeof block.status === 'string' ? block.status : undefined,
        depth: block.depth,
        ghost: block.status === 'proposed' || Boolean(block.ghost)
      },
      body: ''
    }));
}

/** Protected windows as background spans (not event chips). */
export function protectedBackgroundFromWindows(date, windows = []) {
  return (windows ?? [])
    .filter((w) => w && TIME_KEY.test(w.start) && TIME_KEY.test(w.end))
    .map((w, i) => ({
      id: `protected:${date}:${i}`,
      date,
      start: w.start,
      end: w.end,
      label: w.label || 'Protected',
      kind: 'protected'
    }));
}

/**
 * Active Schedule Diff ghosts only when awaiting_confirm has a durable pending id.
 * preparing / terminal / missing id must not resurrect proposed overlays on reload.
 */
export function scheduleDiffActiveProposed(state) {
  if (!state || typeof state !== 'object') return [];
  if (state.status !== 'awaiting_confirm') return [];
  const id = typeof state.pending_action_id === 'string' ? state.pending_action_id.trim() : '';
  if (!id) return [];
  return Array.isArray(state.proposed) && state.proposed.length ? state.proposed : [];
}

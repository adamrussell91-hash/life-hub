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
        status: typeof task.status === 'string' ? task.status : undefined,
        // Context for the calendar item card (click a Due row or chip).
        priority: typeof task.priority === 'string' ? task.priority : undefined,
        description: typeof task.description === 'string' ? task.description : '',
        waiting_on: typeof task.waiting_on === 'string' && task.waiting_on ? task.waiting_on : undefined,
        estimated_duration: Number.isFinite(task.estimated_duration) ? task.estimated_duration : undefined
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
        task_id: typeof block.task_id === 'string' && block.task_id ? block.task_id : undefined,
        ghost: block.status === 'proposed' || Boolean(block.ghost)
      },
      body: ''
    }));
}

const SYDNEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Sydney', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
});
function sydneyParts(ms) {
  const out = {};
  for (const part of SYDNEY.formatToParts(new Date(ms))) out[part.type] = part.value;
  return { date: `${out.year}-${out.month}-${out.day}`, time: `${out.hour === '24' ? '00' : out.hour}:${out.minute}` };
}

/**
 * Tracked work sessions → "what actually happened" spans (never calendar chips).
 * An open session runs to `now`; sessions over 12 h are ignored as stale timers.
 * @param {Array<Record<string, unknown>>} sessions
 * @param {Map<string, string>} [titles] task id → title
 */
export function tasksEventsFromWorkSessions(sessions, titles = new Map(), { now = Date.now(), sinceDays = 14 } = {}) {
  const since = now - sinceDays * 86_400_000;
  const out = [];
  for (const session of sessions ?? []) {
    if (!session || typeof session.id !== 'string') continue;
    const start = Date.parse(String(session.started_at ?? ''));
    if (!Number.isFinite(start) || start < since || start > now) continue;
    const finished = Date.parse(String(session.finished_at ?? ''));
    const end = Number.isFinite(finished) ? finished : now;
    if (end <= start || end - start > 12 * 3_600_000) continue;
    const a = sydneyParts(start);
    const b = sydneyParts(end);
    const taskId = typeof session.task_id === 'string' ? session.task_id : null;
    out.push({
      path: `work_session:${session.id}`,
      record: {
        type: 'work_session',
        id: session.id,
        date: a.date,
        time: a.time,
        end_time: b.date === a.date ? b.time : '23:59',
        task_id: taskId,
        title: (taskId && titles.get(taskId)) || (typeof session.notes === 'string' && session.notes.trim().slice(0, 60)) || 'Tracked work',
        result: typeof session.result === 'string' ? session.result : 'open',
        open: !Number.isFinite(finished),
        ...(Number.isInteger(session.scripts_marked) ? { scripts_marked: session.scripts_marked } : {})
      },
      body: ''
    });
  }
  return out;
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

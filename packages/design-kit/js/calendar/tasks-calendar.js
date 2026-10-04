import { dependencyIndex } from './duration-model.js';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Count progress the task already keeps: marking scripts, else finished steps.
 * Never asks Adam for a percentage.
 */
export function taskProgress(task, steps = []) {
  const marking = task?.marking;
  if (marking && Number.isInteger(marking.scripts) && marking.scripts > 0) {
    return { done: Math.min(marking.scripts, Number(marking.scripts_marked) || 0), total: marking.scripts, unit: 'scripts' };
  }
  if (steps.length) {
    return { done: steps.filter(step => step.status === 'done').length, total: steps.length, unit: 'steps' };
  }
  return null;
}

const RESUMABILITY = new Set(['quick', 'runup']);

/** Planning context the calendar needs on every task record (Day Sense steps 8 and 10). */
function planningOf(task, deps) {
  const row = deps.get(task.id);
  return {
    ...(RESUMABILITY.has(task.resumability) ? { resumability: task.resumability } : {}),
    ...(Number.isFinite(task.max_block_minutes) && task.max_block_minutes > 0 ? { max_block_minutes: task.max_block_minutes } : {}),
    ...(Number.isFinite(task.estimated_duration) ? { estimated_duration: task.estimated_duration } : {}),
    ...(Array.isArray(task.depends_on) && task.depends_on.length ? { depends_on: task.depends_on.filter(id => typeof id === 'string') } : {}),
    ...(Array.isArray(task.dismissed_inferred) && task.dismissed_inferred.length ? { dismissed_inferred: task.dismissed_inferred } : {}),
    ...(row?.blockedBy.length ? { blocked_by: row.blockedBy } : {}),
    ...(row?.unlocks ? { unlocks: row.unlocks } : {}),
    ...(row?.inferredAfter ? { inferred_after: row.inferredAfter } : {})
  };
}

function bookmarkOf(task) {
  return task?.bookmark && typeof task.bookmark.note === 'string' && task.bookmark.note.trim()
    ? { note: task.bookmark.note.trim(), at: task.bookmark.at ?? null }
    : null;
}

/** Closed the same way task-liveness reads it: status, the Done bucket, or a completion stamp. */
function isDoneTask(task) {
  return task?.status === 'done' || task?.bucket === 'done' || Boolean(task?.completed_at);
}

export function tasksEventsFromTasks(tasks) {
  const deps = dependencyIndex(tasks);
  const stepsOf = new Map();
  for (const task of tasks ?? []) {
    if (typeof task?.parent_task_id === 'string' && task.parent_task_id) {
      stepsOf.set(task.parent_task_id, [...(stepsOf.get(task.parent_task_id) ?? []), task]);
    }
  }
  // Undated open tasks with a bookmark or progress: context only (never drawn), so a
  // work block linked to them can show "where you left it".
  const context = (tasks ?? [])
    .filter(task => task && typeof task.id === 'string' && !DATE_KEY.test(task.due_date) && task.status !== 'done' && task.status !== 'dead')
    .map(task => ({ task, bookmark: bookmarkOf(task), progress: taskProgress(task, stepsOf.get(task.id)) }))
    .map(row => ({ ...row, planning: planningOf(row.task, deps) }))
    .filter(row => row.bookmark || row.progress || Object.keys(row.planning).length)
    .map(({ task, bookmark, progress, planning }) => ({
      path: `task_context:${task.id}`,
      record: {
        type: 'task_context',
        id: task.id,
        title: typeof task.title === 'string' && task.title ? task.title : task.id,
        ...(bookmark ? { bookmark } : {}),
        ...(progress ? { progress } : {}),
        ...planning
      },
      body: ''
    }));
  return [...(tasks ?? [])
    .filter(task =>
      task &&
      typeof task.id === 'string' &&
      DATE_KEY.test(task.due_date) &&
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
        // Ticked-off tasks stay on their day (struck through), so status is normalised.
        status: isDoneTask(task) ? 'done' : typeof task.status === 'string' ? task.status : undefined,
        // Context for the calendar item card (click a Due row or chip).
        priority: typeof task.priority === 'string' ? task.priority : undefined,
        description: typeof task.description === 'string' ? task.description : '',
        waiting_on: typeof task.waiting_on === 'string' && task.waiting_on ? task.waiting_on : undefined,
        estimated_duration: Number.isFinite(task.estimated_duration) ? task.estimated_duration : undefined,
        ...planningOf(task, deps),
        ...(bookmarkOf(task) ? { bookmark: bookmarkOf(task) } : {}),
        ...(taskProgress(task, stepsOf.get(task.id)) ? { progress: taskProgress(task, stepsOf.get(task.id)) } : {})
      },
      body: ''
    })), ...context];
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
        ...(typeof block.outcome === 'string' ? { outcome: block.outcome } : {}),
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

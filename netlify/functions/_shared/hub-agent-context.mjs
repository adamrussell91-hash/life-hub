import {
  CLASS_PREFIX,
  SCHEDULED_LESSON_PREFIX,
  defaultGetContentStore,
  listJSON as listTeachingJSON
} from './teaching-blobs.mjs';
import {
  TASK_PREFIX,
  defaultGetTasksStore,
  listJSON as listTasksJSON
} from './tasks-blobs.mjs';
import {
  HUB_TASKS_UNAVAILABLE_MARKER,
  HUB_TEACHING_CLASSES_UNAVAILABLE_MARKER,
  HUB_TEACHING_LESSONS_UNAVAILABLE_MARKER,
  hubContextTruncationLine,
  hubLessonsWindowLine
} from '../../../apps/life/js/core/context-integrity.js';

const HUB_TZ = 'Australia/Sydney';
const TASK_CAP = 12;
const CLASS_CAP = 12;
const LESSON_CAP = 10;
const WINDOW_DAYS = 14;

function ymdInSydney(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HUB_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function addDays(ymd, days) {
  const [year, month, day] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function isOpenTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return false;
  if (task.status === 'done' || task.bucket === 'done' || task.completed_at) return false;
  return typeof task.title === 'string' && task.title.trim().length > 0;
}

function isActiveClass(cls) {
  if (!cls || typeof cls !== 'object' || Array.isArray(cls)) return false;
  if (cls.status === 'trashed' || cls.status === 'archived' || cls.trashed_at) return false;
  return typeof cls.code === 'string' && cls.code.trim().length > 0;
}

function isUpcomingLesson(item, today, until) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (item.delivery_status === 'cancelled') return false;
  const date = typeof item.date === 'string' ? item.date : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && date <= until;
}

function isLaterLesson(item, until) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (item.delivery_status === 'cancelled') return false;
  const date = typeof item.date === 'string' ? item.date : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date > until;
}

export function formatHubAgentContext({
  tasks = [],
  classes = [],
  scheduledLessons = [],
  now = new Date(),
  loadErrors = {}
} = {}) {
  const today = ymdInSydney(now);
  const until = addDays(today, WINDOW_DAYS);
  const notes = [];

  if (loadErrors.tasks) notes.push(HUB_TASKS_UNAVAILABLE_MARKER);
  if (loadErrors.classes) notes.push(HUB_TEACHING_CLASSES_UNAVAILABLE_MARKER);
  if (loadErrors.scheduledLessons) notes.push(HUB_TEACHING_LESSONS_UNAVAILABLE_MARKER);

  const allOpenTasks = loadErrors.tasks
    ? []
    : tasks
      .filter(isOpenTask)
      .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  const openTasks = allOpenTasks.slice(0, TASK_CAP);
  if (!loadErrors.tasks && allOpenTasks.length > TASK_CAP) {
    notes.push(hubContextTruncationLine({
      label: 'Tasks',
      kept: TASK_CAP,
      omitted: allOpenTasks.length - TASK_CAP
    }));
  }

  const allActiveClasses = loadErrors.classes ? [] : classes.filter(isActiveClass);
  const activeClasses = allActiveClasses.slice(0, CLASS_CAP);
  if (!loadErrors.classes && allActiveClasses.length > CLASS_CAP) {
    notes.push(hubContextTruncationLine({
      label: 'Teaching classes',
      kept: CLASS_CAP,
      omitted: allActiveClasses.length - CLASS_CAP
    }));
  }

  const inWindow = loadErrors.scheduledLessons
    ? []
    : scheduledLessons
      .filter(item => isUpcomingLesson(item, today, until))
      .sort((a, b) => a.date.localeCompare(b.date));
  const later = loadErrors.scheduledLessons
    ? []
    : scheduledLessons.filter(item => isLaterLesson(item, until));
  const upcoming = inWindow.slice(0, LESSON_CAP);
  if (!loadErrors.scheduledLessons && inWindow.length > LESSON_CAP) {
    notes.push(hubContextTruncationLine({
      label: 'Teaching lessons',
      kept: LESSON_CAP,
      omitted: inWindow.length - LESSON_CAP
    }));
  }
  if (!loadErrors.scheduledLessons && later.length) {
    notes.push(hubLessonsWindowLine({ until, omitted: later.length }));
  }

  const sections = [];

  if (openTasks.length) {
    const rows = openTasks.map(task => {
      const meta = [task.domain, task.status, task.priority].filter(Boolean);
      if (task.due_date) meta.push(`due ${task.due_date}`);
      return `- ${task.title.trim()}${meta.length ? ` (${meta.join(', ')})` : ''}`;
    });
    sections.push(`Tasks:\n${rows.join('\n')}`);
  }

  if (activeClasses.length || upcoming.length) {
    const classById = new Map(activeClasses.filter(cls => cls.id).map(cls => [cls.id, cls]));
    const classLine = activeClasses
      .map(cls => (cls.display_name ? `${cls.code} (${cls.display_name})` : cls.code))
      .join(', ');
    const parts = [];
    if (classLine) parts.push(`classes: ${classLine}`);
    if (upcoming.length) {
      const rows = upcoming.map(item => {
        const code = classById.get(item.class_id)?.code;
        return `- ${item.date}${code ? ` ${code}` : ''}`;
      });
      parts.push(`upcoming lessons:\n${rows.join('\n')}`);
    }
    sections.push(`Teaching:\n${parts.join('\n')}`);
  }

  if (!sections.length && !notes.length) return '';
  return `Other hubs (live umbrella stores — use for triage, do not invent extra rows):\n${[...notes, ...sections].join('\n\n')}`;
}

async function safeList(listFn, env) {
  if (typeof listFn !== 'function') return { ok: false, error: 'missing_lister', rows: [] };
  try {
    const rows = await listFn(env);
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    return { ok: false, error: error?.code || 'load_failed', rows: [] };
  }
}

export async function defaultListTasks(env = process.env) {
  const store = await defaultGetTasksStore(env);
  return listTasksJSON(store, TASK_PREFIX);
}

export async function defaultListClasses(env = process.env) {
  const store = await defaultGetContentStore(env);
  return listTeachingJSON(store, CLASS_PREFIX);
}

export async function defaultListScheduledLessons(env = process.env) {
  const store = await defaultGetContentStore(env);
  return listTeachingJSON(store, SCHEDULED_LESSON_PREFIX);
}

export async function loadHubAgentContext({
  env = process.env,
  now = new Date(),
  listTasks = defaultListTasks,
  listClasses = defaultListClasses,
  listScheduledLessons = defaultListScheduledLessons
} = {}) {
  const [tasks, classes, scheduledLessons] = await Promise.all([
    safeList(listTasks, env),
    safeList(listClasses, env),
    safeList(listScheduledLessons, env)
  ]);
  return formatHubAgentContext({
    tasks: tasks.rows,
    classes: classes.rows,
    scheduledLessons: scheduledLessons.rows,
    now,
    loadErrors: {
      ...(tasks.ok ? {} : { tasks: tasks.error }),
      ...(classes.ok ? {} : { classes: classes.error }),
      ...(scheduledLessons.ok ? {} : { scheduledLessons: scheduledLessons.error })
    }
  });
}

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

export function formatHubAgentContext({
  tasks = [],
  classes = [],
  scheduledLessons = [],
  now = new Date()
} = {}) {
  const today = ymdInSydney(now);
  const until = addDays(today, WINDOW_DAYS);

  const openTasks = tasks
    .filter(isOpenTask)
    .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
    .slice(0, TASK_CAP);

  const activeClasses = classes.filter(isActiveClass).slice(0, CLASS_CAP);

  const upcoming = scheduledLessons
    .filter(item => isUpcomingLesson(item, today, until))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, LESSON_CAP);

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

  if (!sections.length) return '';
  return `Other hubs (live umbrella stores — use for triage, do not invent extra rows):\n${sections.join('\n\n')}`;
}

async function safeList(listFn, env) {
  if (typeof listFn !== 'function') return [];
  try {
    const rows = await listFn(env);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
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
  return formatHubAgentContext({ tasks, classes, scheduledLessons, now });
}

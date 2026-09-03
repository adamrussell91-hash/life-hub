export const HUB_TZ = 'Australia/Sydney';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toHubDateKey(date = new Date(), timeZone = HUB_TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseDue(due) {
  if (!due) return null;
  const dateOnly = DATE_ONLY.exec(due);
  if (dateOnly) {
    const local = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const parsed = new Date(due);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function hubCalendarDate(date = new Date(), timeZone = HUB_TZ) {
  const local = parseDue(toHubDateKey(date, timeZone));
  return local ?? startOfDay(date);
}

function fromYmd(year, month, day) {
  return `${pad2(day)}/${pad2(month)}/${String(year).slice(-2)}`;
}

export function formatDisplayDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const [year, month, day] = toHubDateKey(value).split('-');
    return fromYmd(year, month, day);
  }
  const text = String(value).trim();
  const key = DATE_ONLY.exec(text);
  if (key) return fromYmd(key[1], key[2], key[3]);
  const ms = Date.parse(text);
  if (!Number.isNaN(ms)) return formatDisplayDate(new Date(ms));
  return text;
}

export function isBoardTask(task) {
  if (!task || typeof task !== 'object') return false;
  if (task.kind === 'step' || (task.parent_task_id && task.kind !== 'task')) return false;
  return task.bucket !== 'someday';
}

export function sortByPriorityThenDue(tasks) {
  return [...tasks].sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
    if (pr !== 0) return pr;
    const ad = parseDue(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = parseDue(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });
}

export function tasksForDay(tasks, day) {
  const key = toDateKey(day);
  return sortByPriorityThenDue(
    tasks.filter(task => {
      if (task.status === 'done' || task.status === 'dead') return false;
      const due = parseDue(task.due_date);
      return due ? toDateKey(due) === key : false;
    })
  );
}

export function overdueTasks(tasks, day = new Date()) {
  const start = startOfDay(day);
  return sortByPriorityThenDue(
    tasks.filter(task => {
      if (!isBoardTask(task) || task.status === 'done' || task.status === 'dead') return false;
      const due = parseDue(task.due_date);
      return due ? startOfDay(due).getTime() < start.getTime() : false;
    })
  );
}

export function weekDays(anchor = new Date()) {
  const start = startOfDay(anchor);
  const monday = addDays(start, -((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function detectPinchPoints(tasks, from = new Date(), options = {}) {
  const days = options.days ?? 7;
  const watchTaskCount = options.watchTaskCount ?? 3;
  const overloadTaskCount = options.overloadTaskCount ?? 5;
  const watchMinutes = options.watchMinutes ?? 240;
  const overloadMinutes = options.overloadMinutes ?? 360;
  const defaultMinutes = options.defaultMinutes ?? 45;
  const start = startOfDay(from);
  const pinches = [];

  for (let i = 0; i < days; i += 1) {
    const day = addDays(start, i);
    const dayTasks = tasksForDay(tasks, day);
    if (!dayTasks.length) continue;
    const estimated_minutes = dayTasks.reduce(
      (sum, task) => sum + (Number(task.estimated_duration) || defaultMinutes),
      0
    );
    const overloaded = dayTasks.length >= overloadTaskCount || estimated_minutes >= overloadMinutes;
    const watch = !overloaded && (dayTasks.length >= watchTaskCount || estimated_minutes >= watchMinutes);
    if (!overloaded && !watch) continue;
    const date_key = toDateKey(day);
    const when = date_key === toDateKey(start) ? 'Today' : formatDisplayDate(day);
    pinches.push({
      date_key,
      date: day,
      severity: overloaded ? 'overloaded' : 'watch',
      task_count: dayTasks.length,
      estimated_minutes,
      tasks: dayTasks,
      summary: overloaded
        ? `${when} looks overloaded — ${dayTasks.length} tasks (~${estimated_minutes}m).`
        : `${when} is packing up — ${dayTasks.length} tasks (~${estimated_minutes}m).`
    });
  }
  return pinches;
}

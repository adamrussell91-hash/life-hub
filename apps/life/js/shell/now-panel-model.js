import { chipFromEvent } from '../app/tideline-model.js';
import { formatHubLongDate } from '../core/time.js';
import { formatDueBadge } from './task-glance.js';

/**
 * One model for Home's Now panel: the day timeline, the task list, the
 * reading-now books and the hub jump lines all derive from these functions,
 * so the headline, the list and the counts can't disagree (failure register V4).
 */

const DAY_START = 7;
const DAY_END = 21;
const MIN_SPAN = 8;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' });

/** Task hubs the capture bar offers. Values are the Tasks API's own domains. */
export const NOW_TASK_DOMAINS = [
  { id: 'life', label: 'Life' },
  { id: 'teaching', label: 'School' },
  { id: 'health', label: 'Health' }
];

const DOMAIN_LABEL = { life: 'Life', teaching: 'School', health: 'Health', wedding: 'Wedding', other: 'Other' };

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const capitalise = text => (text ? text[0].toUpperCase() + text.slice(1) : text);
const dayNumber = key => Date.parse(`${key}T00:00:00Z`) / DAY_MS;

export function addDays(key, count) {
  return new Date(Date.parse(`${key}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
}

/** 15.5 → "3:30 pm". */
export function formatClock(hours) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function blockTone(chip) {
  if (chip.isClass) return 'lesson';
  if (chip.kind === 'teaching') return 'school';
  if (chip.kind === 'task' || chip.kind === 'study') return 'work';
  return 'calendar';
}

/** Open board work only — not done/dead, Someday, or Goals (/api/goals shape). */
export function isOpenTask(task) {
  if (!task || typeof task.id !== 'string') return false;
  if (task.status === 'done' || task.status === 'dead') return false;
  if (task.bucket === 'someday') return false;
  // Goals are a separate collection (sphere/structure); never fill Home's daily glance.
  if (task.kind === 'goal' || task.sphere != null || task.structure != null) return false;
  return true;
}

/**
 * The day as timed blocks on one axis. Events are the merged Life calendar list
 * (the same one the Day dial reads); `chipFromEvent` decides what counts as a
 * timed block, so logs, walls and untimed items never reach the strip.
 */
export function buildDayTimeline({ events = [], tasks = [], date, nowMinutes = null, classCodes = null } = {}) {
  const nowHour = typeof nowMinutes === 'number' ? nowMinutes / 60 : null;
  const blocks = [];
  const seen = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.record?.date !== date) continue;
    let chip = null;
    try {
      chip = chipFromEvent(event);
    } catch {
      chip = null;
    }
    if (!chip || !(chip.end > chip.start)) continue;
    const id = String(chip.id);
    if (seen.has(id)) continue;
    seen.add(id);
    // A lesson block is narrow, so it leads with the class code (12ENGADV1) when known.
    const code = chip.isClass ? classCodes?.get?.(chip.class_id) : null;
    blocks.push({
      id,
      title: code || String(chip.title ?? ''),
      meta: code ? String(chip.title ?? '') : String(chip.meta ?? ''),
      start: chip.start,
      end: Math.min(chip.end, 24),
      tone: blockTone(chip),
      done: Boolean(chip.done),
      past: nowHour !== null && chip.end <= nowHour,
      lane: 0,
      next: false
    });
  }
  blocks.sort((a, b) => a.start - b.start || b.end - a.end);

  const laneEnds = [];
  for (const block of blocks) {
    let lane = laneEnds.findIndex(end => end <= block.start + 1e-6);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.end);
    } else {
      laneEnds[lane] = block.end;
    }
    block.lane = lane;
  }

  const nextLesson = blocks.find(block => block.tone === 'lesson' && (nowHour === null || block.start >= nowHour));
  if (nextLesson) nextLesson.next = true;

  const due = (Array.isArray(tasks) ? tasks : []).filter(task => isOpenTask(task) && task.due_date === date);
  const pins = due
    .filter(task => TIME_KEY.test(task.due_time ?? ''))
    .map(task => {
      const [h, m] = task.due_time.split(':').map(Number);
      return { id: task.id, title: String(task.title ?? ''), at: h + m / 60 };
    });

  // The strip fits the day's own content (plus now), at least MIN_SPAN hours wide,
  // so a full teaching day gets room to label its lessons. An empty day shows 7–9.
  const marks = [...blocks.flatMap(block => [block.start, block.end]), ...pins.map(pin => pin.at)];
  if (nowHour !== null && marks.length) marks.push(nowHour);
  let rangeStart = marks.length ? Math.max(0, Math.floor(Math.min(...marks))) : DAY_START;
  let rangeEnd = marks.length ? Math.min(24, Math.ceil(Math.max(...marks))) : DAY_END;
  if (rangeEnd - rangeStart < MIN_SPAN) {
    rangeEnd = Math.min(24, rangeStart + MIN_SPAN);
    rangeStart = Math.max(0, rangeEnd - MIN_SPAN);
  }

  const isToday = nowHour !== null;
  const live = blocks.filter(block => !block.past && !block.done);
  // "Left" means not started yet; a block under way still counts toward "free from".
  const ahead = isToday ? live.filter(block => block.start >= nowHour) : live;
  const lessons = ahead.filter(block => block.tone === 'lesson');
  let first;
  if (lessons.length) {
    first = isToday
      ? `${plural(lessons.length, 'lesson')} left`
      : `${plural(lessons.length, 'lesson')}, first at ${formatClock(lessons[0].start)}`;
  } else if (ahead.length) {
    first = isToday ? `${plural(ahead.length, 'more thing')} on` : `${plural(ahead.length, 'thing')} booked`;
  } else if (isToday) {
    first = nowHour >= 17 ? 'Free evening' : 'Nothing else booked';
  } else {
    first = 'Nothing booked';
  }
  const second = due.length
    ? `${plural(due.length, 'task')} due${isToday ? ' today' : ''}`
    : `nothing due${isToday ? ' today' : ''}`;
  const lastEnd = live.length ? Math.max(...live.map(block => block.end)) : null;
  const longDate = formatHubLongDate(date);

  return {
    date,
    isToday,
    nowHour,
    rangeStart,
    rangeEnd,
    lanes: Math.max(1, laneEnds.length),
    blocks,
    pins,
    headline: `${first}. ${capitalise(second)}.`,
    sub: lastEnd === null ? longDate : `${longDate} · free from ${formatClock(lastEnd)}`
  };
}

function lessonRows(data) {
  const classes = new Map();
  for (const cls of data?.classes ?? []) {
    if (typeof cls?.id === 'string' && cls.id) classes.set(cls.id, cls);
  }
  const titles = new Map();
  for (const lesson of data?.lessons ?? []) {
    if (typeof lesson?.id === 'string' && lesson.id) titles.set(lesson.id, typeof lesson.title === 'string' ? lesson.title : '');
  }
  return (data?.scheduled_lessons ?? [])
    .filter(row => row && typeof row.id === 'string' && DATE_KEY.test(row.date ?? ''))
    .filter(row => row.delivery_status !== 'cancelled' && row.delivery_status !== 'skipped')
    .map(row => {
      const cls = classes.get(row.class_id);
      const startTime = TIME_KEY.test(row.start_time ?? '') ? row.start_time : null;
      return {
        id: row.id,
        date: row.date,
        startTime,
        startMinutes: startTime ? Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) : null,
        order: Number.isFinite(row.schedule_order) ? row.schedule_order : 0,
        classTitle: cls?.code || cls?.title || 'Class',
        lessonTitle: titles.get(row.lesson_id) || ''
      };
    });
}

/** class id → short code, for labelling lesson blocks. */
export function classCodesFrom(data) {
  const codes = new Map();
  for (const cls of data?.classes ?? []) {
    if (typeof cls?.id === 'string' && typeof cls.code === 'string' && cls.code.trim()) codes.set(cls.id, cls.code.trim());
  }
  return codes;
}

/** The next lesson that hasn't started: later today, or the first one on a later day. */
export function upcomingLesson(data, { date, nowMinutes = 0 } = {}) {
  const rows = lessonRows(data)
    .filter(row => row.date > date || (row.date === date && row.startMinutes !== null && row.startMinutes >= nowMinutes))
    .sort((a, b) => a.date.localeCompare(b.date)
      || (a.startMinutes ?? 9999) - (b.startMinutes ?? 9999)
      || a.order - b.order);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, date: row.date, startTime: row.startTime, classTitle: row.classTitle, lessonTitle: row.lessonTitle };
}

/** Mon–Sun week containing `date`. */
export function lessonsThisWeek(data, date) {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const from = addDays(date, -weekday);
  const to = addDays(from, 6);
  return lessonRows(data).filter(row => row.date >= from && row.date <= to).length;
}

/** "Today 9:40 am", "Tomorrow 8:50 am", "Mon 12/10 8:50 am". */
export function formatLessonWhen(lesson, today) {
  if (!lesson) return '';
  const gap = dayNumber(lesson.date) - dayNumber(today);
  const [, month, day] = lesson.date.split('-');
  const dayLabel = gap === 0
    ? 'Today'
    : gap === 1
      ? 'Tomorrow'
      : `${WEEKDAY.format(new Date(`${lesson.date}T00:00:00Z`))} ${day}/${month}`;
  if (!lesson.startTime) return dayLabel;
  const [h, m] = lesson.startTime.split(':').map(Number);
  return `${dayLabel} ${formatClock(h + m / 60)}`;
}

export function dueTone(dueDate, today) {
  if (!DATE_KEY.test(dueDate ?? '')) return 'none';
  if (dueDate < today) return 'over';
  if (dueDate === today) return 'today';
  return 'later';
}

/** "3 days late", "Today", "Tomorrow", "Wed" (this week), "24/10". */
export function dueLabel(dueDate, today) {
  const tone = dueTone(dueDate, today);
  if (tone === 'none') return '';
  const gap = dayNumber(dueDate) - dayNumber(today);
  if (tone === 'over') return gap === -1 ? '1 day late' : `${-gap} days late`;
  if (gap >= 2 && gap <= 6) return WEEKDAY.format(new Date(`${dueDate}T00:00:00Z`));
  return formatDueBadge(dueDate, { today });
}

const TONE_RANK = { over: 0, today: 1, later: 2, none: 3 };

/** Overdue, then today, then by date, then undated (newest first so a fresh capture shows). */
export function nowTasks(tasks, { today, domain = 'all', limit = 5 } = {}) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter(isOpenTask)
    .filter(task => domain === 'all' || task.domain === domain)
    .sort((a, b) => {
      const toneA = dueTone(a.due_date, today);
      const toneB = dueTone(b.due_date, today);
      if (toneA !== toneB) return TONE_RANK[toneA] - TONE_RANK[toneB];
      if (toneA !== 'none' && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
      return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
    })
    .slice(0, limit)
    .map(task => ({
      id: task.id,
      title: String(task.title ?? ''),
      hub: DOMAIN_LABEL[task.domain] ?? 'Other',
      tone: dueTone(task.due_date, today),
      due: dueLabel(task.due_date, today)
    }));
}

export function taskSummary(tasks, today) {
  const open = (Array.isArray(tasks) ? tasks : []).filter(isOpenTask);
  return {
    open: open.length,
    overdue: open.filter(task => dueTone(task.due_date, today) === 'over').length,
    dueToday: open.filter(task => task.due_date === today).length
  };
}

export function formatTaskSummary({ open, overdue }) {
  return overdue ? `${open} open · ${overdue} overdue` : `${open} open`;
}

export function bookKey(label) {
  return String(label ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function bookHref(label) {
  return `/knowledge/#bookshelf/${encodeURIComponent(bookKey(label))}`;
}

/** Books marked as being read on the Bookshelf, most recently touched first. */
export function readingNow(shelf) {
  return (Array.isArray(shelf?.books) ? shelf.books : [])
    .filter(book => book && book.reading && typeof book.label === 'string' && book.label.trim())
    .map(book => ({
      label: book.label.trim(),
      page: Number.isInteger(book.reading.page) ? book.reading.page : null,
      pages: Number.isInteger(book.pages) && book.pages > 0 ? book.pages : null,
      updatedAt: String(book.reading.updated_at ?? book.updated_at ?? '')
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.label.localeCompare(b.label));
}

/** One honest line per hub link. `null` input means that hub hasn't loaded. */
export function hubJumpLines({ curriculum, tasks, books, meetingsThisWeek, today, nowMinutes = 0 } = {}) {
  let teaching = null;
  if (curriculum) {
    const next = upcomingLesson(curriculum, { date: today, nowMinutes });
    const week = lessonsThisWeek(curriculum, today);
    teaching = next
      ? `Next: ${formatLessonWhen(next, today)} · ${next.classTitle}`
      : week ? `${plural(week, 'lesson')} this week` : 'No lessons scheduled';
  }
  let knowledge = null;
  if (books) {
    const book = books[0];
    knowledge = book
      ? `Reading ${book.label}${book.page ? ` · p. ${book.page}` : ''}`
      : 'No book marked as reading';
  }
  const tasksLine = tasks ? formatTaskSummary(taskSummary(tasks, today)) : null;
  const professional = Number.isInteger(meetingsThisWeek)
    ? meetingsThisWeek ? `${plural(meetingsThisWeek, 'meeting')} this week` : 'No meetings this week'
    : null;
  const progress = books?.[0]?.page && books[0].pages ? Math.min(1, books[0].page / books[0].pages) : null;
  return { teaching, knowledge, tasks: tasksLine, professional, readingProgress: progress };
}

/** Professional meetings in the Mon–Sun week of `today`, from the merged calendar list. */
export function countMeetingsThisWeek(events, today) {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const from = addDays(today, -weekday);
  const to = addDays(from, 6);
  const ids = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    const record = event?.record;
    if (record?.type !== 'professional_meeting') continue;
    if (!DATE_KEY.test(record.date ?? '') || record.date < from || record.date > to) continue;
    if (record.status === 'cancelled') continue;
    ids.add(record.id ?? event.path);
  }
  return ids.size;
}

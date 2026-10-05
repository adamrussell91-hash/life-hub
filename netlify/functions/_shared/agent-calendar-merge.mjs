/**
 * Full multi-hub calendar merge for agent scheduling / conflict checks.
 * Same source set as Life Tideline after #624:
 * Life + Teaching + Knowledge + Tasks + Professional + iCal feeds.
 *
 * Unknown or failed source → do not pretend free (status: unavailable).
 */
import { professionalEventsFromProjections } from '../../../packages/design-kit/js/calendar/professional-calendar.js';
import { eventsFromCalendarFeeds } from '../../../packages/design-kit/js/calendar/ical-calendar.js';
import { teachingEventsFromCurriculum } from '../../../packages/design-kit/js/calendar/teaching-calendar.js';
import { knowledgeEventsFromPages } from '../../../packages/design-kit/js/calendar/knowledge-calendar.js';
import {
  tasksEventsFromTasks,
  tasksEventsFromWorkBlocks
} from '../../../packages/design-kit/js/calendar/tasks-calendar.js';
import { minutesOf } from './productivity-os.mjs';
import { projectMeetingSchedule, projectEventSchedule } from './schedule-projection.mjs';

export const AGENT_CALENDAR_SOURCES = Object.freeze([
  'life',
  'teaching',
  'knowledge',
  'tasks',
  'professional',
  'feeds'
]);

export const AGENT_CALENDAR_SOURCE_LABEL = Object.freeze({
  life: 'Life',
  teaching: 'Teaching',
  knowledge: 'Knowledge',
  tasks: 'Tasks',
  professional: 'Professional',
  feeds: 'iCloud calendars'
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_TZ = 'Australia/Sydney';

function emptySourceStatus() {
  return Object.fromEntries(
    AGENT_CALENDAR_SOURCES.map((id) => [id, { status: 'pending', count: 0, error: null }])
  );
}

function formatHm(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function sydneyParts(iso, timeZone = DEFAULT_TZ) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const get = (type) => dateParts.find((p) => p.type === type)?.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);
  const hour = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
  return { date, time: `${hour}:${minute}` };
}

/**
 * Normalize a Life-style calendar event row ({ path, record }) or raw record
 * into an occupied slot for conflict / day describe.
 */
export function slotFromCalendarEvent(event, source) {
  const record = event?.record && typeof event.record === 'object' ? event.record : event;
  if (!record || typeof record !== 'object') return null;
  if (record.type === 'freed_span' || record.type === 'task_context') return null;
  if (record.status === 'cancelled' || record.delivery_status === 'cancelled') return null;

  let date = typeof record.date === 'string' && DATE_RE.test(record.date) ? record.date : null;
  let start = TIME_RE.test(String(record.time ?? record.start_time ?? ''))
    ? String(record.time ?? record.start_time)
    : null;
  let end = TIME_RE.test(String(record.end_time ?? record.end ?? ''))
    ? String(record.end_time ?? record.end)
    : null;
  const allDay = record.all_day === true || (!start && Boolean(date));

  // Professional ISO fields when not already projected to Life rows.
  if (!date && (record.scheduled_start || record.start)) {
    const startIso = record.scheduled_start || record.start;
    const endIso = record.scheduled_end || record.end;
    const tz = record.time_zone || DEFAULT_TZ;
    const startParts = sydneyParts(startIso, tz);
    if (!startParts) return null;
    date = startParts.date;
    start = record.all_day ? null : startParts.time;
    if (endIso && !record.all_day) {
      const endParts = sydneyParts(endIso, tz);
      end = endParts?.time ?? null;
    }
  }

  if (!date || !DATE_RE.test(date)) return null;

  const startMin = start ? minutesOf(start) : null;
  let endMin = end ? minutesOf(end) : null;
  if (startMin != null && endMin == null) {
    const dur = Number(record.duration_min ?? record.duration_minutes ?? record.minutes);
    endMin = Number.isFinite(dur) && dur > 0 ? startMin + Math.round(dur) : startMin + 60;
    end = formatHm(endMin);
  }

  return {
    source,
    title: String(record.title || record.meal || record.type || 'Busy'),
    date,
    start: startMin != null ? formatHm(startMin) : null,
    end: endMin != null ? formatHm(endMin) : null,
    start_minutes: startMin,
    end_minutes: endMin,
    all_day: allDay || startMin == null,
    kind: record.type || source,
    id: record.id ?? null,
    path: typeof event?.path === 'string' ? event.path : null
  };
}

export function slotsFromEvents(events, source) {
  return (events ?? []).map((e) => slotFromCalendarEvent(e, source)).filter(Boolean);
}

/**
 * Merge already-normalized event arrays into one slot list + source status.
 * Failed sources must pass status 'unavailable' (or 'error') so callers
 * do not treat missing data as free.
 */
export function mergeAgentCalendarSlots({
  lifeEvents = [],
  teachingEvents = [],
  knowledgeEvents = [],
  tasksEvents = [],
  professionalEvents = [],
  feedEvents = [],
  sourceStatus = null
} = {}) {
  const status = { ...emptySourceStatus(), ...(sourceStatus || {}) };
  const bySource = {
    life: slotsFromEvents(lifeEvents, 'life'),
    teaching: slotsFromEvents(teachingEvents, 'teaching'),
    knowledge: slotsFromEvents(knowledgeEvents, 'knowledge'),
    tasks: slotsFromEvents(tasksEvents, 'tasks'),
    professional: slotsFromEvents(professionalEvents, 'professional'),
    feeds: slotsFromEvents(feedEvents, 'feeds')
  };
  for (const id of AGENT_CALENDAR_SOURCES) {
    const prior = status[id] || { status: 'live', count: 0, error: null };
    if (prior.status === 'unavailable' || prior.status === 'error') {
      status[id] = { ...prior, count: bySource[id].length };
      continue;
    }
    status[id] = {
      status: prior.status === 'pending' ? 'live' : prior.status,
      count: bySource[id].length,
      error: prior.error ?? null
    };
  }
  const slots = AGENT_CALENDAR_SOURCES.flatMap((id) => bySource[id])
    .sort((a, b) =>
      a.date.localeCompare(b.date)
      || String(a.start || '').localeCompare(String(b.start || ''))
      || a.title.localeCompare(b.title)
    );
  return { slots, sourceStatus: status, sources: AGENT_CALENDAR_SOURCES };
}

/** True when any required source failed — callers must not claim the day is free. */
export function mergeHasUnavailableSources(sourceStatus) {
  return AGENT_CALENDAR_SOURCES.some((id) => {
    const s = sourceStatus?.[id]?.status;
    return s === 'unavailable' || s === 'error';
  });
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Find occupied slots overlapping [start, end) on date.
 * All-day items on that date conflict with a timed proposal, except Tasks
 * due-date rows (a task due today is not busy time).
 * excludePaths: the block being rescheduled, so it never conflicts with itself.
 */
export function findSlotConflicts(slots, { date, start, end, excludePaths = [] } = {}) {
  if (!DATE_RE.test(date ?? '')) return [];
  const wantStart = minutesOf(start);
  const wantEnd = minutesOf(end);
  if (wantStart == null || wantEnd == null || !(wantEnd > wantStart)) return [];
  const excluded = new Set((excludePaths ?? []).filter((p) => typeof p === 'string' && p));

  return (slots ?? []).filter((slot) => {
    if (slot.date !== date) return false;
    if (slot.path && excluded.has(slot.path)) return false;
    if (slot.all_day || slot.start_minutes == null || slot.end_minutes == null) {
      return slot.source !== 'tasks';
    }
    return rangesOverlap(wantStart, wantEnd, slot.start_minutes, slot.end_minutes);
  });
}

export function formatConflictsForTool(conflicts) {
  return (conflicts ?? []).map((c) => ({
    title: c.title,
    date: c.date,
    start: c.start,
    end: c.end,
    source: c.source,
    source_label: AGENT_CALENDAR_SOURCE_LABEL[c.source] || c.source,
    kind: c.kind
  }));
}

export function conflictToolError(conflicts, { sourceStatus = null } = {}) {
  const formatted = formatConflictsForTool(conflicts);
  const lines = formatted.map((c) => {
    const when = c.start && c.end ? `${c.start}–${c.end}` : 'all day';
    return `${c.title} (${when}, ${c.source_label})`;
  });
  return {
    ok: false,
    error: 'calendar_conflict',
    message: lines.length
      ? `That slot overlaps existing events: ${lines.join('; ')}`
      : 'That slot overlaps existing events.',
    conflicts: formatted,
    ...(sourceStatus ? { sourceStatus } : {})
  };
}

export function unavailableCalendarToolError(sourceStatus) {
  const failed = AGENT_CALENDAR_SOURCES.filter((id) => {
    const s = sourceStatus?.[id]?.status;
    return s === 'unavailable' || s === 'error';
  }).map((id) => AGENT_CALENDAR_SOURCE_LABEL[id] || id);
  return {
    ok: false,
    error: 'calendar_sources_unavailable',
    message: `Calendar sources unavailable (${failed.join(', ') || 'unknown'}). Refusing to treat the slot as free.`,
    sourceStatus
  };
}

/**
 * Day window for check_calendars / agent day describe — full merge, not a 2-source subset.
 */
export function describeMergedCalendarWindow({
  slots = [],
  sourceStatus = null,
  from,
  days = 3,
  tasks = []
} = {}) {
  if (!DATE_RE.test(from ?? '')) {
    return { ok: false, error: 'invalid_from', detail: 'from must be YYYY-MM-DD' };
  }
  const n = Math.min(14, Math.max(1, Number(days) || 3));
  const window = [];
  for (let i = 0; i < n; i += 1) {
    const [y, m, d] = from.split('-').map(Number);
    const key = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    const daySlots = (slots ?? []).filter((s) => s.date === key);
    const dayTasks = (tasks ?? [])
      .filter((t) => t && t.due_date === key && t.status !== 'done' && t.status !== 'dead')
      .slice(0, 12)
      .map((t) => ({ id: t.id, title: t.title, due_date: t.due_date, domain: t.domain ?? null }));
    window.push({
      date: key,
      events: daySlots.map((s) => ({
        title: s.title,
        start: s.start,
        end: s.end,
        source: s.source,
        source_label: AGENT_CALENDAR_SOURCE_LABEL[s.source] || s.source,
        kind: s.kind,
        all_day: Boolean(s.all_day)
      })),
      tasks: dayTasks
    });
  }
  return {
    ok: true,
    from,
    days: n,
    sources: AGENT_CALENDAR_SOURCES,
    sourceStatus: sourceStatus || emptySourceStatus(),
    incomplete: mergeHasUnavailableSources(sourceStatus),
    window
  };
}

/** Hard-busy spans for compose_schedule from merged slots on one date. */
export function busySpansFromMergedSlots(slots, date) {
  return (slots ?? [])
    .filter((s) => s.date === date && s.start_minutes != null && s.end_minutes != null && !s.all_day)
    .map((s) => ({
      start: s.start_minutes,
      end: s.end_minutes,
      title: s.title,
      kind: s.source === 'teaching' ? 'lesson' : s.source === 'professional' ? 'professional' : s.kind || s.source
    }));
}

/**
 * Project Professional meetings/events into Life calendar event rows
 * (same shape as schedule-projections → professionalEventsFromProjections).
 */
export function professionalEventsFromRecords({ meetings = [], events = [] } = {}) {
  const projections = [
    ...(meetings ?? [])
      .filter((m) => m && m.state !== 'cancelled' && m.state !== 'deleted')
      .map((m) => projectMeetingSchedule(m, [])),
    ...(events ?? [])
      .filter((e) => e && e.occurrence_state !== 'cancelled' && e.occurrence_state !== 'deleted')
      .map((e) => projectEventSchedule(e))
  ];
  return professionalEventsFromProjections(projections);
}

/**
 * Load all agent calendar sources. Each loader is optional; missing loader → unavailable
 * (fail-visible: do not pretend free).
 *
 * @param {{
 *   from: string,
 *   to: string,
 *   loadLifeEvents?: (range) => Promise<unknown[]>,
 *   loadTeaching?: () => Promise<{ lessons?: unknown[], classes?: unknown[], scheduled_lessons?: unknown[] }>,
 *   loadKnowledgePages?: () => Promise<unknown[]>,
 *   loadTasks?: () => Promise<unknown[]>,
 *   loadWorkBlocks?: () => Promise<unknown[]>,
 *   loadProfessional?: () => Promise<{ meetings?: unknown[], events?: unknown[], projections?: unknown[] }>,
 *   loadIcalRows?: (range) => Promise<unknown[]>,
 * }} deps
 */
export async function loadAgentCalendarMerge(deps = {}) {
  const from = deps.from;
  const to = deps.to;
  if (!DATE_RE.test(from ?? '') || !DATE_RE.test(to ?? '')) {
    throw new TypeError('loadAgentCalendarMerge requires from/to YYYY-MM-DD');
  }
  const range = { from, to };
  const sourceStatus = emptySourceStatus();

  async function loadOne(id, fn) {
    if (typeof fn !== 'function') {
      sourceStatus[id] = { status: 'unavailable', count: 0, error: 'loader_missing' };
      return [];
    }
    try {
      const rows = await fn(range);
      const list = Array.isArray(rows) ? rows : [];
      sourceStatus[id] = { status: 'live', count: list.length, error: null };
      return list;
    } catch (error) {
      sourceStatus[id] = {
        status: 'unavailable',
        count: 0,
        error: error?.code || error?.message || 'load_failed'
      };
      return [];
    }
  }

  const [lifeRaw, teachingRaw, knowledgeRaw, tasksRaw, workBlocksRaw, professionalRaw, icalRaw] =
    await Promise.all([
      loadOne('life', deps.loadLifeEvents),
      typeof deps.loadTeaching === 'function'
        ? deps.loadTeaching().then((data) => {
            sourceStatus.teaching = { status: 'live', count: 0, error: null };
            return data;
          }).catch((error) => {
            sourceStatus.teaching = {
              status: 'unavailable',
              count: 0,
              error: error?.code || error?.message || 'load_failed'
            };
            return null;
          })
        : Promise.resolve(null).then(() => {
            sourceStatus.teaching = { status: 'unavailable', count: 0, error: 'loader_missing' };
            return null;
          }),
      loadOne('knowledge', deps.loadKnowledgePages),
      typeof deps.loadTasks === 'function'
        ? deps.loadTasks().then((rows) => {
            sourceStatus.tasks = { status: 'live', count: 0, error: null };
            return rows;
          }).catch((error) => {
            sourceStatus.tasks = {
              status: 'unavailable',
              count: 0,
              error: error?.code || error?.message || 'load_failed'
            };
            return [];
          })
        : Promise.resolve([]).then(() => {
            sourceStatus.tasks = { status: 'unavailable', count: 0, error: 'loader_missing' };
            return [];
          }),
      typeof deps.loadWorkBlocks === 'function'
        ? deps.loadWorkBlocks().catch(() => [])
        : Promise.resolve([]),
      typeof deps.loadProfessional === 'function'
        ? deps.loadProfessional().then((data) => {
            sourceStatus.professional = { status: 'live', count: 0, error: null };
            return data;
          }).catch((error) => {
            sourceStatus.professional = {
              status: 'unavailable',
              count: 0,
              error: error?.code || error?.message || 'load_failed'
            };
            return null;
          })
        : Promise.resolve(null).then(() => {
            sourceStatus.professional = { status: 'unavailable', count: 0, error: 'loader_missing' };
            return null;
          }),
      loadOne('feeds', deps.loadIcalRows)
    ]);

  const teachingEvents = teachingRaw
    ? teachingEventsFromCurriculum({
      lessons: teachingRaw.lessons ?? [],
      classes: teachingRaw.classes ?? [],
      scheduled_lessons: teachingRaw.scheduled_lessons ?? teachingRaw.scheduledLessons ?? []
    })
    : [];
  if (sourceStatus.teaching.status === 'live') {
    sourceStatus.teaching.count = teachingEvents.length;
  }

  const knowledgeEvents = knowledgeEventsFromPages(knowledgeRaw);
  if (sourceStatus.knowledge.status === 'live') {
    sourceStatus.knowledge.count = knowledgeEvents.length;
  }

  const tasksEvents = [
    ...tasksEventsFromTasks(tasksRaw ?? []),
    ...tasksEventsFromWorkBlocks(workBlocksRaw ?? [])
  ];
  if (sourceStatus.tasks.status === 'live') {
    sourceStatus.tasks.count = tasksEvents.length;
  }

  let professionalEvents = [];
  if (professionalRaw && sourceStatus.professional.status === 'live') {
    if (Array.isArray(professionalRaw.projections)) {
      professionalEvents = professionalEventsFromProjections(professionalRaw.projections);
    } else {
      professionalEvents = professionalEventsFromRecords({
        meetings: professionalRaw.meetings ?? [],
        events: professionalRaw.events ?? []
      });
    }
    sourceStatus.professional.count = professionalEvents.length;
  }

  const feedEvents = eventsFromCalendarFeeds(icalRaw ?? []);
  if (sourceStatus.feeds.status === 'live') {
    sourceStatus.feeds.count = feedEvents.length;
  }

  // Life events may already be Life rows; keep as-is.
  const lifeEvents = (lifeRaw ?? []).map((row) =>
    row?.record ? row : { path: row?.path || `life:${row?.id || 'x'}`, record: row, body: '' }
  );
  if (sourceStatus.life.status === 'live') {
    sourceStatus.life.count = lifeEvents.length;
  }

  const merged = mergeAgentCalendarSlots({
    lifeEvents,
    teachingEvents,
    knowledgeEvents,
    tasksEvents,
    professionalEvents,
    feedEvents,
    sourceStatus
  });

  return {
    ...merged,
    tasks: tasksRaw ?? [],
    from,
    to
  };
}

export function checkCalendarsSchema() {
  return {
    name: 'check_calendars',
    description:
      'List Adam’s full multi-hub calendar for a date window (Life + Teaching + Knowledge + Tasks + Professional + iCloud). Use before scheduling. Returns timed events with source labels; incomplete=true if a source failed (do not treat as free).',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD start (inclusive)' },
        days: { type: 'number', description: 'Number of days (1–14, default 3)' }
      },
      required: ['from'],
      additionalProperties: false
    }
  };
}

/** Shared hub time-grid math. Day/week hour lanes, snap, go-to-date. */

export const TIME_GRID_START_HOUR = 6;
export const TIME_GRID_END_HOUR = 22;
export const TIME_GRID_HOUR_PX = 52;
export const TIME_GRID_SNAP_MINUTES = 15;
export const TIME_GRID_DEFAULT_MINUTES = 60;

const TIME_RE = /^(?:[01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeHours(time) {
  if (typeof time !== 'string') return null;
  const match = TIME_RE.exec(time.trim());
  if (!match) return null;
  const [hours, minutes] = time.trim().split(':').map(Number);
  return hours + minutes / 60;
}

export function hoursToDueTime(hours) {
  const clamped = Math.min(Math.max(hours, 0), 23 + 59 / 60);
  let hour = Math.floor(clamped);
  let minute = Math.round((clamped - hour) * 60);
  if (minute === 60) {
    hour += 1;
    minute = 0;
  }
  return `${String(Math.min(hour, 23)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function snapHours(hours, minutes = TIME_GRID_SNAP_MINUTES) {
  const step = minutes / 60;
  const snapped = Math.round(hours / step) * step;
  return Math.min(Math.max(snapped, 0), 24 - step);
}

export function hoursFromOffset(
  offsetY,
  hourHeight = TIME_GRID_HOUR_PX,
  startHour = TIME_GRID_START_HOUR
) {
  return snapHours(startHour + offsetY / hourHeight);
}

export function timeGridHours() {
  return Array.from(
    { length: TIME_GRID_END_HOUR - TIME_GRID_START_HOUR },
    (_, index) => TIME_GRID_START_HOUR + index
  );
}

export function inTimeGridRange(hours) {
  return hours >= TIME_GRID_START_HOUR && hours < TIME_GRID_END_HOUR;
}

export function hourCaption(hour) {
  const h = ((hour + 11) % 12) + 1;
  return hour < 12 ? `${h} AM` : `${h} PM`;
}

export function clampSpan(start, minutes, minHours = 0.25) {
  const duration = Math.max((Number(minutes) || TIME_GRID_DEFAULT_MINUTES) / 60, minHours);
  return { start, end: Math.min(start + duration, 24) };
}

export function assignLanes(spans) {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds = [];
  const items = sorted.map(span => {
    let lane = laneEnds.findIndex(end => end <= span.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(span.end);
    } else {
      laneEnds[lane] = span.end;
    }
    return { ...span, lane };
  });
  return { items, laneCount: Math.max(1, laneEnds.length) };
}

export function splitDayItems(items, getTime = item => item.time) {
  const timed = [];
  const allDay = [];
  for (const item of items ?? []) {
    const start = parseTimeHours(getTime(item));
    if (start == null || !inTimeGridRange(start)) {
      allDay.push(item);
      continue;
    }
    timed.push(item);
  }
  return { timed, allDay };
}

export function layoutTimedBlocks(
  items,
  getTime = item => item.time,
  getDuration = item => item.durationMin ?? TIME_GRID_DEFAULT_MINUTES
) {
  const spans = (items ?? []).flatMap(item => {
    const start = parseTimeHours(getTime(item));
    if (start == null) return [];
    const span = clampSpan(start, getDuration(item));
    return [{ item, start: span.start, end: span.end, timed: true }];
  });
  const { items: laned, laneCount } = assignLanes(spans);
  return laned.map(block => ({
    item: block.item,
    start: block.start,
    end: block.end,
    lane: block.lane,
    lanes: Math.max(1, laneCount),
    timed: true
  }));
}

export function blockStyle(block, hourHeight = TIME_GRID_HOUR_PX, startHour = TIME_GRID_START_HOUR) {
  const top = (block.start - startHour) * hourHeight;
  const height = Math.max((block.end - block.start) * hourHeight, 28);
  const width = `calc((100% - 4px) / ${block.lanes})`;
  const left = `calc(${block.lane} * (100% - 4px) / ${block.lanes} + 2px)`;
  return {
    top: `${top}px`,
    height: `${height}px`,
    left,
    width
  };
}

export function formatBlockTime(block) {
  return `${formatDialTime(block.start)} – ${formatDialTime(block.end)}`;
}

export function formatDialTime(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const suffix = h < 12 || h === 24 ? 'am' : 'pm';
  const hour12 = ((h + 11) % 12) + 1;
  return m ? `${hour12}:${String(m).padStart(2, '0')}${suffix}` : `${hour12}${suffix}`;
}

export function nowLineOffset(
  now,
  startHour = TIME_GRID_START_HOUR,
  endHour = TIME_GRID_END_HOUR,
  hourHeight = TIME_GRID_HOUR_PX
) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return null;
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  if (hours < startHour || hours > endHour) return null;
  return (hours - startHour) * hourHeight;
}

export function parseGoToDate(raw, today = new Date()) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const next = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(next.getTime()) ? null : next;
  }
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (dmy) {
    const year = Number(dmy[3]);
    const next = new Date(year < 100 ? 2000 + year : year, Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(next.getTime()) ? null : next;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'today') return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (lower === 'tomorrow') {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  }
  return null;
}

export function dateKeyFromDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

import type { Task, TaskDomain } from '@/schemas/task';
import type { CalendarItem } from '@/domain/calendar';
import { toDateKey } from '@/domain/queries';

export type DialTint = 'blue' | 'sage' | 'peach' | 'gold' | 'lilac' | 'sand';

export type DialEvent = {
  id: string;
  title: string;
  start: number;
  end: number;
  cat: DialTint;
  timed: boolean;
  loc: string | null;
  taskId: string | null;
};

export const DIAL_FOCUS_ANGLE = 150;
export const DIAL_FALLBACK_MINUTES = 45;
export const DIAL_MIN_MINUTES = 15;
export const DIAL_PACK_START = 9;
export const DIAL_PACK_END = 21;

const DUE_TIME = /^(\d{1,2}):(\d{2})$/;

const DOMAIN_TINT: Record<string, DialTint> = {
  teaching: 'blue',
  life: 'gold',
  wedding: 'peach',
  health: 'lilac',
  other: 'sage'
};

/** Fallback legend when Properties has not loaded — mirrors the seed defaults. */
export const DIAL_LEGEND: Array<{ tint: DialTint; label: string }> = [
  { tint: 'blue', label: 'Teaching' },
  { tint: 'gold', label: 'Life' },
  { tint: 'peach', label: 'Wedding' },
  { tint: 'lilac', label: 'Health' },
  { tint: 'sage', label: 'Other' }
];

export function dialTintForDomain(domain: TaskDomain | string | null | undefined): DialTint {
  if (!domain) return 'sage';
  return DOMAIN_TINT[domain] ?? 'sage';
}

function titleCaseLabel(label: string): string {
  return label
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Dial colour key — only domains still in Tools → Properties. */
export function dialLegendForDomains(
  domains: Array<{ id: string; label: string }>
): Array<{ tint: DialTint; label: string }> {
  return domains.map((domain) => ({
    tint: dialTintForDomain(domain.id),
    label: titleCaseLabel(domain.label)
  }));
}

export function parseDueTimeHours(dueTime: string | null | undefined): number | null {
  if (!dueTime) return null;
  const match = DUE_TIME.exec(dueTime.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour + minute / 60;
}

export function clampDialSpan(start: number, minutes: number): { start: number; end: number } {
  const duration = Math.max(minutes, DIAL_MIN_MINUTES) / 60;
  const clampedStart = Math.min(Math.max(start, 0), 24 - duration);
  return { start: clampedStart, end: Math.min(clampedStart + duration, 24) };
}

export function eventMinutes(task: Pick<Task, 'estimated_duration'>): number {
  return task.estimated_duration && task.estimated_duration > 0
    ? task.estimated_duration
    : DIAL_FALLBACK_MINUTES;
}

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && a1 > b0;
}

function packStart(occupied: Array<{ start: number; end: number }>, minutes: number): number {
  const duration = Math.max(minutes, DIAL_MIN_MINUTES) / 60;
  const blocks = [...occupied].sort((a, b) => a.start - b.start);
  let cursor = DIAL_PACK_START;
  for (const block of blocks) {
    if (cursor + duration <= DIAL_PACK_END && !overlaps(cursor, cursor + duration, block.start, block.end)) {
      continue;
    }
    if (cursor < block.end && overlaps(cursor, cursor + duration, block.start, block.end)) {
      cursor = Math.max(cursor, block.end);
    }
  }
  if (cursor + duration <= DIAL_PACK_END) return cursor;
  return Math.min(DIAL_PACK_END, 24 - duration);
}

export function eventsFromTasks(tasks: Task[], dateKey: string): DialEvent[] {
  const dueToday = tasks.filter((task) => {
    if (task.status === 'done' || task.status === 'dead') return false;
    return task.due_date === dateKey;
  });
  const timed: DialEvent[] = [];
  const untimed: Task[] = [];
  for (const task of dueToday) {
    const start = parseDueTimeHours(task.due_time);
    if (start == null) {
      untimed.push(task);
      continue;
    }
    const span = clampDialSpan(start, eventMinutes(task));
    timed.push({
      id: `task:${task.id}`,
      title: task.title,
      start: span.start,
      end: span.end,
      cat: dialTintForDomain(task.domain),
      timed: true,
      loc: null,
      taskId: task.id
    });
  }
  const occupied = timed.map((event) => ({ start: event.start, end: event.end }));
  const packed = untimed.map((task) => {
    const minutes = eventMinutes(task);
    const start = packStart(occupied, minutes);
    const span = clampDialSpan(start, minutes);
    occupied.push({ start: span.start, end: span.end });
    return {
      id: `task:${task.id}`,
      title: task.title,
      start: span.start,
      end: span.end,
      cat: dialTintForDomain(task.domain),
      timed: false,
      loc: null,
      taskId: task.id
    } satisfies DialEvent;
  });
  return [...timed, ...packed].sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

export function eventsFromCalendarItems(items: CalendarItem[], dateKey: string): DialEvent[] {
  const dayItems = items.filter((item) => item.date_key === dateKey);
  const timed: DialEvent[] = [];
  const untimed: CalendarItem[] = [];
  for (const item of dayItems) {
    if (item.status === 'done' || item.status === 'dead') continue;
    const start = parseDueTimeHours(item.task?.due_time);
    const minutes = item.task ? eventMinutes(item.task) : DIAL_FALLBACK_MINUTES;
    if (start == null) {
      untimed.push(item);
      continue;
    }
    const span = clampDialSpan(start, minutes);
    timed.push({
      id: item.id,
      title: item.title,
      start: span.start,
      end: span.end,
      cat: item.kind === 'task' ? dialTintForDomain(item.domain) : item.kind === 'milestone' ? 'gold' : 'sand',
      timed: true,
      loc: item.project_title,
      taskId: item.task?.id ?? null
    });
  }
  const occupied = timed.map((event) => ({ start: event.start, end: event.end }));
  const packed = untimed.map((item) => {
    const minutes = item.task ? eventMinutes(item.task) : DIAL_FALLBACK_MINUTES;
    const start = packStart(occupied, minutes);
    const span = clampDialSpan(start, minutes);
    occupied.push({ start: span.start, end: span.end });
    return {
      id: item.id,
      title: item.title,
      start: span.start,
      end: span.end,
      cat: item.kind === 'task' ? dialTintForDomain(item.domain) : item.kind === 'milestone' ? 'gold' : 'sand',
      timed: false,
      loc: item.project_title,
      taskId: item.task?.id ?? null
    } satisfies DialEvent;
  });
  return [...timed, ...packed].sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

export function weekEventMap(
  items: CalendarItem[],
  days: Date[]
): Record<string, DialEvent[]> {
  return Object.fromEntries(days.map((day) => [toDateKey(day), eventsFromCalendarItems(items, toDateKey(day))]));
}

export function fisheyeTargetWidths(
  count: number,
  focusIndex: number | null,
  focusAngle = DIAL_FOCUS_ANGLE
): number[] {
  if (focusIndex == null) return Array.from({ length: count }, () => 360 / count);
  const rest = (360 - focusAngle) / (count - 1);
  return Array.from({ length: count }, (_, index) => (index === focusIndex ? focusAngle : rest));
}

export function fisheyeBoundaries(widths: number[], startDeg = -90): number[] {
  const boundaries = [startDeg];
  for (let i = 0; i < widths.length; i++) {
    boundaries.push(boundaries[i]! + widths[i]!);
  }
  return boundaries;
}

export function closestOccupiedHour(events: DialEvent[], startHour: number): number | null {
  const occupied = new Set<number>();
  for (const event of events) {
    const from = Math.max(0, Math.floor(event.start));
    const last = event.end <= from ? from : Math.ceil(event.end) - 1;
    const to = Math.min(23, last);
    for (let hour = from; hour <= to; hour++) occupied.add(hour);
  }
  if (!occupied.size) return null;
  for (let distance = 0; distance < 24; distance++) {
    const forward = (startHour + distance) % 24;
    if (occupied.has(forward)) return forward;
    const back = (startHour - distance + 24) % 24;
    if (occupied.has(back)) return back;
  }
  return null;
}

export function assignLanes<T extends { start: number; end: number }>(
  items: T[]
): { items: Array<T & { lane: number }>; laneCount: number } {
  const sorted = items.slice().sort((a, b) => a.start - b.start);
  const laneEnds: number[] = [];
  const withLanes = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    return { ...item, lane };
  });
  return { items: withLanes, laneCount: laneEnds.length };
}

export function hourOccupancy(events: DialEvent[]): Array<{ occ: number; cat: DialTint | null }> {
  return Array.from({ length: 24 }, (_, hour) => {
    let occ = 0;
    const byCategory: Partial<Record<DialTint, number>> = {};
    for (const event of events) {
      const overlap = Math.min(event.end, hour + 1) - Math.max(event.start, hour);
      if (overlap <= 0) continue;
      occ += overlap;
      byCategory[event.cat] = (byCategory[event.cat] ?? 0) + overlap;
    }
    let cat: DialTint | null = null;
    let best = 0;
    for (const [key, amount] of Object.entries(byCategory) as Array<[DialTint, number]>) {
      if (amount > best) {
        cat = key;
        best = amount;
      }
    }
    return { occ: Math.min(occ, 1), cat };
  });
}

export function eventsInHour(events: DialEvent[], hour: number): Array<DialEvent & {
  clipStart: number;
  clipEnd: number;
}> {
  return events
    .filter((event) => event.start < hour + 1 && event.end > hour)
    .map((event) => ({
      ...event,
      clipStart: Math.max(event.start, hour) - hour,
      clipEnd: Math.min(event.end, hour + 1) - hour
    }));
}

export function formatDialTime(dec: number): string {
  const hour = Math.floor(dec);
  const minute = Math.round((dec - hour) * 60);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute ? `${hour12}:${String(minute).padStart(2, '0')} ${ampm}` : `${hour12} ${ampm}`;
}

export function hourCaption(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function hourShort(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

export function formatClockTime(hour: number, minute: number): { time: string; ampm: string } {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return { time: `${hour12}:${String(minute).padStart(2, '0')}`, ampm };
}

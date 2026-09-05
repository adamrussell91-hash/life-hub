import type { CalendarItem } from '@/domain/calendar';
import {
  assignLanes,
  clampDialSpan,
  eventMinutes,
  formatDialTime,
  parseDueTimeHours
} from '@/domain/daily-dial';

export const TIME_GRID_START_HOUR = 6;
export const TIME_GRID_END_HOUR = 22;
export const TIME_GRID_HOUR_PX = 52;
export const TIME_GRID_SNAP_MINUTES = 15;
export const TIME_GRID_DEFAULT_MINUTES = 60;

export type TimeGridBlock = {
  item: CalendarItem;
  start: number;
  end: number;
  lane: number;
  lanes: number;
  timed: boolean;
};

export function hoursToDueTime(hours: number): string {
  const clamped = Math.min(Math.max(hours, 0), 23 + 59 / 60);
  let hour = Math.floor(clamped);
  let minute = Math.round((clamped - hour) * 60);
  if (minute === 60) {
    hour += 1;
    minute = 0;
  }
  return `${String(Math.min(hour, 23)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function snapHours(hours: number, minutes = TIME_GRID_SNAP_MINUTES): number {
  const step = minutes / 60;
  const snapped = Math.round(hours / step) * step;
  return Math.min(Math.max(snapped, 0), 24 - step);
}

export function hoursFromOffset(
  offsetY: number,
  hourHeight = TIME_GRID_HOUR_PX,
  startHour = TIME_GRID_START_HOUR
): number {
  return snapHours(startHour + offsetY / hourHeight);
}

export function timeGridHours(): number[] {
  return Array.from(
    { length: TIME_GRID_END_HOUR - TIME_GRID_START_HOUR },
    (_, index) => TIME_GRID_START_HOUR + index
  );
}

export function inTimeGridRange(hours: number): boolean {
  return hours >= TIME_GRID_START_HOUR && hours < TIME_GRID_END_HOUR;
}

export function splitDayItems(items: CalendarItem[]): {
  timed: CalendarItem[];
  allDay: CalendarItem[];
} {
  const timed: CalendarItem[] = [];
  const allDay: CalendarItem[] = [];
  for (const item of items) {
    const start = parseDueTimeHours(item.task?.due_time);
    if (start == null || !inTimeGridRange(start)) {
      allDay.push(item);
      continue;
    }
    timed.push(item);
  }
  return { timed, allDay };
}

export function layoutTimedBlocks(items: CalendarItem[]): TimeGridBlock[] {
  const spans = items.flatMap((item) => {
    const start = parseDueTimeHours(item.task?.due_time);
    if (start == null) return [];
    const minutes = item.task ? eventMinutes(item.task) : TIME_GRID_DEFAULT_MINUTES;
    const span = clampDialSpan(start, minutes);
    return [{ item, start: span.start, end: span.end, timed: true as const }];
  });
  const { items: laned, laneCount } = assignLanes(spans);
  return laned.map((block) => ({
    item: block.item,
    start: block.start,
    end: block.end,
    lane: block.lane,
    lanes: Math.max(1, laneCount),
    timed: true
  }));
}

export function blockStyle(block: TimeGridBlock): Record<string, string> {
  const top = (block.start - TIME_GRID_START_HOUR) * TIME_GRID_HOUR_PX;
  const height = Math.max((block.end - block.start) * TIME_GRID_HOUR_PX, 28);
  const width = `calc((100% - 4px) / ${block.lanes})`;
  const left = `calc(${block.lane} * (100% - 4px) / ${block.lanes} + 2px)`;
  return {
    top: `${top}px`,
    height: `${height}px`,
    left,
    width
  };
}

export function formatBlockTime(block: TimeGridBlock): string {
  return `${formatDialTime(block.start)} – ${formatDialTime(block.end)}`;
}

export function nowLineOffset(
  now: Date,
  startHour = TIME_GRID_START_HOUR,
  endHour = TIME_GRID_END_HOUR,
  hourHeight = TIME_GRID_HOUR_PX
): number | null {
  const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  if (hours < startHour || hours > endHour) return null;
  return (hours - startHour) * hourHeight;
}

export function parseGoToDate(raw: string, today = new Date()): Date | null {
  const trimmed = raw.trim();
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

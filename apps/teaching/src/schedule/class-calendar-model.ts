import {
  addCalendarDays,
  enumerateDateKeys,
  isCalendarDate,
  weekStartMonday
} from './calendar-dates';
import type { ScheduledLesson } from '@/schemas';

export type DeliveryStatus = ScheduledLesson['delivery_status'];

export interface CalendarDayLesson {
  scheduledId: string;
  lessonId: string;
  unitId: string;
  title: string;
  status: DeliveryStatus;
  classId?: string;
}

export interface ClassCalendarModel {
  today: string;
  selectedDate: string;
  viewMonth: string;
  monthLabel: string;
  monthDays: Array<{
    date: string;
    day: number;
    inMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
    lessons: CalendarDayLesson[];
  }>;
  dayLessons: CalendarDayLesson[];
}

type ScheduledInput = Pick<
  ScheduledLesson,
  'id' | 'lesson_id' | 'unit_id' | 'date' | 'delivery_status'
> & { schedule_order?: number; class_id?: string };

export function yearMonthFromDate(date: string): string {
  if (!isCalendarDate(date)) throw new TypeError(`Invalid calendar date: ${date}`);
  return date.slice(0, 7);
}

export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

export function monthGridRange(yearMonth: string): {
  start: string;
  end: string;
  first: string;
  last: string;
} {
  const first = `${yearMonth}-01`;
  if (!isCalendarDate(first)) throw new TypeError(`Invalid year-month: ${yearMonth}`);
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  const start = weekStartMonday(first);
  const end = addCalendarDays(weekStartMonday(last), 6);
  return { start, end, first, last };
}

function isYearMonth(value: string): boolean {
  return isCalendarDate(`${value}-01`);
}

function monthLabelFor(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

function toCalendarDayLesson(
  row: ScheduledInput,
  lessonTitles: Map<string, string>
): CalendarDayLesson {
  return {
    scheduledId: row.id,
    lessonId: row.lesson_id,
    unitId: row.unit_id,
    title: lessonTitles.get(row.lesson_id) ?? row.lesson_id,
    status: row.delivery_status,
    classId: row.class_id
  };
}

function compareScheduled(
  a: ScheduledInput,
  b: ScheduledInput,
  lessonTitles: Map<string, string>
): number {
  const orderDiff = (a.schedule_order ?? 0) - (b.schedule_order ?? 0);
  if (orderDiff !== 0) return orderDiff;
  const titleA = lessonTitles.get(a.lesson_id) ?? a.lesson_id;
  const titleB = lessonTitles.get(b.lesson_id) ?? b.lesson_id;
  return titleA.localeCompare(titleB);
}

export function buildClassCalendarModel(input: {
  scheduled: ScheduledInput[];
  lessonTitles: Map<string, string>;
  today: string;
  selectedDate: string;
  viewMonth?: string;
}): ClassCalendarModel {
  const today = input.today;
  const selectedDate = isCalendarDate(input.selectedDate) ? input.selectedDate : today;
  const viewMonth =
    input.viewMonth && isYearMonth(input.viewMonth)
      ? input.viewMonth
      : yearMonthFromDate(selectedDate);

  const { start, end, first, last } = monthGridRange(viewMonth);

  const lessonsByDate = new Map<string, CalendarDayLesson[]>();
  for (const row of [...input.scheduled].sort((a, b) =>
    compareScheduled(a, b, input.lessonTitles)
  )) {
    if (!isCalendarDate(row.date)) continue;
    const lesson = toCalendarDayLesson(row, input.lessonTitles);
    const existing = lessonsByDate.get(row.date);
    if (existing) existing.push(lesson);
    else lessonsByDate.set(row.date, [lesson]);
  }

  const monthDays = enumerateDateKeys(start, end).map((date) => ({
    date,
    day: Number(date.slice(8, 10)),
    inMonth: date >= first && date <= last,
    isToday: date === today,
    isSelected: date === selectedDate,
    lessons: lessonsByDate.get(date) ?? []
  }));

  return {
    today,
    selectedDate,
    viewMonth,
    monthLabel: monthLabelFor(viewMonth),
    monthDays,
    dayLessons: lessonsByDate.get(selectedDate) ?? []
  };
}
